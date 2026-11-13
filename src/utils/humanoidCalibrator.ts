import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';

export interface AnatomicalProportions {
  totalHeight: number;        // Overall height scale (default 1.0 = ~1.75m)
  headScale: number;          // 0.8 - 1.3
  shoulderWidth: number;      // 0.28 - 0.60
  chestBreadth: number;       // 0.20 - 0.40
  waistWidth: number;         // 0.16 - 0.35
  hipWidth: number;           // 0.20 - 0.42
  torsoHeight: number;        // 0.45 - 0.70
  armLength: number;          // 0.50 - 0.80
  armThickness: number;       // 0.7 - 1.4
  legLength: number;          // 0.70 - 1.10
  legThickness: number;       // 0.7 - 1.4
  armPoseAngle: number;       // in radians (e.g. 0.45 for A-pose, Math.PI/2 for T-pose)
}

export const DEFAULT_PROPORTIONS: AnatomicalProportions = {
  totalHeight: 1.0,
  headScale: 1.0,
  shoulderWidth: 0.46,
  chestBreadth: 0.28,
  waistWidth: 0.22,
  hipWidth: 0.26,
  torsoHeight: 0.56,
  armLength: 0.62,
  armThickness: 1.0,
  legLength: 0.84,
  legThickness: 1.0,
  armPoseAngle: 0.45, // A-pose standard
};

/**
 * Scans an image to extract silhouette landmarks and calibrate anatomical proportions.
 */
export async function calibrateProportionsFromImage(imageUrl: string): Promise<AnatomicalProportions> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = (canvas.width = Math.min(img.naturalWidth || 400, 400));
        const h = (canvas.height = Math.min(img.naturalHeight || 400, 400));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ ...DEFAULT_PROPORTIONS });
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h).data;

        // Detect corner background color
        const bgR = imgData[0];
        const bgG = imgData[1];
        const bgB = imgData[2];
        const bgA = imgData[3];
        const isTransparent = bgA < 25;

        // Scan row by row to find top (head), bottom (feet), and widths
        let minY = h, maxY = 0;
        const rowWidths: number[] = new Array(h).fill(0);
        const rowMinX: number[] = new Array(h).fill(w);
        const rowMaxX: number[] = new Array(h).fill(0);

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            const a = imgData[idx + 3];

            let isFg = false;
            if (isTransparent) {
              isFg = a > 35;
            } else {
              const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
              isFg = diff > 40 && (r > 20 || g > 20 || b > 20);
            }

            if (isFg) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              if (x < rowMinX[y]) rowMinX[y] = x;
              if (x > rowMaxX[y]) rowMaxX[y] = x;
            }
          }
          if (rowMaxX[y] >= rowMinX[y]) {
            rowWidths[y] = rowMaxX[y] - rowMinX[y];
          }
        }

        if (minY >= maxY) {
          resolve({ ...DEFAULT_PROPORTIONS });
          return;
        }

        const charHeight = maxY - minY;
        const headH = charHeight * 0.16;
        const shoulderY = Math.round(minY + charHeight * 0.20);
        const chestY = Math.round(minY + charHeight * 0.28);
        const waistY = Math.round(minY + charHeight * 0.38);
        const hipY = Math.round(minY + charHeight * 0.50);
        const kneeY = Math.round(minY + charHeight * 0.72);

        // Average widths around anatomical zones
        const sampleSpan = (center: number, radius = 4) => {
          let sum = 0, count = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            const y = center + dy;
            if (y >= 0 && y < h && rowWidths[y] > 0) {
              sum += rowWidths[y];
              count++;
            }
          }
          return count > 0 ? sum / count : 50;
        };

        const shoulderSpanPx = sampleSpan(shoulderY, 6);
        const chestSpanPx = sampleSpan(chestY, 5);
        const waistSpanPx = sampleSpan(waistY, 5);
        const hipSpanPx = sampleSpan(hipY, 6);
        const maxSpanPx = Math.max(...rowWidths);

        // Normalized relative to height
        const shoulderRel = shoulderSpanPx / charHeight;
        const chestRel = chestSpanPx / charHeight;
        const waistRel = waistSpanPx / charHeight;
        const hipRel = hipSpanPx / charHeight;

        // Detect if arms are flared (T-pose or A-pose)
        const isArmFlared = maxSpanPx / charHeight > 0.55;
        const isTPose = maxSpanPx / charHeight > 0.78;

        const armPoseAngle = isTPose ? Math.PI / 2 : isArmFlared ? 0.65 : 0.40;

        const calibrated: AnatomicalProportions = {
          totalHeight: 1.0,
          headScale: Math.max(0.85, Math.min(1.25, (headH / charHeight) * 6.5)),
          shoulderWidth: Math.max(0.32, Math.min(0.58, shoulderRel * 1.05)),
          chestBreadth: Math.max(0.22, Math.min(0.36, chestRel * 0.95)),
          waistWidth: Math.max(0.18, Math.min(0.30, waistRel * 0.9)),
          hipWidth: Math.max(0.22, Math.min(0.38, hipRel * 0.95)),
          torsoHeight: Math.max(0.48, Math.min(0.64, 0.56)),
          armLength: Math.max(0.52, Math.min(0.72, 0.62)),
          armThickness: Math.max(0.8, Math.min(1.3, shoulderRel * 2.4)),
          legLength: Math.max(0.75, Math.min(0.96, (charHeight - (hipY - minY)) / charHeight * 1.6)),
          legThickness: Math.max(0.8, Math.min(1.3, hipRel * 3.0)),
          armPoseAngle,
        };

        resolve(calibrated);
      } catch (e) {
        resolve({ ...DEFAULT_PROPORTIONS });
      }
    };
    img.onerror = () => resolve({ ...DEFAULT_PROPORTIONS });
    img.src = imageUrl;
  });
}

/**
 * Creates high-detail sculpted anatomical humanoid geometry segments.
 */
export function createSculptedHumanoidMeshes(
  proportions: AnatomicalProportions = DEFAULT_PROPORTIONS,
  skinColor = 0xe8d7c3,
  undergarmentColor = 0x27272a,
  textureMap?: THREE.Texture | null
) {
  const p = proportions;

  // Material with subtle organic skin feel
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.45,
    metalness: 0.04,
    map: textureMap || null,
  });

  const undergarmentMaterial = new THREE.MeshStandardMaterial({
    color: undergarmentColor,
    roughness: 0.75,
    metalness: 0.05,
  });

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569, // dark sleek articulated mechanical joint accent
    roughness: 0.35,
    metalness: 0.6,
  });

  // --- 1. HEAD & NECK ---
  // Sculpted anime/stylized cranium with chin, jawline and cheek planes
  const headGroup = new THREE.Group();
  headGroup.name = 'HeadAssembly';

  // Cranium base
  const craniumGeo = new THREE.SphereGeometry(0.13 * p.headScale, 24, 20);
  craniumGeo.scale(1.0, 1.15, 1.1);
  const cranium = new THREE.Mesh(craniumGeo, skinMaterial);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Jaw & Chin tapered cone/cylinder
  const jawGeo = new THREE.CylinderGeometry(0.12 * p.headScale, 0.05 * p.headScale, 0.12 * p.headScale, 16);
  jawGeo.scale(0.85, 1.0, 0.85);
  const jaw = new THREE.Mesh(jawGeo, skinMaterial);
  jaw.position.set(0, -0.06 * p.headScale, 0.02 * p.headScale);
  jaw.rotation.x = 0.15;
  jaw.castShadow = true;
  headGroup.add(jaw);

  // Chin prominence
  const chinGeo = new THREE.SphereGeometry(0.035 * p.headScale, 12, 12);
  const chin = new THREE.Mesh(chinGeo, skinMaterial);
  chin.position.set(0, -0.11 * p.headScale, 0.05 * p.headScale);
  headGroup.add(chin);

  // Eyes, brows, nose bridge
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeIris = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const eyeBrowMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04 * p.headScale, 0.035 * p.headScale, 0.01), eyeWhite);
    eye.position.set(side * 0.052 * p.headScale, 0, 0.12 * p.headScale);
    eye.rotation.y = side * 0.2;
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.024 * p.headScale, 0.028 * p.headScale, 0.012), eyeIris);
    pupil.position.set(side * 0.003, 0, 0.003);
    eye.add(pupil);
    headGroup.add(eye);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045 * p.headScale, 0.01 * p.headScale, 0.01), eyeBrowMat);
    brow.position.set(side * 0.052 * p.headScale, 0.035 * p.headScale, 0.124 * p.headScale);
    brow.rotation.z = side * 0.12;
    headGroup.add(brow);

    // Anatomical ears
    const earGeo = new THREE.BoxGeometry(0.025 * p.headScale, 0.055 * p.headScale, 0.035 * p.headScale);
    const ear = new THREE.Mesh(earGeo, skinMaterial);
    ear.position.set(side * 0.13 * p.headScale, -0.01 * p.headScale, -0.01 * p.headScale);
    ear.rotation.y = side * 0.1;
    headGroup.add(ear);
  }

  // Nose ridge
  const noseGeo = new THREE.ConeGeometry(0.016 * p.headScale, 0.035 * p.headScale, 4);
  const nose = new THREE.Mesh(noseGeo, skinMaterial);
  nose.position.set(0, -0.02 * p.headScale, 0.135 * p.headScale);
  nose.rotation.x = Math.PI / 4;
  headGroup.add(nose);

  // Neck with sternocleidomastoid angle
  const neckGeo = new THREE.CylinderGeometry(0.065 * p.headScale, 0.08 * p.headScale, 0.14 * p.headScale, 16);
  const neck = new THREE.Mesh(neckGeo, skinMaterial);
  neck.position.set(0, -0.14 * p.headScale, -0.02 * p.headScale);
  headGroup.add(neck);

  // --- 2. TORSO & PELVIS ---
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'TorsoAssembly';

  // Chest & Ribcage (Pectorals, broad clavicles)
  const chestGeo = new THREE.BoxGeometry(p.chestBreadth, 0.22, 0.20);
  const chest = new THREE.Mesh(chestGeo, skinMaterial);
  chest.position.set(0, 0.12, 0);
  chest.castShadow = true;
  torsoGroup.add(chest);

  // Clavicle shoulder yoke
  const yokeGeo = new THREE.CylinderGeometry(p.shoulderWidth * 0.5, p.shoulderWidth * 0.52, 0.07, 16);
  yokeGeo.scale(1.0, 1.0, 0.45);
  const yoke = new THREE.Mesh(yokeGeo, skinMaterial);
  yoke.position.set(0, 0.22, 0);
  torsoGroup.add(yoke);

  // Midriff & Waist (tapered)
  const waistGeo = new THREE.CylinderGeometry(p.chestBreadth * 0.48, p.waistWidth * 0.5, 0.18, 16);
  waistGeo.scale(1.0, 1.0, 0.75);
  const waist = new THREE.Mesh(waistGeo, skinMaterial);
  waist.position.set(0, -0.06, 0);
  waist.castShadow = true;
  torsoGroup.add(waist);

  // Pelvis / Hips (athletic briefs undergarment)
  const pelvisGeo = new THREE.CylinderGeometry(p.waistWidth * 0.5, p.hipWidth * 0.52, 0.18, 16);
  pelvisGeo.scale(1.0, 1.0, 0.85);
  const pelvis = new THREE.Mesh(pelvisGeo, undergarmentMaterial);
  pelvis.position.set(0, -0.22, 0);
  pelvis.castShadow = true;
  torsoGroup.add(pelvis);

  // --- 3. ARMS (Left & Right with UpperArm, ElbowPivot -> Forearm, Hand & Fingers) ---
  function createArm(side: 1 | -1) {
    const armGroup = new THREE.Group();
    armGroup.name = side === -1 ? 'ArmLeftAssembly' : 'ArmRightAssembly';

    // Deltoid shoulder joint sphere
    const deltoidGeo = new THREE.SphereGeometry(0.065 * p.armThickness, 16, 14);
    deltoidGeo.scale(1.0, 1.2, 0.95);
    const deltoid = new THREE.Mesh(deltoidGeo, skinMaterial);
    deltoid.position.set(0, 0, 0);
    armGroup.add(deltoid);

    // Sleek articulated shoulder pivot ring
    const pivotRing = new THREE.Mesh(new THREE.TorusGeometry(0.05 * p.armThickness, 0.008, 8, 16), jointMaterial);
    pivotRing.rotation.x = Math.PI / 2;
    armGroup.add(pivotRing);

    // Upper Arm (Biceps / Triceps)
    const upperArmLength = p.armLength * 0.46;
    const upperArmGeo = new THREE.CylinderGeometry(0.05 * p.armThickness, 0.042 * p.armThickness, upperArmLength, 14);
    upperArmGeo.scale(1.0, 1.0, 0.9);
    const upperArm = new THREE.Mesh(upperArmGeo, skinMaterial);
    upperArm.position.set(0, -upperArmLength / 2, 0);
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    // Articulated Elbow Pivot
    const elbowGroup = new THREE.Group();
    elbowGroup.name = side === -1 ? 'ElbowLeftPivot' : 'ElbowRightPivot';
    elbowGroup.position.set(0, -upperArmLength, 0);
    armGroup.add(elbowGroup);

    // Elbow Joint Sphere
    const elbowGeo = new THREE.SphereGeometry(0.042 * p.armThickness, 12, 12);
    const elbow = new THREE.Mesh(elbowGeo, jointMaterial);
    elbowGroup.add(elbow);

    // Forearm (Tapering from elbow to wrist)
    const forearmLength = p.armLength * 0.44;
    const forearmGeo = new THREE.CylinderGeometry(0.04 * p.armThickness, 0.032 * p.armThickness, forearmLength, 14);
    forearmGeo.scale(1.1, 1.0, 0.85);
    const forearm = new THREE.Mesh(forearmGeo, skinMaterial);
    forearm.position.set(0, -forearmLength / 2, 0);
    forearm.castShadow = true;
    elbowGroup.add(forearm);

    // Wrist ring
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.034 * p.armThickness, 0.034 * p.armThickness, 0.015, 12), jointMaterial);
    wrist.position.set(0, -forearmLength, 0);
    elbowGroup.add(wrist);

    // Hand (Palm & Opposable Thumb & Knuckle ridge)
    const handGroup = new THREE.Group();
    handGroup.name = side === -1 ? 'HandLeftPivot' : 'HandRightPivot';
    handGroup.position.set(0, -forearmLength - 0.02, 0);

    const palmGeo = new THREE.BoxGeometry(0.042 * p.armThickness, 0.065 * p.armThickness, 0.024 * p.armThickness);
    const palm = new THREE.Mesh(palmGeo, skinMaterial);
    palm.position.set(0, -0.03 * p.armThickness, 0);
    palm.castShadow = true;
    handGroup.add(palm);

    // Thumb angled inward
    const thumbGeo = new THREE.BoxGeometry(0.016 * p.armThickness, 0.038 * p.armThickness, 0.016 * p.armThickness);
    const thumb = new THREE.Mesh(thumbGeo, skinMaterial);
    thumb.position.set(side * 0.024 * p.armThickness, -0.02 * p.armThickness, 0.012 * p.armThickness);
    thumb.rotation.z = side * -0.4;
    handGroup.add(thumb);

    elbowGroup.add(handGroup);

    return { armGroup, elbowGroup, handGroup };
  }

  // --- 4. LEGS (Left & Right with Thigh, KneePivot -> Calf, Ankle & Foot) ---
  function createLeg(side: 1 | -1) {
    const legGroup = new THREE.Group();
    legGroup.name = side === -1 ? 'LegLeftAssembly' : 'LegRightAssembly';

    // Hip pivot ball joint
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.062 * p.legThickness, 14, 14), jointMaterial);
    legGroup.add(hipBall);

    // Thigh (Muscular quadriceps contour)
    const thighLength = p.legLength * 0.50;
    const thighGeo = new THREE.CylinderGeometry(0.075 * p.legThickness, 0.055 * p.legThickness, thighLength, 16);
    thighGeo.scale(0.95, 1.0, 1.05); // slight anterior depth
    const thigh = new THREE.Mesh(thighGeo, skinMaterial);
    thigh.position.set(0, -thighLength / 2, 0);
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Articulated Knee Pivot
    const kneeGroup = new THREE.Group();
    kneeGroup.name = side === -1 ? 'KneeLeftPivot' : 'KneeRightPivot';
    kneeGroup.position.set(0, -thighLength, 0);
    legGroup.add(kneeGroup);

    // Knee cap & joint
    const kneeGeo = new THREE.SphereGeometry(0.054 * p.legThickness, 14, 12);
    kneeGeo.scale(0.95, 1.1, 1.0);
    const knee = new THREE.Mesh(kneeGeo, jointMaterial);
    knee.position.set(0, 0, 0.005);
    kneeGroup.add(knee);

    // Calf & Shin (Anatomical gastrocnemius flare)
    const calfLength = p.legLength * 0.46;
    const calfGeo = new THREE.CylinderGeometry(0.058 * p.legThickness, 0.042 * p.legThickness, calfLength, 16);
    calfGeo.scale(0.95, 1.0, 1.1); // posterior gastrocnemius bulge
    const calf = new THREE.Mesh(calfGeo, skinMaterial);
    calf.position.set(0, -calfLength / 2, -0.004);
    calf.castShadow = true;
    kneeGroup.add(calf);

    // Ankle joint ring
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.042 * p.legThickness, 0.044 * p.legThickness, 0.02, 12), jointMaterial);
    ankle.position.set(0, -calfLength, 0);
    kneeGroup.add(ankle);

    // Anatomical Foot with Heel, Arch & Toe Box
    const footGroup = new THREE.Group();
    footGroup.name = side === -1 ? 'FootLeftPivot' : 'FootRightPivot';
    footGroup.position.set(0, -calfLength - 0.02, 0.04);

    const footGeo = new THREE.BoxGeometry(0.075 * p.legThickness, 0.045, 0.16 * p.legThickness);
    const foot = new THREE.Mesh(footGeo, undergarmentMaterial);
    foot.position.set(0, -0.015, 0.02);
    foot.castShadow = true;
    footGroup.add(foot);

    kneeGroup.add(footGroup);

    return { legGroup, kneeGroup, footGroup };
  }

  const armL = createArm(-1);
  const armR = createArm(1);
  const legL = createLeg(-1);
  const legR = createLeg(1);

  return {
    headGroup,
    torsoGroup,
    armL,
    armR,
    legL,
    legR,
    materials: {
      skin: skinMaterial,
      undergarment: undergarmentMaterial,
      joint: jointMaterial,
    },
  };
}
