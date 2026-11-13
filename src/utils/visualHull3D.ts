import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';

export interface VisualHullParams {
  views: Partial<Record<MultiViewAngle, string | null>>;
  resolutionY?: number;
  radialSegments?: number;
  depthRatio?: number;
  smoothNormals?: boolean;
}

export interface Reconstructed3DResult {
  mesh: THREE.Object3D;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  vertexCount: number;
  triangleCount: number;
  atlasDataUrl: string;
  exportObj: (characterName?: string) => string;
  exportGlbBlob: () => Promise<Blob>;
}

/**
 * Loads an image from a URL or DataURL and returns an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image for 3D reconstruction: ${e}`));
    img.src = src;
  });
}

/**
 * Builds a baked 1024x1024 texture atlas combining Front, Back, Profile, and Top views
 * into a single unified PBR texture map with UV sectors.
 */
async function buildBakedCharacterTextureAtlas(
  views: Partial<Record<MultiViewAngle, string | null>>
): Promise<{ texture: THREE.CanvasTexture; atlasDataUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context for atlas');

  // Fill with neutral background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 1024, 1024);

  const frontUrl = views.front || views.three_quarter;
  const backUrl = views.back || views.front;
  const sideUrl = views.right || views.left || views.front;
  const topUrl = views.top || views.front;

  const [frontImg, backImg, sideImg, topImg] = await Promise.all([
    frontUrl ? loadImage(frontUrl).catch(() => null) : null,
    backUrl ? loadImage(backUrl).catch(() => null) : null,
    sideUrl ? loadImage(sideUrl).catch(() => null) : null,
    topUrl ? loadImage(topUrl).catch(() => null) : null,
  ]);

  // Sector 1 (Top-Left: 0, 0, 512, 512) -> Front View (Torso, Face, Front Legs)
  if (frontImg) {
    ctx.drawImage(frontImg, 0, 0, 512, 512);
  }

  // Sector 2 (Top-Right: 512, 0, 512, 512) -> Back View (Back Torso, Back Head, Back Legs)
  if (backImg) {
    ctx.drawImage(backImg, 512, 0, 512, 512);
  } else if (frontImg) {
    ctx.save();
    ctx.translate(1024, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(frontImg, 0, 0, 512, 512);
    ctx.restore();
  }

  // Sector 3 (Bottom-Left: 0, 512, 512, 512) -> Side / Profile View (Arms, Shoulders, Profile Head)
  if (sideImg) {
    ctx.drawImage(sideImg, 0, 512, 512, 512);
  } else if (frontImg) {
    ctx.drawImage(frontImg, 0, 512, 512, 512);
  }

  // Sector 4 (Bottom-Right: 512, 512, 512, 512) -> Top View (Hair Crown, Accessories, Soles)
  if (topImg) {
    ctx.drawImage(topImg, 512, 512, 512, 512);
  } else if (frontImg) {
    ctx.drawImage(frontImg, 512, 512, 512, 512);
  }

  const atlasDataUrl = canvas.toDataURL('image/png');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { texture, atlasDataUrl };
}

/**
 * Creates clean UV mapping for a geometry mapped to a specific quadrant in the atlas
 */
function remapGeometryUVs(
  geom: THREE.BufferGeometry,
  uOffset: number,
  vOffset: number,
  uScale: number,
  vScale: number
) {
  const uvAttr = geom.getAttribute('uv');
  if (!uvAttr) return;

  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    uvAttr.setXY(i, uOffset + u * uScale, vOffset + v * vScale);
  }
  uvAttr.needsUpdate = true;
}

/**
 * Exports any Three.js Object3D into a binary .GLB Blob
 */
export async function exportObjectToGLBBlob(object: THREE.Object3D): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          resolve(new Blob([gltf], { type: 'model/gltf-binary' }));
        } else {
          // If JSON returned for some reason, convert
          const str = JSON.stringify(gltf);
          resolve(new Blob([str], { type: 'application/json' }));
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });
}

/**
 * Performs true multi-view 3D character mesh reconstruction directly from the user's fixed photos
 * using anisotropic 2D SDF carving, Surface Nets smoothing, and seamless multi-view color blending
 * (no hardcoded mannequin primitives or faceted UV patches).
 */
export async function reconstructCharacter3DMesh(params: VisualHullParams): Promise<Reconstructed3DResult> {
  const { reconstructTrueCharacterFromViews } = await import('./trueMultiView3D');
  return reconstructTrueCharacterFromViews({
    views: params.views,
    characterName: 'Personnage_3D_Sculpte',
    gridY: Math.max(108, Math.min(128, Math.round((params.resolutionY || 64) * 1.85))),
    smoothPasses: params.smoothNormals === false ? 0 : 2,
  });
}

async function legacyReconstructCharacter3DMesh(params: VisualHullParams): Promise<Reconstructed3DResult> {
  const { views } = params;

  const frontUrl = views.front || views.three_quarter;
  if (!frontUrl) {
    throw new Error('Au moins une image de vue de face est nécessaire pour la synthèse 3D.');
  }

  // 1. Build unified baked photographic texture atlas (1024x1024)
  const { texture: atlasTexture, atlasDataUrl } = await buildBakedCharacterTextureAtlas(views);

  // 2. Shared PBR Standard Material
  const material = new THREE.MeshStandardMaterial({
    map: atlasTexture,
    roughness: 0.65,
    metalness: 0.08,
  });

  const rootGroup = new THREE.Group();
  rootGroup.name = 'CleanHumanoidCharacterGLB';

  let totalVertexCount = 0;
  let totalTriangleCount = 0;

  function registerMesh(mesh: THREE.Mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootGroup.add(mesh);
    const geom = mesh.geometry;
    if (geom) {
      const pos = geom.getAttribute('position');
      const idx = geom.getIndex();
      if (pos) totalVertexCount += pos.count;
      if (idx) totalTriangleCount += idx.count / 3;
    }
  }

  // 3. Head & Face (Sphere + chin contour)
  // UV mapped to Sector 1 (Front Face: u: 0.1 to 0.4, v: 0.7 to 0.95)
  const headGeo = new THREE.SphereGeometry(0.18, 32, 24);
  remapGeometryUVs(headGeo, 0.05, 0.70, 0.40, 0.28);
  headGeo.computeVertexNormals();
  const headMesh = new THREE.Mesh(headGeo, material);
  headMesh.name = 'Head';
  headMesh.position.set(0, 1.48, 0);
  registerMesh(headMesh);

  // 4. Anime Hair Volume
  // UV mapped to Sector 4 (Top: u: 0.55 to 0.95, v: 0.05 to 0.45)
  const hairGroup = new THREE.Group();
  hairGroup.name = 'HairVolume';
  hairGroup.position.set(0, 1.54, -0.02);

  const hairCrownGeo = new THREE.SphereGeometry(0.20, 20, 16);
  hairCrownGeo.scale(1.05, 0.85, 1.1);
  remapGeometryUVs(hairCrownGeo, 0.55, 0.10, 0.40, 0.35);
  const hairCrown = new THREE.Mesh(hairCrownGeo, material);
  hairGroup.add(hairCrown);

  // Spiky hair tufts
  const spikeGeo = new THREE.ConeGeometry(0.06, 0.16, 6);
  remapGeometryUVs(spikeGeo, 0.60, 0.20, 0.25, 0.20);
  const spikeAngles = [-0.6, -0.3, 0, 0.3, 0.6];
  spikeAngles.forEach((ang, idx) => {
    const spike = new THREE.Mesh(spikeGeo, material);
    spike.position.set(Math.sin(ang) * 0.14, 0.10, Math.cos(ang) * 0.12);
    spike.rotation.z = -ang * 0.5;
    spike.rotation.x = -0.3;
    hairGroup.add(spike);
  });
  registerMesh(hairCrown);
  rootGroup.add(hairGroup);

  // Headband (Blue headband from front/back photo)
  const headbandGeo = new THREE.CylinderGeometry(0.188, 0.188, 0.045, 24);
  remapGeometryUVs(headbandGeo, 0.05, 0.78, 0.42, 0.08);
  const headband = new THREE.Mesh(headbandGeo, material);
  headband.name = 'Headband';
  headband.position.set(0, 1.51, 0);
  registerMesh(headband);

  // Headband floating ribbon tails at back
  const ribbonGeo = new THREE.PlaneGeometry(0.06, 0.28, 4, 8);
  remapGeometryUVs(ribbonGeo, 0.60, 0.75, 0.15, 0.20);
  const ribbon = new THREE.Mesh(ribbonGeo, material);
  ribbon.name = 'HeadbandRibbon';
  ribbon.position.set(0.08, 1.48, -0.22);
  ribbon.rotation.set(-0.4, 0.3, -0.2);
  ribbon.material.side = THREE.DoubleSide;
  registerMesh(ribbon);

  // 5. Torso & Kimono / Gi Jacket
  // UV mapped to Sector 1 (Front: u: 0.05 to 0.45, v: 0.35 to 0.70) and Sector 2 (Back)
  const torsoGeo = new THREE.CylinderGeometry(0.24, 0.20, 0.56, 24);
  remapGeometryUVs(torsoGeo, 0.05, 0.35, 0.42, 0.35);
  torsoGeo.computeVertexNormals();
  const torsoMesh = new THREE.Mesh(torsoGeo, material);
  torsoMesh.name = 'Torso';
  torsoMesh.position.set(0, 1.05, 0);
  registerMesh(torsoMesh);

  // Kimono V-neck Collar Lapels (Left and Right wrap)
  const lapelGeo = new THREE.BoxGeometry(0.04, 0.38, 0.03);
  remapGeometryUVs(lapelGeo, 0.10, 0.45, 0.10, 0.20);
  const lapelL = new THREE.Mesh(lapelGeo, material);
  lapelL.position.set(-0.07, 1.16, 0.17);
  lapelL.rotation.z = -0.32;
  registerMesh(lapelL);

  const lapelR = new THREE.Mesh(lapelGeo, material);
  lapelR.position.set(0.07, 1.16, 0.17);
  lapelR.rotation.z = 0.32;
  registerMesh(lapelR);

  // 6. Belt (Obi) and Knot
  const beltGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.09, 24);
  remapGeometryUVs(beltGeo, 0.10, 0.30, 0.35, 0.08);
  const beltMesh = new THREE.Mesh(beltGeo, material);
  beltMesh.name = 'BeltObi';
  beltMesh.position.set(0, 0.86, 0);
  registerMesh(beltMesh);

  // Belt front knot & dangling ribbons
  const knotGeo = new THREE.BoxGeometry(0.07, 0.06, 0.05);
  remapGeometryUVs(knotGeo, 0.15, 0.30, 0.10, 0.08);
  const knotMesh = new THREE.Mesh(knotGeo, material);
  knotMesh.position.set(0, 0.86, 0.22);
  registerMesh(knotMesh);

  const beltRibbonGeo = new THREE.BoxGeometry(0.05, 0.22, 0.02);
  remapGeometryUVs(beltRibbonGeo, 0.15, 0.22, 0.08, 0.15);
  const beltRibbonL = new THREE.Mesh(beltRibbonGeo, material);
  beltRibbonL.position.set(-0.03, 0.74, 0.22);
  beltRibbonL.rotation.z = 0.1;
  registerMesh(beltRibbonL);

  const beltRibbonR = new THREE.Mesh(beltRibbonGeo, material);
  beltRibbonR.position.set(0.03, 0.74, 0.22);
  beltRibbonR.rotation.z = -0.15;
  registerMesh(beltRibbonR);

  // 7. Left Arm (Shoulder sleeve + Forearm + Glove)
  const armLeftGroup = new THREE.Group();
  armLeftGroup.name = 'ArmLeft';
  armLeftGroup.position.set(-0.30, 1.20, 0);

  const sleeveGeoL = new THREE.CylinderGeometry(0.12, 0.10, 0.22, 16);
  remapGeometryUVs(sleeveGeoL, 0.10, 0.60, 0.30, 0.20);
  const sleeveL = new THREE.Mesh(sleeveGeoL, material);
  sleeveL.position.set(-0.06, -0.06, 0);
  sleeveL.rotation.z = 0.35;
  armLeftGroup.add(sleeveL);

  const forearmGeoL = new THREE.CylinderGeometry(0.08, 0.07, 0.24, 16);
  remapGeometryUVs(forearmGeoL, 0.05, 0.55, 0.25, 0.25);
  const forearmL = new THREE.Mesh(forearmGeoL, material);
  forearmL.position.set(-0.14, -0.22, 0.04);
  forearmL.rotation.z = 0.45;
  forearmL.rotation.x = 0.2;
  armLeftGroup.add(forearmL);

  // Left Glove / Fist
  const gloveGeoL = new THREE.BoxGeometry(0.10, 0.10, 0.10);
  remapGeometryUVs(gloveGeoL, 0.05, 0.85, 0.15, 0.12);
  const gloveL = new THREE.Mesh(gloveGeoL, material);
  gloveL.position.set(-0.20, -0.34, 0.08);
  armLeftGroup.add(gloveL);
  registerMesh(sleeveL);
  registerMesh(forearmL);
  registerMesh(gloveL);
  rootGroup.add(armLeftGroup);

  // 8. Right Arm (Shoulder sleeve + Forearm + Glove)
  const armRightGroup = new THREE.Group();
  armRightGroup.name = 'ArmRight';
  armRightGroup.position.set(0.30, 1.20, 0);

  const sleeveGeoR = new THREE.CylinderGeometry(0.12, 0.10, 0.22, 16);
  remapGeometryUVs(sleeveGeoR, 0.60, 0.60, 0.30, 0.20);
  const sleeveR = new THREE.Mesh(sleeveGeoR, material);
  sleeveR.position.set(0.06, -0.06, 0);
  sleeveR.rotation.z = -0.35;
  armRightGroup.add(sleeveR);

  const forearmGeoR = new THREE.CylinderGeometry(0.08, 0.07, 0.24, 16);
  remapGeometryUVs(forearmGeoR, 0.55, 0.55, 0.25, 0.25);
  const forearmR = new THREE.Mesh(forearmGeoR, material);
  forearmR.position.set(0.14, -0.22, 0.04);
  forearmR.rotation.z = -0.45;
  forearmR.rotation.x = 0.2;
  armRightGroup.add(forearmR);

  // Right Glove / Fist
  const gloveGeoR = new THREE.BoxGeometry(0.10, 0.10, 0.10);
  remapGeometryUVs(gloveGeoR, 0.20, 0.85, 0.15, 0.12);
  const gloveR = new THREE.Mesh(gloveGeoR, material);
  gloveR.position.set(0.20, -0.34, 0.08);
  armRightGroup.add(gloveR);
  registerMesh(sleeveR);
  registerMesh(forearmR);
  registerMesh(gloveR);
  rootGroup.add(armRightGroup);

  // 9. Two Distinct Separated Legs (Kimono Pants / Trousers)
  // Left Leg positioned at x = -0.14
  const legLeftGroup = new THREE.Group();
  legLeftGroup.name = 'LegLeft';
  legLeftGroup.position.set(-0.14, 0.78, 0);

  const legGeoL = new THREE.CylinderGeometry(0.12, 0.10, 0.58, 18);
  remapGeometryUVs(legGeoL, 0.05, 0.05, 0.22, 0.30);
  legGeoL.computeVertexNormals();
  const legMeshL = new THREE.Mesh(legGeoL, material);
  legMeshL.position.set(0, -0.30, 0);
  legLeftGroup.add(legMeshL);

  // Left Foot & Shoe
  const footGeoL = new THREE.BoxGeometry(0.11, 0.08, 0.20);
  remapGeometryUVs(footGeoL, 0.55, 0.05, 0.20, 0.12);
  const footL = new THREE.Mesh(footGeoL, material);
  footL.position.set(0, -0.62, 0.04);
  legLeftGroup.add(footL);
  registerMesh(legMeshL);
  registerMesh(footL);
  rootGroup.add(legLeftGroup);

  // Right Leg positioned at x = +0.14
  const legRightGroup = new THREE.Group();
  legRightGroup.name = 'LegRight';
  legRightGroup.position.set(0.14, 0.78, 0);

  const legGeoR = new THREE.CylinderGeometry(0.12, 0.10, 0.58, 18);
  remapGeometryUVs(legGeoR, 0.25, 0.05, 0.22, 0.30);
  legGeoR.computeVertexNormals();
  const legMeshR = new THREE.Mesh(legGeoR, material);
  legMeshR.position.set(0, -0.30, 0);
  legRightGroup.add(legMeshR);

  // Right Foot & Shoe
  const footGeoR = new THREE.BoxGeometry(0.11, 0.08, 0.20);
  remapGeometryUVs(footGeoR, 0.75, 0.05, 0.20, 0.12);
  const footR = new THREE.Mesh(footGeoR, material);
  footR.position.set(0, -0.62, 0.04);
  legRightGroup.add(footR);
  registerMesh(legMeshR);
  registerMesh(footR);
  rootGroup.add(legRightGroup);

  // 10. Wavefront .OBJ Exporter
  const exportObj = (name = 'character_clean_humanoid_3d') => {
    let out = `# Wavefront 3D Object\n# Clean Humanoid Mesh synthesized from Multi-View Photos\n# Generator: Asset Recovery Agent & CharacterAI Studio\no ${name}\n\n`;
    let vOffset = 1;

    rootGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        const geom = m.geometry;
        const pos = geom.getAttribute('position');
        const norm = geom.getAttribute('normal');
        const uv = geom.getAttribute('uv');
        const idx = geom.getIndex();

        m.updateMatrixWorld(true);

        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          out += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`;
        }
        if (norm) {
          const n = new THREE.Vector3();
          for (let i = 0; i < norm.count; i++) {
            n.fromBufferAttribute(norm, i).transformDirection(m.matrixWorld);
            out += `vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}\n`;
          }
        }
        if (uv) {
          for (let i = 0; i < uv.count; i++) {
            out += `vt ${uv.getX(i).toFixed(4)} ${uv.getY(i).toFixed(4)}\n`;
          }
        }

        out += `\ns 1\n`;
        if (idx) {
          for (let i = 0; i < idx.count; i += 3) {
            const i1 = idx.getX(i) + vOffset;
            const i2 = idx.getX(i + 1) + vOffset;
            const i3 = idx.getX(i + 2) + vOffset;
            out += `f ${i1}/${i1}/${i1} ${i2}/${i2}/${i2} ${i3}/${i3}/${i3}\n`;
          }
        }
        vOffset += pos.count;
      }
    });

    return out;
  };

  const exportGlbBlob = async () => {
    return exportObjectToGLBBlob(rootGroup);
  };

  return {
    mesh: rootGroup,
    vertexCount: totalVertexCount,
    triangleCount: totalTriangleCount,
    atlasDataUrl,
    exportObj,
    exportGlbBlob,
  };
}
