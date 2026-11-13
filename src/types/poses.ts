export interface EulerDeg {
  rx: number;
  ry: number;
  rz: number;
}

export interface PoseJointMap {
  torso: EulerDeg;
  torsoYOffset: number; // Vertical offset in meters (e.g. -0.25 for crouch, +0.18 for jump)
  head: EulerDeg;
  armLeft: EulerDeg;
  elbowLeft: EulerDeg;
  armRight: EulerDeg;
  elbowRight: EulerDeg;
  legLeft: EulerDeg;
  kneeLeft: EulerDeg;
  legRight: EulerDeg;
  kneeRight: EulerDeg;
  footLeft: EulerDeg;
  footRight: EulerDeg;
}

export type PoseCategory = 'calibration' | 'combat' | 'action' | 'attitude' | 'magie' | 'perso';

export interface CharacterPosePreset {
  id: string;
  name: string;
  category: PoseCategory;
  categoryLabel: string;
  description: string;
  icon: string;
  joints: PoseJointMap;
  isCustom?: boolean;
}

export const ZERO_EULER: EulerDeg = { rx: 0, ry: 0, rz: 0 };

export const NEUTRAL_POSE_JOINTS: PoseJointMap = {
  torso: { rx: 0, ry: 0, rz: 0 },
  torsoYOffset: 0,
  head: { rx: 0, ry: 0, rz: 0 },
  armLeft: { rx: 0, ry: 0, rz: 24 },
  elbowLeft: { rx: -10, ry: 0, rz: 0 },
  armRight: { rx: 0, ry: 0, rz: -24 },
  elbowRight: { rx: -10, ry: 0, rz: 0 },
  legLeft: { rx: 0, ry: 0, rz: 2 },
  kneeLeft: { rx: 0, ry: 0, rz: 0 },
  legRight: { rx: 0, ry: 0, rz: -2 },
  kneeRight: { rx: 0, ry: 0, rz: 0 },
  footLeft: { rx: 0, ry: 0, rz: 0 },
  footRight: { rx: 0, ry: 0, rz: 0 },
};
