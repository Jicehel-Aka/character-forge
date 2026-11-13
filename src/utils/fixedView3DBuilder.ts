import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';
import {
  extractAdaptiveForegroundMask,
  cleanAndNormalizeSingleView,
  detectOptimalHorizontalRotation,
  loadImageElement,
} from './viewSegmentation';

export type FixedViewObjectMethod = 'voxel_hull' | 'lathe' | 'extrude_relief';

export interface FixedViewIssue {
  id: string;
  angle: MultiViewAngle | 'global';
  severity: 'error' | 'warning' | 'info';
  code:
    | 'NO_VIEWS'
    | 'OPAQUE_BG'
    | 'SCALE_MISMATCH'
    | 'OFF_CENTER'
    | 'CLIPPED_EDGE'
    | 'MISSING_OPPOSITE'
    | 'LOW_CONTRAST'
    | 'NOISY_SILHOUETTE'
    | 'ROTATION_MISMATCH';
  title: string;
  description: string;
  autoFixLabel: string;
}

export interface FixedViewDiagnosticReport {
  score: number;
  readyCount: number;
  issues: FixedViewIssue[];
  viewStats: Partial<
    Record<
      MultiViewAngle,
      {
        width: number;
        height: number;
        coverage: number;
        hasTransparentBg: boolean;
        centerOffsetX: number;
        relHeight: number;
        meanLuma: number;
      }
    >
  >;
}

export interface FixedViewRepairOptions {
  removeBackground: boolean;
  despeckleAndFill: boolean;
  alignAndCenter: boolean;
  synthesizeMissingProfiles: boolean;
  synthesizeMissingBack: boolean;
  autoContrast: boolean;
  strongMeshyBg?: boolean;
}

export const DEFAULT_REPAIR_OPTIONS: FixedViewRepairOptions = {
  removeBackground: true,
  despeckleAndFill: true,
  alignAndCenter: true,
  synthesizeMissingProfiles: true,
  synthesizeMissingBack: false,
  autoContrast: true,
  strongMeshyBg: false,
};

export interface FixedView3DResult {
  mesh: THREE.Group;
  method: FixedViewObjectMethod;
  vertexCount: number;
  triangleCount: number;
  repairAppliedCount: number;
  exportObj: (name?: string) => string;
  exportGlbBlob: () => Promise<Blob>;
}


/**
 * Analyzes uploaded fixed views and produces a detailed error/warning diagnostic report.
 */
export async function analyzeFixedViews(
  views: Partial<Record<MultiViewAngle, string | null>>
): Promise<FixedViewDiagnosticReport> {
  const issues: FixedViewIssue[] = [];
  const viewStats: FixedViewDiagnosticReport['viewStats'] = {};
  const angles: MultiViewAngle[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'three_quarter'];

  const activeAngles = angles.filter((a) => Boolean(views[a]));
  if (activeAngles.length === 0) {
    return {
      score: 0,
      readyCount: 0,
      issues: [
        {
          id: 'no_views',
          angle: 'global',
          severity: 'error',
          code: 'NO_VIEWS',
          title: 'Aucune vue fixe chargée',
          description: 'Chargez au minimum une vue de face pour analyser et sculpter un objet 3D.',
          autoFixLabel: 'Charger une vue',
        },
      ],
      viewStats,
    };
  }

  let frontRelHeight: number | null = null;
  const workSize = 128;

  for (const angle of activeAngles) {
    const url = views[angle];
    if (!url) continue;

    try {
      const img = await loadImageElement(url);
      const canvas = document.createElement('canvas');
      canvas.width = workSize;
      canvas.height = workSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(img, 0, 0, workSize, workSize);
      const imgData = ctx.getImageData(0, 0, workSize, workSize).data;

      // Check transparency at corners
      const cornerAlpha =
        (imgData[3] +
          imgData[(workSize - 1) * 4 + 3] +
          imgData[(workSize - 1) * workSize * 4 + 3] +
          imgData[(workSize * workSize - 1) * 4 + 3]) /
        4;
      const hasTransparentBg = cornerAlpha < 30;

      const { mask } = extractAdaptiveForegroundMask(imgData, workSize, workSize, {
        targetAngle: angle,
      });
      let fgCount = 0;
      let minX = workSize;
      let maxX = 0;
      let minY = workSize;
      let maxY = 0;
      let lumaSum = 0;
      let isolatedCount = 0;

      for (let y = 0; y < workSize; y++) {
        for (let x = 0; x < workSize; x++) {
          const i = y * workSize + x;
          if (mask[i]) {
            fgCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const idx = i * 4;
            lumaSum += 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];

            // Neighbor count for noise detection
            let neighbors = 0;
            if (x > 0 && mask[i - 1]) neighbors++;
            if (x < workSize - 1 && mask[i + 1]) neighbors++;
            if (y > 0 && mask[i - workSize]) neighbors++;
            if (y < workSize - 1 && mask[i + workSize]) neighbors++;
            if (neighbors <= 1) isolatedCount++;
          }
        }
      }

      const coverage = fgCount / (workSize * workSize);
      const relHeight = maxY > minY ? (maxY - minY) / workSize : 0;
      const centerOffsetX = maxX > minX ? ((minX + maxX) / 2 - workSize / 2) / workSize : 0;
      const meanLuma = fgCount > 0 ? lumaSum / fgCount : 128;

      if (angle === 'front') frontRelHeight = relHeight;

      viewStats[angle] = {
        width: img.naturalWidth || workSize,
        height: img.naturalHeight || workSize,
        coverage,
        hasTransparentBg,
        centerOffsetX,
        relHeight,
        meanLuma,
      };

      if (!hasTransparentBg) {
        issues.push({
          id: `opaque_${angle}`,
          angle,
          severity: 'warning',
          code: 'OPAQUE_BG',
          title: `Fond opaque sur la vue "${angle}"`,
          description: 'Un fond non transparent peut créer des bords parasites lors de l’intersection 3D.',
          autoFixLabel: 'Détourage auto',
        });
      }

      if (Math.abs(centerOffsetX) > 0.08) {
        issues.push({
          id: `offset_${angle}`,
          angle,
          severity: 'warning',
          code: 'OFF_CENTER',
          title: `Sujet décentré sur "${angle}" (${Math.round(centerOffsetX * 100)}%)`,
          description: 'Le sujet n’est pas aligné sur l’axe vertical médian.',
          autoFixLabel: 'Recentrer auto',
        });
      }

      if (minX <= 1 || maxX >= workSize - 2 || minY <= 1 || maxY >= workSize - 2) {
        issues.push({
          id: `clip_${angle}`,
          angle,
          severity: 'warning',
          code: 'CLIPPED_EDGE',
          title: `Silhouette proche du bord sur "${angle}"`,
          description: 'Une partie de l’objet touche les limites du cadre.',
          autoFixLabel: 'Normaliser marges',
        });
      }

      if (meanLuma < 52) {
        issues.push({
          id: `dark_${angle}`,
          angle,
          severity: 'info',
          code: 'LOW_CONTRAST',
          title: `Vue "${angle}" sombre (luminosité ${Math.round(meanLuma)})`,
          description: 'Les détails de texture risquent d’être trop sombres dans le GLB final.',
          autoFixLabel: 'Éclaircir PBR',
        });
      }

      if (fgCount > 0 && isolatedCount / fgCount > 0.03) {
        issues.push({
          id: `noise_${angle}`,
          angle,
          severity: 'warning',
          code: 'NOISY_SILHOUETTE',
          title: `Bruit de pixels détecté sur "${angle}"`,
          description: 'Des îlots isolés peuvent produire des artefacts flottants dans le maillage.',
          autoFixLabel: 'Lissage & Despeckle',
        });
      }
    } catch {
      // Ignore single unreadable view
    }
  }

  // Cross-view scale check
  if (frontRelHeight !== null) {
    for (const angle of ['back', 'left', 'right'] as MultiViewAngle[]) {
      const stat = viewStats[angle];
      if (stat && Math.abs(stat.relHeight - frontRelHeight) > 0.14) {
        issues.push({
          id: `scale_${angle}`,
          angle,
          severity: 'error',
          code: 'SCALE_MISMATCH',
          title: `Écart d’échelle entre Face et "${angle}"`,
          description: `Hauteur relative ${Math.round(stat.relHeight * 100)}% contre ${Math.round(frontRelHeight * 100)}% pour la face.`,
          autoFixLabel: 'Harmoniser échelles',
        });
      }
    }
  }

  // Check if Top / Bottom need rotation to align with Front x Side footprint
  const sideUrl = views.right || views.left || null;
  const sideAngle: 'left' | 'right' = views.right ? 'right' : 'left';
  for (const hAngle of ['top', 'bottom'] as const) {
    const hUrl = views[hAngle];
    if (hUrl && (views.front || sideUrl)) {
      try {
        const neededRot = await detectOptimalHorizontalRotation(hUrl, views.front, sideUrl, sideAngle);
        if (neededRot !== 0) {
          issues.push({
            id: `rot_${hAngle}`,
            angle: hAngle,
            severity: 'error',
            code: 'ROTATION_MISMATCH',
            title: `Orientation de "${hAngle === 'top' ? 'Dessus' : 'Dessous'}" décalée de ${neededRot}°`,
            description: `La largeur d'épaules/profondeur ne correspond pas à la Face/Profil (risque d'écrasement 3D).`,
            autoFixLabel: `Pivoter ${neededRot}° auto`,
          });
        }
      } catch {
        // ignore rotation check failure
      }
    }
  }

  // Missing complementary views check
  if ((views.left && !views.right) || (!views.left && views.right)) {
    issues.push({
      id: 'missing_profile',
      angle: views.left ? 'right' : 'left',
      severity: 'info',
      code: 'MISSING_OPPOSITE',
      title: `Profil ${views.left ? 'Droit' : 'Gauche'} manquant`,
      description: 'Le système peut synthétiser le profil opposé par symétrie miroir.',
      autoFixLabel: 'Synthétiser par miroir',
    });
  }

  if (views.front && !views.back) {
    issues.push({
      id: 'missing_back',
      angle: 'back',
      severity: 'info',
      code: 'MISSING_OPPOSITE',
      title: 'Vue Arrière (Dos) absente',
      description: 'La géométrie utilisera une extrusion symétrique ou une projection miroir.',
      autoFixLabel: 'Générer dos miroir',
    });
  }

  const penalty = issues.reduce(
    (acc, it) => acc + (it.severity === 'error' ? 18 : it.severity === 'warning' ? 9 : 3),
    0
  );
  const score = Math.max(15, Math.min(100, 100 - penalty + Math.min(activeAngles.length, 4) * 3));

  return {
    score,
    readyCount: activeAngles.length,
    issues,
    viewStats,
  };
}

/**
 * Applies the selected automatic error corrections to all fixed views and returns repaired DataURLs.
 */
export async function repairFixedViews(
  views: Record<MultiViewAngle, string | null>,
  options: FixedViewRepairOptions = DEFAULT_REPAIR_OPTIONS
): Promise<{
  repairedViews: Record<MultiViewAngle, string | null>;
  actionsSummary: string[];
}> {
  const repaired: Record<MultiViewAngle, string | null> = { ...views };
  const actionsSummary: string[] = [];

  const verticalAngles: MultiViewAngle[] = ['front', 'back', 'left', 'right', 'three_quarter'];
  let bgRemoved = 0;

  const repairMode = options.strongMeshyBg ? 'strong' : 'auto';

  await Promise.all(
    verticalAngles.map(async (angle) => {
      const src = repaired[angle];
      if (!src) return;
      if (options.removeBackground || options.alignAndCenter || options.autoContrast || options.despeckleAndFill) {
        const res = await cleanAndNormalizeSingleView(src, angle, {
          removeBg: options.removeBackground,
          autoContrast: options.autoContrast,
          mode: repairMode,
        });
        repaired[angle] = res.dataUrl;
        if (res.hadOpaqueBg && options.removeBackground) bgRemoved++;
      }
    })
  );

  // Auto-rotate and normalize Top & Bottom views against Front x Side footprint
  const sideRef = repaired.right || repaired.left;
  const sideAngle: 'left' | 'right' = repaired.right ? 'right' : 'left';
  for (const hAngle of ['top', 'bottom'] as const) {
    const src = repaired[hAngle];
    if (!src) continue;
    let rot: 0 | 90 | 180 | 270 = 0;
    if (options.alignAndCenter && (repaired.front || sideRef)) {
      rot = await detectOptimalHorizontalRotation(src, repaired.front, sideRef, sideAngle);
      if (rot !== 0) {
        actionsSummary.push(
          `Vue "${hAngle === 'top' ? 'Dessus' : 'Dessous'}" pivotée automatiquement de ${rot}°`
        );
      }
    }
    const res = await cleanAndNormalizeSingleView(src, hAngle, {
      removeBg: options.removeBackground,
      rotateDeg: rot,
      autoContrast: options.autoContrast,
      mode: repairMode,
    });
    repaired[hAngle] = res.dataUrl;
    if (res.hadOpaqueBg && options.removeBackground) bgRemoved++;
  }

  if (options.removeBackground && bgRemoved > 0) {
    actionsSummary.unshift(`Fond détouré automatiquement sur ${bgRemoved} vue(s)`);
  }
  if (options.despeckleAndFill) actionsSummary.push('Filtrage du bruit et îlots isolés');
  if (options.alignAndCenter) actionsSummary.push('Recalage orthographique et alignement au sol unifiés (7%-93%)');

  // 5. Mirror missing profile
  if (options.synthesizeMissingProfiles) {
    const mirrorDataUrl = async (url: string) => {
      const img = await loadImageElement(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 512;
      c.height = img.naturalHeight || 512;
      const ctx = c.getContext('2d');
      if (!ctx) return url;
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    };

    if (repaired.left && !repaired.right) {
      repaired.right = await mirrorDataUrl(repaired.left);
      actionsSummary.push('Profil Droit synthétisé par symétrie miroir du Profil Gauche');
    } else if (repaired.right && !repaired.left) {
      repaired.left = await mirrorDataUrl(repaired.right);
      actionsSummary.push('Profil Gauche synthétisé par symétrie miroir du Profil Droit');
    }
  }

  if (options.synthesizeMissingBack && repaired.front && !repaired.back) {
    const img = await loadImageElement(repaired.front);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 512;
    c.height = img.naturalHeight || 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.filter = 'brightness(0.88)';
      ctx.drawImage(img, 0, 0);
      repaired.back = c.toDataURL('image/png');
      actionsSummary.push('Vue Arrière estimée par symétrie depuis la Face');
    }
  }

  return { repairedViews: repaired, actionsSummary };
}

interface SampledView {
  w: number;
  h: number;
  data: Uint8ClampedArray;
  mask: Uint8Array;
}

async function sampleViewGrid(
  url: string | null | undefined,
  size: number,
  angle?: MultiViewAngle
): Promise<SampledView | null> {
  if (!url) return null;
  const img = await loadImageElement(url);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const { mask } = extractAdaptiveForegroundMask(data, size, size, { targetAngle: angle });
  return { w: size, h: size, data, mask };
}

function getPixelColor(view: SampledView | null, nx: number, ny: number): [number, number, number] {
  if (!view) return [180, 190, 205];
  const px = Math.max(0, Math.min(view.w - 1, Math.round(nx * (view.w - 1))));
  const py = Math.max(0, Math.min(view.h - 1, Math.round(ny * (view.h - 1))));
  const i = (py * view.w + px) * 4;
  return [view.data[i], view.data[i + 1], view.data[i + 2]];
}

/**
 * Reconstructs a real sculpted 3D object mesh directly from 1 to 6 fixed views.
 */
export async function reconstructObjectFromFixedViews(params: {
  views: Partial<Record<MultiViewAngle, string | null>>;
  method?: FixedViewObjectMethod;
  resolution?: number;
  smoothPasses?: number;
  objectName?: string;
}): Promise<FixedView3DResult> {
  const {
    views,
    method = 'voxel_hull',
    resolution = 34,
    smoothPasses = 2,
    objectName = 'Objet_3D_Vues_Fixes',
  } = params;

  if (method !== 'lathe') {
    const { reconstructTrueCharacterFromViews } = await import('./trueMultiView3D');
    const sculpted = await reconstructTrueCharacterFromViews({
      views,
      characterName: objectName,
      gridY: Math.max(88, Math.min(128, Math.round(resolution * 2.5))),
      smoothPasses: Math.max(1, Math.min(2, smoothPasses)),
      reliefMode: method === 'extrude_relief',
    });

    return {
      mesh: sculpted.mesh as THREE.Group,
      method,
      vertexCount: sculpted.vertexCount,
      triangleCount: sculpted.triangleCount,
      repairAppliedCount: 0,
      exportObj: sculpted.exportObj,
      exportGlbBlob: sculpted.exportGlbBlob,
    };
  }

  const gridRes = 96;
  const frontV = await sampleViewGrid(views.front || views.three_quarter, gridRes, views.front ? 'front' : 'three_quarter');

  if (!frontV) {
    throw new Error('Chargez au moins une vue de Face avant de lancer la sculpture par Révolution 360°.');
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = objectName;

  {
    // 360° Revolution Object from Front View silhouette
    const points: THREE.Vector2[] = [];
    const profileColors: [number, number, number][] = [];
    const steps = 48;

    let minRow = frontV.h;
    let maxRow = 0;
    for (let y = 0; y < frontV.h; y++) {
      for (let x = 0; x < frontV.w; x++) {
        if (frontV.mask[y * frontV.w + x]) {
          if (y < minRow) minRow = y;
          if (y > maxRow) maxRow = y;
        }
      }
    }
    if (maxRow <= minRow) {
      minRow = 8;
      maxRow = frontV.h - 8;
    }

    const totalH = 1.4;
    points.push(new THREE.Vector2(0, 0));
    profileColors.push([140, 150, 165]);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const py = Math.round(maxRow - t * (maxRow - minRow));
      let minX = frontV.w;
      let maxX = -1;
      for (let x = 0; x < frontV.w; x++) {
        if (frontV.mask[py * frontV.w + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      const radius = maxX >= minX ? ((maxX - minX) / frontV.w) * 0.72 : 0.02;
      points.push(new THREE.Vector2(Math.max(0.015, radius), t * totalH));

      const midX = maxX >= minX ? (minX + maxX) / 2 / frontV.w : 0.5;
      profileColors.push(getPixelColor(frontV, midX, py / frontV.h));
    }

    points.push(new THREE.Vector2(0, totalH));
    profileColors.push(profileColors[profileColors.length - 1]);

    const latheGeo = new THREE.LatheGeometry(points, 40);
    latheGeo.computeVertexNormals();

    // Vertex color from silhouette rows
    const pos = latheGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const vy = THREE.MathUtils.clamp(pos.getY(i) / totalH, 0, 1);
      const rowIdx = Math.min(profileColors.length - 1, Math.round(vy * (profileColors.length - 1)));
      const [r, g, b] = profileColors[rowIdx];
      colors[i * 3] = r / 255;
      colors[i * 3 + 1] = g / 255;
      colors[i * 3 + 2] = b / 255;
    }
    latheGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.25,
    });
    const mesh = new THREE.Mesh(latheGeo, mat);
    mesh.name = `${objectName}_LatheMesh`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootGroup.add(mesh);
  }

  // Ground and center the reconstructed mesh neatly at y = 0
  groundAndCenterGroup(rootGroup);

  let vertexCount = 0;
  let triangleCount = 0;
  rootGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const g = (child as THREE.Mesh).geometry;
      if (g.attributes.position) vertexCount += g.attributes.position.count;
      if (g.index) triangleCount += g.index.count / 3;
      else if (g.attributes.position) triangleCount += g.attributes.position.count / 3;
    }
  });

  return {
    mesh: rootGroup,
    method,
    vertexCount: Math.round(vertexCount),
    triangleCount: Math.round(triangleCount),
    repairAppliedCount: 0,
    exportObj: (name = objectName) => exportGroupToObjString(rootGroup, name),
    exportGlbBlob: () => exportGroupToGlbBlob(rootGroup),
  };
}

/**
 * Grounds and centers any THREE.Group so its bottom rests cleanly on y = 0 and X/Z are centered at (0, 0).
 */
export function groundAndCenterGroup(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  group.children.forEach((child) => {
    child.position.x -= center.x;
    child.position.z -= center.z;
    child.position.y -= box.min.y;
  });
  group.updateMatrixWorld(true);
}

/**
 * Applies Laplacian smoothing on a THREE.BufferGeometry directly (post-synthesis mesh repair).
 */
export function smoothGroupGeometry(group: THREE.Group, passes = 1) {
  group.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const geo = (child as THREE.Mesh).geometry;
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    if (!pos || !idx) return;

    const nVerts = pos.count;
    const neighbors: Set<number>[] = Array.from({ length: nVerts }, () => new Set<number>());
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      neighbors[a].add(b);
      neighbors[a].add(c);
      neighbors[b].add(a);
      neighbors[b].add(c);
      neighbors[c].add(a);
      neighbors[c].add(b);
    }

    const tmp = new Float32Array(nVerts * 3);
    for (let p = 0; p < passes; p++) {
      for (let v = 0; v < nVerts; v++) {
        const nb = neighbors[v];
        if (nb.size === 0) {
          tmp[v * 3] = pos.getX(v);
          tmp[v * 3 + 1] = pos.getY(v);
          tmp[v * 3 + 2] = pos.getZ(v);
          continue;
        }
        let sx = 0, sy = 0, sz = 0;
        nb.forEach((n) => {
          sx += pos.getX(n);
          sy += pos.getY(n);
          sz += pos.getZ(n);
        });
        sx /= nb.size;
        sy /= nb.size;
        sz /= nb.size;
        tmp[v * 3] = pos.getX(v) * 0.6 + sx * 0.4;
        tmp[v * 3 + 1] = pos.getY(v) * 0.6 + sy * 0.4;
        tmp[v * 3 + 2] = pos.getZ(v) * 0.6 + sz * 0.4;
      }
      for (let v = 0; v < nVerts; v++) {
        pos.setXYZ(v, tmp[v * 3], tmp[v * 3 + 1], tmp[v * 3 + 2]);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
}

export function exportGroupToObjString(group: THREE.Group, name = 'Model_3D'): string {
  let out = `# Wavefront 3D Object (${name})\no ${name}\n`;
  let offset = 1;
  group.updateMatrixWorld(true);

  group.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry.clone().toNonIndexed();
    geo.applyMatrix4(mesh.matrixWorld);
    const pos = geo.getAttribute('position');
    if (!pos) return;

    out += `\ng ${mesh.name || 'Part'}\n`;
    for (let i = 0; i < pos.count; i++) {
      out += `v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}\n`;
    }
    for (let i = 0; i < pos.count; i += 3) {
      out += `f ${offset + i} ${offset + i + 1} ${offset + i + 2}\n`;
    }
    offset += pos.count;
    geo.dispose();
  });

  return out;
}

export async function exportGroupToGlbBlob(group: THREE.Group): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      group,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          resolve(new Blob([gltf], { type: 'model/gltf-binary' }));
        } else {
          resolve(new Blob([JSON.stringify(gltf)], { type: 'application/json' }));
        }
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}
