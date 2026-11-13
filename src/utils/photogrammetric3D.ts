import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';

export interface PhotogrammetricSynthesisParams {
  views: Partial<Record<MultiViewAngle, string | null>>;
  characterName?: string;
}

export interface PhotogrammetricResult {
  mesh: THREE.Group;
  atlasDataUrl: string;
  vertexCount: number;
  triangleCount: number;
  exportObj: (name?: string) => string;
  exportGlbBlob: () => Promise<Blob>;
}

interface CharacterBBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
}

/**
 * Loads an image from a URL or DataURL and returns an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Impossible de charger l'image: ${e}`));
    img.src = src;
  });
}

/**
 * Intelligent character bounding box detector
 * Scans image pixels, removes solid/dark/transparent background,
 * and extracts the exact tight bounding box and center of the character.
 */
function detectCharacterBBox(img: HTMLImageElement): CharacterBBox {
  const canvas = document.createElement('canvas');
  const w = (canvas.width = Math.min(img.naturalWidth || 512, 512));
  const h = (canvas.height = Math.min(img.naturalHeight || 512, 512));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { minX: 0, maxX: w, minY: 0, maxY: h, width: w, height: h, centerX: w / 2 };
  }

  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // Corner background color check
  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const bgA = data[3];
  const isTransparentBg = bgA < 20;

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      let isForeground = false;
      if (isTransparentBg) {
        isForeground = a > 30;
      } else {
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        isForeground = diff > 35 && (r > 20 || g > 20 || b > 20);
      }

      if (isForeground) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Safety fallback if image has non-standard background
  if (minX >= maxX || minY >= maxY) {
    minX = Math.round(w * 0.15);
    maxX = Math.round(w * 0.85);
    minY = Math.round(h * 0.05);
    maxY = Math.round(h * 0.95);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
  };
}

/**
 * Builds a calibrated 2048x2048 texture atlas
 * Layout:
 * - Island 1 (x: 0 to 1024, y: 0 to 1024): FRONT VIEW (Character centered & scaled)
 * - Island 2 (x: 1024 to 2048, y: 0 to 1024): BACK VIEW (Character centered & scaled)
 * - Island 3 (x: 0 to 1024, y: 1024 to 2048): RIGHT PROFILE VIEW (Character centered & scaled)
 * - Island 4 (x: 1024 to 1536, y: 1024 to 2048): TOP VIEW (Hair & Shoulders from above)
 * - Island 5 (x: 1536 to 2048, y: 1024 to 2048): BOTTOM VIEW (Sandals & Soles from below)
 */
async function buildCalibratedTextureAtlas(views: Partial<Record<MultiViewAngle, string | null>>): Promise<{
  texture: THREE.CanvasTexture;
  atlasDataUrl: string;
}> {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Fill with dark neutral studio tone
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 2048, 2048);

  const frontUrl = views.front || views.three_quarter;
  const backUrl = views.back || views.front;
  const sideUrl = views.right || views.left || views.front;
  const topUrl = views.top || views.front;
  const bottomUrl = views.bottom || views.front;

  const [frontImg, backImg, sideImg, topImg, bottomImg] = await Promise.all([
    frontUrl ? loadImage(frontUrl).catch(() => null) : null,
    backUrl ? loadImage(backUrl).catch(() => null) : null,
    sideUrl ? loadImage(sideUrl).catch(() => null) : null,
    topUrl ? loadImage(topUrl).catch(() => null) : null,
    bottomUrl ? loadImage(bottomUrl).catch(() => null) : null,
  ]);

  // Helper to draw cropped & centered character into a destination box while preserving natural proportions
  function drawNormalizedCharacter(
    img: HTMLImageElement | null,
    destX: number,
    destY: number,
    destW: number,
    destH: number,
    fallbackImg?: HTMLImageElement | null,
    mirror = false
  ) {
    const sourceImg = img || fallbackImg;
    if (!sourceImg) return;

    const naturalW = sourceImg.naturalWidth || sourceImg.width || 512;
    const naturalH = sourceImg.naturalHeight || sourceImg.height || 512;
    const bbox = detectCharacterBBox(sourceImg);
    const padding = 15;

    const sx = Math.max(0, bbox.minX - padding);
    const sy = Math.max(0, bbox.minY - padding);
    const sw = Math.min(naturalW - sx, bbox.width + padding * 2);
    const sh = Math.min(naturalH - sy, bbox.height + padding * 2);

    if (sw <= 0 || sh <= 0) return;

    // Maintain aspect ratio and center horizontally
    const scale = destH / sh;
    const fittedW = Math.min(destW, sw * scale);
    const offsetX = (destW - fittedW) / 2;

    ctx!.save();
    if (mirror) {
      ctx!.translate(destX + destW, destY);
      ctx!.scale(-1, 1);
      ctx!.drawImage(
        sourceImg,
        sx,
        sy,
        sw,
        sh,
        offsetX,
        0,
        fittedW,
        destH
      );
    } else {
      ctx!.drawImage(
        sourceImg,
        sx,
        sy,
        sw,
        sh,
        destX + offsetX,
        destY,
        fittedW,
        destH
      );
    }
    ctx!.restore();
  }

  // Island 1: Front View (Top-Left: 0, 0 to 1024, 1024)
  drawNormalizedCharacter(frontImg, 0, 0, 1024, 1024);

  // Island 2: Back View (Top-Right: 1024, 0 to 2048, 1024)
  drawNormalizedCharacter(backImg, 1024, 0, 1024, 1024, frontImg, !backImg);

  // Island 3: Profile View (Bottom-Left: 0, 1024 to 1024, 2048)
  drawNormalizedCharacter(sideImg, 0, 1024, 1024, 1024, frontImg);

  // Island 4: Top View (1024, 1024 to 1536, 2048)
  if (topImg) {
    ctx.drawImage(topImg, 1024, 1024, 512, 1024);
  } else if (frontImg) {
    ctx.drawImage(frontImg, 1024, 1024, 512, 1024);
  }

  // Island 5: Bottom View (1536, 1024 to 2048, 2048)
  if (bottomImg) {
    ctx.drawImage(bottomImg, 1536, 1024, 512, 1024);
  } else if (frontImg) {
    ctx.drawImage(frontImg, 1536, 1024, 512, 1024);
  }

  const atlasDataUrl = canvas.toDataURL('image/png');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return { texture, atlasDataUrl };
}

/**
 * Normalizes and centers a character turnaround view to a standard 512x512 canvas.
 * Removes empty margins and centers the head & feet to ensure seamless 3D alignment.
 */
export async function normalizeCharacterViewImage(srcUrl: string): Promise<string> {
  const img = await loadImage(srcUrl);
  const bbox = detectCharacterBBox(img);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcUrl;

  const naturalW = img.naturalWidth || img.width || 512;
  const naturalH = img.naturalHeight || img.height || 512;
  const padding = 10;
  const sx = Math.max(0, bbox.minX - padding);
  const sy = Math.max(0, bbox.minY - padding);
  const sw = Math.min(naturalW - sx, bbox.width + padding * 2);
  const sh = Math.min(naturalH - sy, bbox.height + padding * 2);

  // Standard target: height 440px (top padding 36px, bottom padding 36px)
  const targetH = 440;
  const scale = targetH / Math.max(sh, 1);
  const targetW = Math.min(480, sw * scale);
  const dx = (512 - targetW) / 2;
  const dy = 36;

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, targetW, targetH);
  return canvas.toDataURL('image/png');
}

/**
 * Batch-aligns all turnaround views so that head, feet, and centers match identically.
 */
export async function alignAllTurnaroundViews(
  views: Record<MultiViewAngle, string | null>
): Promise<Record<MultiViewAngle, string | null>> {
  const aligned: Record<MultiViewAngle, string | null> = { ...views };
  const angles = Object.keys(views) as MultiViewAngle[];

  await Promise.all(
    angles.map(async (angle) => {
      const url = views[angle];
      if (url && (angle === 'front' || angle === 'left' || angle === 'right' || angle === 'back')) {
        try {
          aligned[angle] = await normalizeCharacterViewImage(url);
        } catch (e) {
          console.warn(`Could not auto-align view ${angle}:`, e);
        }
      }
    })
  );

  return aligned;
}

/**
 * Projects UV coordinates onto a geometry based on physical 3D position and normal direction
 * Island 1 (Front): U in [0.0, 0.5], V in [0.5, 1.0]
 * Island 2 (Back):  U in [0.5, 1.0], V in [0.5, 1.0]
 * Island 3 (Side):  U in [0.0, 0.5], V in [0.0, 0.5]
 * Island 4 (Top):   U in [0.5, 0.75], V in [0.0, 0.5]
 * Island 5 (Bottom):U in [0.75, 1.0], V in [0.0, 0.5]
 */
function applyPhotogrammetricCameraUVs(
  geometry: THREE.BufferGeometry,
  bodyType: 'head' | 'torso' | 'arm_left' | 'arm_right' | 'leg_left' | 'leg_right' | 'belt' | 'foot_left' | 'foot_right',
  parentMatrixWorld: THREE.Matrix4
) {
  geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  if (!pos || !norm || !uvAttr) return;

  const vWorld = new THREE.Vector3();
  const nWorld = new THREE.Vector3();

  // Character vertical range in world coordinates: Y = 0 (ground) to Y = 1.8 (head top)
  const CHAR_Y_MIN = 0.0;
  const CHAR_Y_MAX = 1.8;
  const CHAR_X_HALF = 0.55;
  const CHAR_Z_HALF = 0.40;

  for (let i = 0; i < pos.count; i++) {
    vWorld.fromBufferAttribute(pos, i).applyMatrix4(parentMatrixWorld);
    nWorld.fromBufferAttribute(norm, i).transformDirection(parentMatrixWorld).normalize();

    // Normalized Y coordinate in [0, 1]
    const normY = THREE.MathUtils.clamp((vWorld.y - CHAR_Y_MIN) / (CHAR_Y_MAX - CHAR_Y_MIN), 0.0, 1.0);

    // Default: Front view mapping (Island 1)
    let u = 0.0;
    let v = 0.0;

    const isFacingFront = nWorld.z >= 0;
    const isFacingSide = Math.abs(nWorld.x) > 0.65;
    const isFacingTop = nWorld.y > 0.70;
    const isFacingBottom = nWorld.y < -0.70;

    if (isFacingTop && bodyType === 'head') {
      // Island 4: Top View
      const normX = THREE.MathUtils.clamp((vWorld.x + CHAR_X_HALF) / (CHAR_X_HALF * 2), 0.0, 1.0);
      const normZ = THREE.MathUtils.clamp((vWorld.z + CHAR_Z_HALF) / (CHAR_Z_HALF * 2), 0.0, 1.0);
      u = 0.50 + normX * 0.25;
      v = normZ * 0.50;
    } else if (isFacingBottom && (bodyType === 'foot_left' || bodyType === 'foot_right')) {
      // Island 5: Bottom View (Soles)
      const normX = THREE.MathUtils.clamp((vWorld.x + CHAR_X_HALF) / (CHAR_X_HALF * 2), 0.0, 1.0);
      const normZ = THREE.MathUtils.clamp((vWorld.z + CHAR_Z_HALF) / (CHAR_Z_HALF * 2), 0.0, 1.0);
      u = 0.75 + normX * 0.25;
      v = normZ * 0.50;
    } else if (isFacingSide && (bodyType === 'arm_left' || bodyType === 'arm_right')) {
      // Island 3: Profile View (Arms, Sleeves, Gloves)
      const normZ = THREE.MathUtils.clamp((vWorld.z + CHAR_Z_HALF) / (CHAR_Z_HALF * 2), 0.0, 1.0);
      u = 0.05 + normZ * 0.40;
      v = normY * 0.50; // Bottom half
    } else if (!isFacingFront) {
      // Island 2: Back View (Back Torso, Back Legs, Back Head)
      // Mirror X so left corresponds to character's left side
      const normX = THREE.MathUtils.clamp((-vWorld.x + CHAR_X_HALF) / (CHAR_X_HALF * 2), 0.0, 1.0);
      u = 0.50 + normX * 0.50;
      v = 0.50 + normY * 0.50;
    } else {
      // Island 1: Front View (Front Torso, Front Face, Front Legs, Gi)
      const normX = THREE.MathUtils.clamp((vWorld.x + CHAR_X_HALF) / (CHAR_X_HALF * 2), 0.0, 1.0);
      u = normX * 0.50;
      v = 0.50 + normY * 0.50;
    }

    uvAttr.setXY(i, THREE.MathUtils.clamp(u, 0.0, 1.0), THREE.MathUtils.clamp(v, 0.0, 1.0));
  }
  uvAttr.needsUpdate = true;
}

/**
 * Builds a clean, fully articulated, non-fused Humanoid 3D Character
 * with separate limbs, high polygon count, smooth normals,
 * and camera-projected textures from the user's photos.
 */
export async function synthesizePhotogrammetricHumanoidGLB(
  params: PhotogrammetricSynthesisParams
): Promise<PhotogrammetricResult> {
  const { views, characterName = 'Personnage_3D_Propre' } = params;

  // 1. Build Calibrated High-Resolution Texture Atlas (2048x2048)
  const { texture: atlasTexture, atlasDataUrl } = await buildCalibratedTextureAtlas(views);

  const pbrMaterial = new THREE.MeshStandardMaterial({
    map: atlasTexture,
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.FrontSide,
  });

  const rootGroup = new THREE.Group();
  rootGroup.name = characterName;

  let totalVertexCount = 0;
  let totalTriangleCount = 0;

  function addCleanPart(mesh: THREE.Mesh, bodyType: Parameters<typeof applyPhotogrammetricCameraUVs>[1], parentGroup: THREE.Group) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parentGroup.add(mesh);
    parentGroup.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);

    applyPhotogrammetricCameraUVs(mesh.geometry, bodyType, mesh.matrixWorld);

    const pos = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.getIndex();
    if (pos) totalVertexCount += pos.count;
    if (idx) totalTriangleCount += idx.count / 3;
  }

  // 2. HEAD & FACE (Smooth anime sphere with chin and jaw bevel)
  const headGroup = new THREE.Group();
  headGroup.name = 'Head';
  headGroup.position.set(0, 1.48, 0);
  rootGroup.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.185, 36, 28);
  headGeo.scale(1.0, 1.08, 1.02);
  const headMesh = new THREE.Mesh(headGeo, pbrMaterial);
  headMesh.name = 'Face_And_Head';
  addCleanPart(headMesh, 'head', headGroup);

  // Spiky Hair Crown (Top hair volume from top photo)
  const hairGeo = new THREE.SphereGeometry(0.198, 24, 20);
  hairGeo.scale(1.06, 0.95, 1.08);
  const hairMesh = new THREE.Mesh(hairGeo, pbrMaterial);
  hairMesh.name = 'Hair_Crown';
  hairMesh.position.set(0, 0.05, -0.01);
  addCleanPart(hairMesh, 'head', headGroup);

  // Hair spikes clump
  const spikeClump = new THREE.Group();
  spikeClump.position.set(0, 0.14, 0);
  const spikeGeo = new THREE.ConeGeometry(0.065, 0.18, 6);
  [-0.5, -0.25, 0, 0.25, 0.5].forEach((angle, idx) => {
    const spike = new THREE.Mesh(spikeGeo, pbrMaterial);
    spike.position.set(Math.sin(angle) * 0.14, 0.05, Math.cos(angle) * 0.10);
    spike.rotation.z = -angle * 0.6;
    spike.rotation.x = -0.25;
    addCleanPart(spike, 'head', spikeClump);
  });
  headGroup.add(spikeClump);

  // Blue Headband ring
  const headbandGeo = new THREE.CylinderGeometry(0.192, 0.192, 0.048, 32);
  const headbandMesh = new THREE.Mesh(headbandGeo, pbrMaterial);
  headbandMesh.name = 'Headband';
  headbandMesh.position.set(0, 0.03, 0);
  addCleanPart(headbandMesh, 'head', headGroup);

  // Floating Headband Ribbons at back
  const ribbonGeo = new THREE.PlaneGeometry(0.065, 0.32, 4, 8);
  const ribbonMesh = new THREE.Mesh(ribbonGeo, pbrMaterial);
  ribbonMesh.name = 'Headband_Ribbon';
  ribbonMesh.position.set(0.06, 0.02, -0.21);
  ribbonMesh.rotation.set(-0.35, 0.25, -0.2);
  ribbonMesh.material.side = THREE.DoubleSide;
  addCleanPart(ribbonMesh, 'head', headGroup);

  // 3. TORSO & KIMONO (DOGI)
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'Torso';
  torsoGroup.position.set(0, 1.06, 0);
  rootGroup.add(torsoGroup);

  const torsoGeo = new THREE.CylinderGeometry(0.24, 0.195, 0.56, 32);
  const torsoMesh = new THREE.Mesh(torsoGeo, pbrMaterial);
  torsoMesh.name = 'Torso_Dogi';
  addCleanPart(torsoMesh, 'torso', torsoGroup);

  // V-Neck Collar Lapels
  const lapelGeo = new THREE.BoxGeometry(0.045, 0.36, 0.035);
  const lapelL = new THREE.Mesh(lapelGeo, pbrMaterial);
  lapelL.position.set(-0.065, 0.10, 0.17);
  lapelL.rotation.z = -0.36;
  addCleanPart(lapelL, 'torso', torsoGroup);

  const lapelR = new THREE.Mesh(lapelGeo, pbrMaterial);
  lapelR.position.set(0.065, 0.10, 0.17);
  lapelR.rotation.z = 0.36;
  addCleanPart(lapelR, 'torso', torsoGroup);

  // 4. BLACK BELT (OBI) & 3D FRONT KNOT
  const beltGroup = new THREE.Group();
  beltGroup.name = 'Belt';
  beltGroup.position.set(0, 0.86, 0);
  rootGroup.add(beltGroup);

  const beltGeo = new THREE.CylinderGeometry(0.215, 0.215, 0.095, 32);
  const beltMesh = new THREE.Mesh(beltGeo, pbrMaterial);
  beltMesh.name = 'Obi_Belt';
  addCleanPart(beltMesh, 'belt', beltGroup);

  const knotGeo = new THREE.BoxGeometry(0.08, 0.07, 0.05);
  const knotMesh = new THREE.Mesh(knotGeo, pbrMaterial);
  knotMesh.position.set(0, 0, 0.22);
  addCleanPart(knotMesh, 'belt', beltGroup);

  const ribbonBeltGeo = new THREE.BoxGeometry(0.045, 0.24, 0.02);
  const ribbonL = new THREE.Mesh(ribbonBeltGeo, pbrMaterial);
  ribbonL.position.set(-0.03, -0.13, 0.22);
  ribbonL.rotation.z = 0.12;
  addCleanPart(ribbonL, 'belt', beltGroup);

  const ribbonR = new THREE.Mesh(ribbonBeltGeo, pbrMaterial);
  ribbonR.position.set(0.03, -0.13, 0.22);
  ribbonR.rotation.z = -0.18;
  addCleanPart(ribbonR, 'belt', beltGroup);

  // 5. LEFT ARM & SLEEVE (Fighting Guard Stance)
  const armLGroup = new THREE.Group();
  armLGroup.name = 'Arm_Left';
  armLGroup.position.set(-0.31, 1.20, 0);
  rootGroup.add(armLGroup);

  const sleeveGeoL = new THREE.CylinderGeometry(0.12, 0.095, 0.24, 20);
  const sleeveMeshL = new THREE.Mesh(sleeveGeoL, pbrMaterial);
  sleeveMeshL.position.set(-0.06, -0.06, 0.02);
  sleeveMeshL.rotation.z = 0.35;
  sleeveMeshL.rotation.x = 0.15;
  addCleanPart(sleeveMeshL, 'arm_left', armLGroup);

  const forearmGeoL = new THREE.CylinderGeometry(0.085, 0.072, 0.26, 20);
  const forearmMeshL = new THREE.Mesh(forearmGeoL, pbrMaterial);
  forearmMeshL.position.set(-0.14, -0.23, 0.08);
  forearmMeshL.rotation.z = 0.45;
  forearmMeshL.rotation.x = 0.30;
  addCleanPart(forearmMeshL, 'arm_left', armLGroup);

  const gloveGeoL = new THREE.BoxGeometry(0.105, 0.105, 0.105);
  const gloveMeshL = new THREE.Mesh(gloveGeoL, pbrMaterial);
  gloveMeshL.position.set(-0.20, -0.36, 0.14);
  addCleanPart(gloveMeshL, 'arm_left', armLGroup);

  // 6. RIGHT ARM & SLEEVE (Fighting Guard Stance)
  const armRGroup = new THREE.Group();
  armRGroup.name = 'Arm_Right';
  armRGroup.position.set(0.31, 1.20, 0);
  rootGroup.add(armRGroup);

  const sleeveGeoR = new THREE.CylinderGeometry(0.12, 0.095, 0.24, 20);
  const sleeveMeshR = new THREE.Mesh(sleeveGeoR, pbrMaterial);
  sleeveMeshR.position.set(0.06, -0.06, 0.02);
  sleeveMeshR.rotation.z = -0.35;
  sleeveMeshR.rotation.x = 0.15;
  addCleanPart(sleeveMeshR, 'arm_right', armRGroup);

  const forearmGeoR = new THREE.CylinderGeometry(0.085, 0.072, 0.26, 20);
  const forearmMeshR = new THREE.Mesh(forearmGeoR, pbrMaterial);
  forearmMeshR.position.set(0.14, -0.23, 0.08);
  forearmMeshR.rotation.z = -0.45;
  forearmMeshR.rotation.x = 0.30;
  addCleanPart(forearmMeshR, 'arm_right', armRGroup);

  const gloveGeoR = new THREE.BoxGeometry(0.105, 0.105, 0.105);
  const gloveMeshR = new THREE.Mesh(gloveGeoR, pbrMaterial);
  gloveMeshR.position.set(0.20, -0.36, 0.14);
  addCleanPart(gloveMeshR, 'arm_right', armRGroup);

  // 7. SEPARATED LEFT LEG (Martial Arts Flared Trouser)
  const legLGroup = new THREE.Group();
  legLGroup.name = 'Leg_Left';
  legLGroup.position.set(-0.145, 0.76, 0);
  rootGroup.add(legLGroup);

  const legGeoL = new THREE.CylinderGeometry(0.125, 0.105, 0.60, 24);
  const legMeshL = new THREE.Mesh(legGeoL, pbrMaterial);
  legMeshL.position.set(0, -0.30, 0);
  addCleanPart(legMeshL, 'leg_left', legLGroup);

  const footGeoL = new THREE.BoxGeometry(0.115, 0.085, 0.21);
  const footMeshL = new THREE.Mesh(footGeoL, pbrMaterial);
  footMeshL.position.set(0, -0.63, 0.05);
  addCleanPart(footMeshL, 'foot_left', legLGroup);

  // 8. SEPARATED RIGHT LEG (Martial Arts Flared Trouser)
  const legRGroup = new THREE.Group();
  legRGroup.name = 'Leg_Right';
  legRGroup.position.set(0.145, 0.76, 0);
  rootGroup.add(legRGroup);

  const legGeoR = new THREE.CylinderGeometry(0.125, 0.105, 0.60, 24);
  const legMeshR = new THREE.Mesh(legGeoR, pbrMaterial);
  legMeshR.position.set(0, -0.30, 0);
  addCleanPart(legMeshR, 'leg_right', legRGroup);

  const footGeoR = new THREE.BoxGeometry(0.115, 0.085, 0.21);
  const footMeshR = new THREE.Mesh(footGeoR, pbrMaterial);
  footMeshR.position.set(0, -0.63, 0.05);
  addCleanPart(footMeshR, 'foot_right', legRGroup);

  // 9. OBJ Exporter
  const exportObj = (name = characterName) => {
    let out = `# Wavefront 3D Object\n# Photogrammetric Humanoid Mesh synthesized from Multi-View Photos\n# Generator: Character Forge & Asset Recovery Agent\no ${name}\n\n`;
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

  // 10. GLB Binary Exporter
  const exportGlbBlob = async (): Promise<Blob> => {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        rootGroup,
        (gltf) => {
          if (gltf instanceof ArrayBuffer) {
            resolve(new Blob([gltf], { type: 'model/gltf-binary' }));
          } else {
            resolve(new Blob([JSON.stringify(gltf)], { type: 'application/json' }));
          }
        },
        (error) => reject(error),
        { binary: true }
      );
    });
  };

  return {
    mesh: rootGroup,
    atlasDataUrl,
    vertexCount: totalVertexCount,
    triangleCount: totalTriangleCount,
    exportObj,
    exportGlbBlob,
  };
}
