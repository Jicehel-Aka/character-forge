import * as THREE from 'three';
import { CharacterPosePreset, PoseJointMap, ZERO_EULER } from '../types/poses';
import type { CharacterRigBones } from '../types/rig';

export const POSE_LIBRARY: CharacterPosePreset[] = [
  {
    id: 'pose_a_canon',
    name: 'A-Pose Canonique',
    category: 'calibration',
    categoryLabel: 'Calibration',
    description: 'Posture neutre symétrique avec bras à 35°, idéale pour la modélisation et le skinning.',
    icon: '🧍',
    joints: {
      torso: { ...ZERO_EULER },
      torsoYOffset: 0,
      head: { ...ZERO_EULER },
      armLeft: { rx: 0, ry: 0, rz: 34 },
      elbowLeft: { rx: -6, ry: 0, rz: 0 },
      armRight: { rx: 0, ry: 0, rz: -34 },
      elbowRight: { rx: -6, ry: 0, rz: 0 },
      legLeft: { rx: 0, ry: 0, rz: 4 },
      kneeLeft: { ...ZERO_EULER },
      legRight: { rx: 0, ry: 0, rz: -4 },
      kneeRight: { ...ZERO_EULER },
      footLeft: { ...ZERO_EULER },
      footRight: { ...ZERO_EULER },
    },
  },
  {
    id: 'pose_t_vrm',
    name: 'T-Pose VRM / Mixamo',
    category: 'calibration',
    categoryLabel: 'Calibration',
    description: 'Bras strictement à l’horizontale (90°), standard universel d’export riggé.',
    icon: '✝️',
    joints: {
      torso: { ...ZERO_EULER },
      torsoYOffset: 0,
      head: { ...ZERO_EULER },
      armLeft: { rx: 0, ry: 0, rz: 90 },
      elbowLeft: { ...ZERO_EULER },
      armRight: { rx: 0, ry: 0, rz: -90 },
      elbowRight: { ...ZERO_EULER },
      legLeft: { rx: 0, ry: 0, rz: 0 },
      kneeLeft: { ...ZERO_EULER },
      legRight: { rx: 0, ry: 0, rz: 0 },
      kneeRight: { ...ZERO_EULER },
      footLeft: { ...ZERO_EULER },
      footRight: { ...ZERO_EULER },
    },
  },
  {
    id: 'pose_heroic',
    name: 'Posture Héroïque',
    category: 'attitude',
    categoryLabel: 'Attitude',
    description: 'Torse bombé, poings sur les hanches ou garde fière, regard vers l’horizon.',
    icon: '🦸',
    joints: {
      torso: { rx: -6, ry: -10, rz: 0 },
      torsoYOffset: 0,
      head: { rx: -6, ry: 12, rz: 0 },
      armLeft: { rx: 10, ry: 0, rz: 30 },
      elbowLeft: { rx: -65, ry: 0, rz: -28 },
      armRight: { rx: 10, ry: 0, rz: -30 },
      elbowRight: { rx: -65, ry: 0, rz: 28 },
      legLeft: { rx: -5, ry: 8, rz: 8 },
      kneeLeft: { rx: 6, ry: 0, rz: 0 },
      legRight: { rx: 6, ry: -8, rz: -8 },
      kneeRight: { rx: 4, ry: 0, rz: 0 },
      footLeft: { ...ZERO_EULER },
      footRight: { ...ZERO_EULER },
    },
  },
  {
    id: 'pose_martial_guard',
    name: 'Garde de Combat (Kumite)',
    category: 'combat',
    categoryLabel: 'Combat',
    description: 'Appuis larges, genoux fléchis et poings hauts prêts à frapper ou parer.',
    icon: '🥋',
    joints: {
      torso: { rx: 8, ry: 28, rz: 0 },
      torsoYOffset: -0.07,
      head: { rx: -4, ry: -26, rz: 0 },
      armLeft: { rx: -58, ry: 18, rz: 18 },
      elbowLeft: { rx: -85, ry: 0, rz: 0 },
      armRight: { rx: -42, ry: -12, rz: -20 },
      elbowRight: { rx: -95, ry: 0, rz: 0 },
      legLeft: { rx: -32, ry: 12, rz: 10 },
      kneeLeft: { rx: 38, ry: 0, rz: 0 },
      legRight: { rx: 28, ry: -15, rz: -10 },
      kneeRight: { rx: 26, ry: 0, rz: 0 },
      footLeft: { rx: -6, ry: 0, rz: 0 },
      footRight: { rx: 12, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_punch_right',
    name: 'Direct du Droit (Gyaku-Zuki)',
    category: 'combat',
    categoryLabel: 'Combat',
    description: 'Extension explosive du bras droit avec rotation des épaules et fente avant.',
    icon: '👊',
    joints: {
      torso: { rx: 12, ry: -38, rz: -4 },
      torsoYOffset: -0.09,
      head: { rx: -8, ry: 34, rz: 0 },
      armLeft: { rx: -35, ry: 20, rz: 22 },
      elbowLeft: { rx: -105, ry: 0, rz: 0 },
      armRight: { rx: -88, ry: 10, rz: -6 },
      elbowRight: { rx: -6, ry: 0, rz: 0 },
      legLeft: { rx: -42, ry: 8, rz: 6 },
      kneeLeft: { rx: 46, ry: 0, rz: 0 },
      legRight: { rx: 34, ry: -12, rz: -8 },
      kneeRight: { rx: 12, ry: 0, rz: 0 },
      footLeft: { rx: -4, ry: 0, rz: 0 },
      footRight: { rx: 22, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_high_kick',
    name: 'High Kick (Mawashi-Geri)',
    category: 'combat',
    categoryLabel: 'Combat',
    description: 'Frappe circulaire haute de la jambe droite avec contrepoids du buste.',
    icon: '🦵',
    joints: {
      torso: { rx: -8, ry: -28, rz: 24 },
      torsoYOffset: -0.02,
      head: { rx: 4, ry: 26, rz: -14 },
      armLeft: { rx: -50, ry: 10, rz: 28 },
      elbowLeft: { rx: -85, ry: 0, rz: 0 },
      armRight: { rx: -45, ry: -10, rz: -26 },
      elbowRight: { rx: -80, ry: 0, rz: 0 },
      legLeft: { rx: 4, ry: 12, rz: 8 },
      kneeLeft: { rx: 10, ry: 0, rz: 0 },
      legRight: { rx: -68, ry: -10, rz: -62 },
      kneeRight: { rx: 8, ry: 0, rz: 0 },
      footLeft: { ...ZERO_EULER },
      footRight: { rx: 28, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_sword_slash',
    name: 'Garde d’Épée Offensive',
    category: 'combat',
    categoryLabel: 'Combat',
    description: 'Armement puissant de la lame vers l’avant, prêt pour une taillade diagonale.',
    icon: '⚔️',
    joints: {
      torso: { rx: 14, ry: -26, rz: 4 },
      torsoYOffset: -0.08,
      head: { rx: -10, ry: 24, rz: 0 },
      armLeft: { rx: -58, ry: 32, rz: 14 },
      elbowLeft: { rx: -62, ry: 0, rz: 0 },
      armRight: { rx: -115, ry: -18, rz: -24 },
      elbowRight: { rx: -35, ry: 0, rz: 0 },
      legLeft: { rx: -34, ry: 10, rz: 8 },
      kneeLeft: { rx: 40, ry: 0, rz: 0 },
      legRight: { rx: 30, ry: -10, rz: -8 },
      kneeRight: { rx: 18, ry: 0, rz: 0 },
      footLeft: { ...ZERO_EULER },
      footRight: { rx: 14, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_shield_block',
    name: 'Parade & Bouclier',
    category: 'combat',
    categoryLabel: 'Combat',
    description: 'Posture basse verrouillée, avant-bras croisé devant le buste pour encaisser un choc.',
    icon: '🛡️',
    joints: {
      torso: { rx: 14, ry: 22, rz: 0 },
      torsoYOffset: -0.11,
      head: { rx: -10, ry: -20, rz: 0 },
      armLeft: { rx: -68, ry: 42, rz: 20 },
      elbowLeft: { rx: -88, ry: 0, rz: 0 },
      armRight: { rx: -45, ry: -28, rz: -18 },
      elbowRight: { rx: -95, ry: 0, rz: 0 },
      legLeft: { rx: -38, ry: 12, rz: 12 },
      kneeLeft: { rx: 48, ry: 0, rz: 0 },
      legRight: { rx: 24, ry: -12, rz: -12 },
      kneeRight: { rx: 36, ry: 0, rz: 0 },
      footLeft: { rx: -8, ry: 0, rz: 0 },
      footRight: { rx: 10, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_sprint_freeze',
    name: 'Course Figée (Sprint)',
    category: 'action',
    categoryLabel: 'Action',
    description: 'Foulée dynamique suspendue, buste incliné vers l’avant et bras pliés à 90°.',
    icon: '🏃',
    joints: {
      torso: { rx: 20, ry: 14, rz: 0 },
      torsoYOffset: -0.05,
      head: { rx: -16, ry: -10, rz: 0 },
      armLeft: { rx: -58, ry: 0, rz: 14 },
      elbowLeft: { rx: -95, ry: 0, rz: 0 },
      armRight: { rx: 48, ry: 0, rz: -14 },
      elbowRight: { rx: -85, ry: 0, rz: 0 },
      legLeft: { rx: 46, ry: 0, rz: 2 },
      kneeLeft: { rx: 32, ry: 0, rz: 0 },
      legRight: { rx: -58, ry: 0, rz: -2 },
      kneeRight: { rx: 64, ry: 0, rz: 0 },
      footLeft: { rx: 22, ry: 0, rz: 0 },
      footRight: { rx: 14, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_air_jump',
    name: 'Saut Aérien Dynamique',
    category: 'action',
    categoryLabel: 'Action',
    description: 'Envol dans les airs avec genou droit replié et bras levés en élan.',
    icon: '🦅',
    joints: {
      torso: { rx: 8, ry: -12, rz: 4 },
      torsoYOffset: 0.22,
      head: { rx: -12, ry: 10, rz: 0 },
      armLeft: { rx: -110, ry: 10, rz: 36 },
      elbowLeft: { rx: -35, ry: 0, rz: 0 },
      armRight: { rx: -75, ry: -10, rz: -42 },
      elbowRight: { rx: -50, ry: 0, rz: 0 },
      legLeft: { rx: 24, ry: 0, rz: 6 },
      kneeLeft: { rx: 42, ry: 0, rz: 0 },
      legRight: { rx: -72, ry: 0, rz: -6 },
      kneeRight: { rx: 95, ry: 0, rz: 0 },
      footLeft: { rx: 32, ry: 0, rz: 0 },
      footRight: { rx: 28, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_stealth_crouch',
    name: 'Accroupi / Furtif (Shinobi)',
    category: 'action',
    categoryLabel: 'Action',
    description: 'Posture d’infiltration très basse, prête à bondir ou esquiver.',
    icon: '🥷',
    joints: {
      torso: { rx: 28, ry: 12, rz: 0 },
      torsoYOffset: -0.26,
      head: { rx: -22, ry: -10, rz: 0 },
      armLeft: { rx: -45, ry: 20, rz: 18 },
      elbowLeft: { rx: -72, ry: 0, rz: 0 },
      armRight: { rx: 32, ry: -15, rz: -24 },
      elbowRight: { rx: -45, ry: 0, rz: 0 },
      legLeft: { rx: -78, ry: 8, rz: 12 },
      kneeLeft: { rx: 105, ry: 0, rz: 0 },
      legRight: { rx: -60, ry: -8, rz: -12 },
      kneeRight: { rx: 92, ry: 0, rz: 0 },
      footLeft: { rx: -24, ry: 0, rz: 0 },
      footRight: { rx: 18, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_victory_fist',
    name: 'Victoire / Poing Levé',
    category: 'attitude',
    categoryLabel: 'Attitude',
    description: 'Célébration triomphale avec bras droit levé vers le ciel et main gauche sur la hanche.',
    icon: '🏆',
    joints: {
      torso: { rx: -8, ry: -10, rz: 5 },
      torsoYOffset: 0,
      head: { rx: -16, ry: 8, rz: -4 },
      armLeft: { rx: 8, ry: 0, rz: 36 },
      elbowLeft: { rx: -65, ry: 0, rz: -25 },
      armRight: { rx: -20, ry: 0, rz: -148 },
      elbowRight: { rx: -18, ry: 0, rz: 0 },
      legLeft: { rx: 0, ry: 0, rz: 8 },
      kneeLeft: { rx: 6, ry: 0, rz: 0 },
      legRight: { rx: 0, ry: 0, rz: -8 },
      kneeRight: { rx: 6, ry: 0, rz: 0 },
      footLeft: { ...ZERO_EULER },
      footRight: { ...ZERO_EULER },
    },
  },
  {
    id: 'pose_levitation_cast',
    name: 'Lévitation Arcanique',
    category: 'magie',
    categoryLabel: 'Magie',
    description: 'Canalisation d’énergie mystique en suspension au-dessus du sol.',
    icon: '🔮',
    joints: {
      torso: { rx: -8, ry: 0, rz: 0 },
      torsoYOffset: 0.18,
      head: { rx: -14, ry: 0, rz: 0 },
      armLeft: { rx: -48, ry: 22, rz: 32 },
      elbowLeft: { rx: -45, ry: 0, rz: 0 },
      armRight: { rx: -48, ry: -22, rz: -32 },
      elbowRight: { rx: -45, ry: 0, rz: 0 },
      legLeft: { rx: 16, ry: 0, rz: 6 },
      kneeLeft: { rx: 24, ry: 0, rz: 0 },
      legRight: { rx: -12, ry: 0, rz: -6 },
      kneeRight: { rx: 32, ry: 0, rz: 0 },
      footLeft: { rx: 25, ry: 0, rz: 0 },
      footRight: { rx: 25, ry: 0, rz: 0 },
    },
  },
  {
    id: 'pose_martial_salute',
    name: 'Salutation Martiale',
    category: 'attitude',
    categoryLabel: 'Attitude',
    description: 'Salut respectueux de dojo : main droite en poing contre paume gauche devant le thorax.',
    icon: '🙇',
    joints: {
      torso: { rx: 12, ry: 0, rz: 0 },
      torsoYOffset: 0,
      head: { rx: 16, ry: 0, rz: 0 },
      armLeft: { rx: -52, ry: 34, rz: 12 },
      elbowLeft: { rx: -85, ry: 0, rz: 0 },
      armRight: { rx: -52, ry: -34, rz: -12 },
      elbowRight: { rx: -85, ry: 0, rz: 0 },
      legLeft: { rx: 0, ry: 0, rz: 2 },
      kneeLeft: { ...ZERO_EULER },
      legRight: { rx: 0, ry: 0, rz: -2 },
      kneeRight: { ...ZERO_EULER },
      footLeft: { ...ZERO_EULER },
      footRight: { ...ZERO_EULER },
    },
  },
];

const deg2rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Applies a static articulated PoseJointMap onto CharacterRigBones.
 */
export function applyPoseToRigBones(bones: CharacterRigBones, joints: PoseJointMap) {
  const baseTorsoY = (bones.torso?.userData?.baseY as number) ?? 1.05;
  const baseHeadY = (bones.head?.userData?.baseY as number) ?? 1.48;
  const shoulderBaseY = (bones.armLeft?.userData?.baseY as number) ?? 1.22;
  const shoulderBaseX = (bones.armRight?.userData?.baseX as number) ?? 0.24;
  const hipBaseY = (bones.legLeft?.userData?.baseY as number) ?? 0.82;
  const hipBaseX = (bones.legRight?.userData?.baseX as number) ?? 0.1;

  const yShift = joints.torsoYOffset || 0;

  if (bones.torso) {
    bones.torso.position.set(0, baseTorsoY + yShift, 0);
    bones.torso.rotation.set(deg2rad(joints.torso.rx), deg2rad(joints.torso.ry), deg2rad(joints.torso.rz));
  }

  if (bones.head) {
    bones.head.position.set(0, baseHeadY + yShift, 0);
    bones.head.rotation.set(deg2rad(joints.head.rx), deg2rad(joints.head.ry), deg2rad(joints.head.rz));
  }

  if (bones.armLeft) {
    bones.armLeft.position.set(-shoulderBaseX, shoulderBaseY + yShift, 0);
    bones.armLeft.rotation.set(deg2rad(joints.armLeft.rx), deg2rad(joints.armLeft.ry), deg2rad(joints.armLeft.rz));
  }
  if (bones.elbowLeft) {
    bones.elbowLeft.rotation.set(deg2rad(joints.elbowLeft.rx), deg2rad(joints.elbowLeft.ry), deg2rad(joints.elbowLeft.rz));
  }

  if (bones.armRight) {
    bones.armRight.position.set(shoulderBaseX, shoulderBaseY + yShift, 0);
    bones.armRight.rotation.set(deg2rad(joints.armRight.rx), deg2rad(joints.armRight.ry), deg2rad(joints.armRight.rz));
  }
  if (bones.elbowRight) {
    bones.elbowRight.rotation.set(deg2rad(joints.elbowRight.rx), deg2rad(joints.elbowRight.ry), deg2rad(joints.elbowRight.rz));
  }

  if (bones.legLeft) {
    bones.legLeft.position.set(-hipBaseX, hipBaseY + yShift, 0);
    bones.legLeft.rotation.set(deg2rad(joints.legLeft.rx), deg2rad(joints.legLeft.ry), deg2rad(joints.legLeft.rz));
  }
  if (bones.kneeLeft) {
    bones.kneeLeft.rotation.set(deg2rad(joints.kneeLeft.rx), deg2rad(joints.kneeLeft.ry), deg2rad(joints.kneeLeft.rz));
  }
  if (bones.footLeft) {
    bones.footLeft.rotation.set(deg2rad(joints.footLeft.rx), deg2rad(joints.footLeft.ry), deg2rad(joints.footLeft.rz));
  }

  if (bones.legRight) {
    bones.legRight.position.set(hipBaseX, hipBaseY + yShift, 0);
    bones.legRight.rotation.set(deg2rad(joints.legRight.rx), deg2rad(joints.legRight.ry), deg2rad(joints.legRight.rz));
  }
  if (bones.kneeRight) {
    bones.kneeRight.rotation.set(deg2rad(joints.kneeRight.rx), deg2rad(joints.kneeRight.ry), deg2rad(joints.kneeRight.rz));
  }
  if (bones.footRight) {
    bones.footRight.rotation.set(deg2rad(joints.footRight.rx), deg2rad(joints.footRight.ry), deg2rad(joints.footRight.rz));
  }

  // Keep subtle natural orientation on weapon/cloak mounts when posing
  if (bones.weaponMount) bones.weaponMount.rotation.set(0, 0, 0);
  if (bones.cloakMount) bones.cloakMount.rotation.set(Math.max(0, deg2rad(joints.torso.rx) * 0.4), 0, 0);
}

/**
 * Mirrors a PoseJointMap horizontally (Left <-> Right)
 */
export function mirrorPoseJoints(joints: PoseJointMap): PoseJointMap {
  const mirrorEuler = (e: { rx: number; ry: number; rz: number }) => ({
    rx: e.rx,
    ry: -e.ry,
    rz: -e.rz,
  });

  return {
    torso: mirrorEuler(joints.torso),
    torsoYOffset: joints.torsoYOffset,
    head: mirrorEuler(joints.head),
    armLeft: mirrorEuler(joints.armRight),
    elbowLeft: mirrorEuler(joints.elbowRight),
    armRight: mirrorEuler(joints.armLeft),
    elbowRight: mirrorEuler(joints.elbowLeft),
    legLeft: mirrorEuler(joints.legRight),
    kneeLeft: mirrorEuler(joints.kneeRight),
    legRight: mirrorEuler(joints.legLeft),
    kneeRight: mirrorEuler(joints.kneeLeft),
    footLeft: mirrorEuler(joints.footRight),
    footRight: mirrorEuler(joints.footLeft),
  };
}

/**
 * Updates skeleton bone helper lines/spheres live from world coordinates of articulated joints
 */
export function syncSkeletonVisualizerToBones(skelGroup: THREE.Group, bones: CharacterRigBones) {
  if (!skelGroup.visible || !bones.torso || !bones.head) return;
  const line = skelGroup.getObjectByName('SkeletonDynamicLines') as THREE.LineSegments | undefined;
  const ptsObj = skelGroup.getObjectByName('SkeletonDynamicJoints') as THREE.Points | undefined;
  if (!line || !ptsObj) return;

  const getWorldPos = (obj?: THREE.Object3D | null, fallback = new THREE.Vector3()) => {
    if (!obj) return fallback.clone();
    obj.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    // Convert from characterGroup local/world back to scene space
    return v;
  };

  const head = getWorldPos(bones.head);
  const torso = getWorldPos(bones.torso);
  const shoulderL = getWorldPos(bones.armLeft);
  const elbowL = getWorldPos(bones.elbowLeft);
  const handL = getWorldPos(bones.handLeft || bones.glovesLeftMount);
  const shoulderR = getWorldPos(bones.armRight);
  const elbowR = getWorldPos(bones.elbowRight);
  const handR = getWorldPos(bones.handRight || bones.glovesRightMount);
  const hipL = getWorldPos(bones.legLeft);
  const kneeL = getWorldPos(bones.kneeLeft);
  const footL = getWorldPos(bones.footLeft);
  const hipR = getWorldPos(bones.legRight);
  const kneeR = getWorldPos(bones.kneeRight);
  const footR = getWorldPos(bones.footRight);

  const neck = torso.clone().lerp(head, 0.55);
  const pelvis = hipL.clone().lerp(hipR, 0.5);

  // Put coordinates in characterGroup space if skelGroup is outside characterGroup
  const charGroup = bones.torso.parent;
  if (charGroup) {
    const inv = charGroup.matrixWorld.clone().invert();
    [head, neck, torso, pelvis, shoulderL, elbowL, handL, shoulderR, elbowR, handR, hipL, kneeL, footL, hipR, kneeR, footR].forEach(
      (v) => v.applyMatrix4(inv)
    );
  }

  const pairs = [
    head, neck,
    neck, torso,
    torso, pelvis,
    neck, shoulderL,
    shoulderL, elbowL,
    elbowL, handL,
    neck, shoulderR,
    shoulderR, elbowR,
    elbowR, handR,
    pelvis, hipL,
    hipL, kneeL,
    kneeL, footL,
    pelvis, hipR,
    hipR, kneeR,
    kneeR, footR,
  ];

  const linePos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pairs.length && i < linePos.count; i++) {
    linePos.setXYZ(i, pairs[i].x, pairs[i].y, pairs[i].z);
  }
  linePos.needsUpdate = true;

  const jointNodes = [head, neck, torso, pelvis, shoulderL, elbowL, handL, shoulderR, elbowR, handR, hipL, kneeL, footL, hipR, kneeR, footR];
  const ptsPos = ptsObj.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < jointNodes.length && i < ptsPos.count; i++) {
    ptsPos.setXYZ(i, jointNodes[i].x, jointNodes[i].y, jointNodes[i].z);
  }
  ptsPos.needsUpdate = true;
}
