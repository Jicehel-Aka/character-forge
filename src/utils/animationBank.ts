import * as THREE from 'three';
import { TransferableAnimationId } from '../types/characterBank';
import { CharacterRigBones } from '../types/rig';

/**
 * Standard bone names in our humanoid skeletal rig
 */
export const SKELETON_BONE_NAMES = [
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'Shoulder_L',
  'UpperArm_L',
  'LowerArm_L',
  'Hand_L',
  'Shoulder_R',
  'UpperArm_R',
  'LowerArm_R',
  'Hand_R',
  'UpperLeg_L',
  'LowerLeg_L',
  'Foot_L',
  'UpperLeg_R',
  'LowerLeg_R',
  'Foot_R',
] as const;

export type SkeletonBoneName = typeof SKELETON_BONE_NAMES[number];

/**
 * Procedural kinematic evaluator that updates a character rig based on the selected animation
 */
export function evaluateSkeletalKinematics(
  bones: CharacterRigBones,
  animationId: TransferableAnimationId,
  time: number,
  speed: number = 1.0
) {
  const t = time * speed;

  // Reset default base positions (uses dynamic morphing position if calibrated)
  const baseTorsoY = (bones.torso?.userData?.baseY as number) ?? 1.05;
  const baseHeadY = (bones.head?.userData?.baseY as number) ?? 1.48;

  switch (animationId) {
    case 'a_pose': {
      if (bones.torso) bones.torso.position.set(0, baseTorsoY, 0);
      if (bones.head) {
        bones.head.position.set(0, baseHeadY, 0);
        bones.head.rotation.set(0, 0, 0);
      }
      if (bones.armLeft) {
        bones.armLeft.position.set(-0.30, 0.98, 0);
        bones.armLeft.rotation.set(0, 0, 0.55);
      }
      if (bones.armRight) {
        bones.armRight.position.set(0.30, 0.98, 0);
        bones.armRight.rotation.set(0, 0, -0.55);
      }
      if (bones.legLeft) {
        bones.legLeft.position.set(-0.13, 0.40, 0);
        bones.legLeft.rotation.set(0, 0, 0);
      }
      if (bones.legRight) {
        bones.legRight.position.set(0.13, 0.40, 0);
        bones.legRight.rotation.set(0, 0, 0);
      }
      if (bones.weaponMount) bones.weaponMount.rotation.set(0, 0, 0);
      if (bones.cloakMount) bones.cloakMount.rotation.set(0, 0, 0);
      break;
    }

    case 't_pose': {
      if (bones.torso) bones.torso.position.set(0, baseTorsoY, 0);
      if (bones.head) {
        bones.head.position.set(0, baseHeadY, 0);
        bones.head.rotation.set(0, 0, 0);
      }
      if (bones.armLeft) {
        bones.armLeft.position.set(-0.30, 1.15, 0);
        bones.armLeft.rotation.set(0, 0, Math.PI / 2);
      }
      if (bones.armRight) {
        bones.armRight.position.set(0.30, 1.15, 0);
        bones.armRight.rotation.set(0, 0, -Math.PI / 2);
      }
      if (bones.legLeft) bones.legLeft.rotation.set(0, 0, 0);
      if (bones.legRight) bones.legRight.rotation.set(0, 0, 0);
      if (bones.weaponMount) bones.weaponMount.rotation.set(0, 0, 0);
      break;
    }

    case 'idle': {
      const breath = Math.sin(t * 2.2) * 0.02;
      const sway = Math.cos(t * 1.1) * 0.015;
      if (bones.torso) {
        bones.torso.position.set(sway, baseTorsoY + breath, 0);
        bones.torso.rotation.z = -sway * 0.8;
      }
      if (bones.head) {
        bones.head.position.set(sway * 0.5, baseHeadY + breath * 0.7, 0);
        bones.head.rotation.y = Math.sin(t * 0.8) * 0.05;
      }
      if (bones.armLeft) {
        bones.armLeft.rotation.z = 0.22 + Math.sin(t * 2.2) * 0.03;
        bones.armLeft.rotation.x = Math.sin(t * 1.1) * 0.04;
      }
      if (bones.armRight) {
        bones.armRight.rotation.z = -0.22 - Math.sin(t * 2.2) * 0.03;
        bones.armRight.rotation.x = -0.15 + Math.sin(t * 1.1) * 0.04;
      }
      if (bones.legLeft) bones.legLeft.rotation.set(0, 0, 0.02);
      if (bones.legRight) bones.legRight.rotation.set(0, 0, -0.02);
      if (bones.cloakMount) bones.cloakMount.rotation.x = Math.sin(t * 3.0) * 0.05;
      break;
    }

    case 'walk': {
      const stride = Math.sin(t * 4.8);
      const bob = Math.abs(Math.cos(t * 4.8)) * 0.035;
      if (bones.torso) {
        bones.torso.position.set(0, baseTorsoY + bob, 0);
        bones.torso.rotation.y = -stride * 0.1;
      }
      if (bones.head) {
        bones.head.position.set(0, baseHeadY + bob * 0.6, 0);
        bones.head.rotation.y = stride * 0.05;
      }
      if (bones.legLeft) bones.legLeft.rotation.x = stride * 0.55;
      if (bones.legRight) bones.legRight.rotation.x = -stride * 0.55;
      if (bones.armLeft) bones.armLeft.rotation.x = -stride * 0.45;
      if (bones.armRight) bones.armRight.rotation.x = stride * 0.45;
      if (bones.cloakMount) bones.cloakMount.rotation.x = 0.15 + Math.abs(stride) * 0.1;
      break;
    }

    case 'sprint': {
      const stride = Math.sin(t * 8.0);
      const bob = Math.abs(Math.cos(t * 8.0)) * 0.055;
      if (bones.torso) {
        bones.torso.position.set(0, baseTorsoY + bob, 0.08);
        bones.torso.rotation.x = 0.22; // Lean forward
        bones.torso.rotation.y = -stride * 0.15;
      }
      if (bones.head) {
        bones.head.position.set(0, baseHeadY + bob * 0.7, 0.1);
        bones.head.rotation.x = -0.15; // Eyes on horizon
      }
      if (bones.legLeft) bones.legLeft.rotation.x = stride * 0.85;
      if (bones.legRight) bones.legRight.rotation.x = -stride * 0.85;
      if (bones.armLeft) {
        bones.armLeft.rotation.x = -stride * 0.75;
        bones.armLeft.rotation.z = 0.35;
      }
      if (bones.armRight) {
        bones.armRight.rotation.x = stride * 0.75;
        bones.armRight.rotation.z = -0.35;
      }
      if (bones.cloakMount) bones.cloakMount.rotation.x = 0.45 + Math.abs(stride) * 0.2;
      break;
    }

    case 'martial_kick': {
      const cycle = (t * 2.5) % (Math.PI * 2);
      const kickPhase = Math.sin(cycle);

      if (kickPhase > 0) {
        // High Roundhouse kick with right leg
        const kickHeight = kickPhase * 1.25;
        if (bones.torso) {
          bones.torso.rotation.z = 0.35 * kickPhase; // Lean back/away
          bones.torso.rotation.y = -0.4 * kickPhase; // Hip twist
        }
        if (bones.legRight) {
          bones.legRight.rotation.x = -0.6 * kickPhase;
          bones.legRight.rotation.z = -kickHeight;
        }
        if (bones.legLeft) {
          bones.legLeft.rotation.z = 0.15 * kickPhase; // Pivot leg
        }
        // Guard fists
        if (bones.armLeft) {
          bones.armLeft.rotation.x = -0.6;
          bones.armLeft.rotation.z = 0.4;
        }
        if (bones.armRight) {
          bones.armRight.rotation.x = -0.8;
          bones.armRight.rotation.z = -0.2;
        }
      } else {
        // Recovery / Low stance
        if (bones.torso) {
          bones.torso.rotation.set(0, 0, 0);
          bones.torso.position.y = baseTorsoY - 0.05;
        }
        if (bones.legLeft) bones.legLeft.rotation.x = 0.2;
        if (bones.legRight) bones.legRight.rotation.x = -0.2;
        if (bones.armLeft) bones.armLeft.rotation.x = -0.4;
        if (bones.armRight) bones.armRight.rotation.x = -0.4;
      }
      break;
    }

    case 'sword_combo': {
      const swing = Math.sin(t * 3.5);
      const verticalChop = Math.cos(t * 3.5);

      if (bones.torso) {
        bones.torso.rotation.y = swing * 0.35;
        bones.torso.position.y = baseTorsoY + Math.abs(verticalChop) * 0.03;
      }
      if (bones.armRight) {
        bones.armRight.rotation.x = -0.9 + swing * 0.6;
        bones.armRight.rotation.y = swing * 0.5;
        bones.armRight.rotation.z = -0.3 + verticalChop * 0.4;
      }
      if (bones.armLeft) {
        bones.armLeft.rotation.x = -0.5 - swing * 0.3;
        bones.armLeft.rotation.z = 0.25;
      }
      if (bones.weaponMount) {
        bones.weaponMount.rotation.x = 0.6 + swing * 0.9;
        bones.weaponMount.rotation.z = verticalChop * 0.5;
      }
      if (bones.legLeft) bones.legLeft.rotation.x = swing * 0.3;
      if (bones.legRight) bones.legRight.rotation.x = -swing * 0.3;
      break;
    }

    case 'defense_block': {
      const pulse = Math.sin(t * 2.0) * 0.01;
      if (bones.torso) {
        bones.torso.position.y = baseTorsoY - 0.08 + pulse; // Low rooted center of gravity
        bones.torso.rotation.x = 0.08;
      }
      if (bones.armLeft) {
        bones.armLeft.position.set(-0.16, 1.05, 0.22);
        bones.armLeft.rotation.set(-0.85, 0.4, 0.3); // Shield guard
      }
      if (bones.armRight) {
        bones.armRight.position.set(0.16, 1.05, 0.20);
        bones.armRight.rotation.set(-0.95, -0.4, -0.3); // High block
      }
      if (bones.legLeft) {
        bones.legLeft.rotation.x = 0.25;
        bones.legLeft.rotation.z = 0.15;
      }
      if (bones.legRight) {
        bones.legRight.rotation.x = -0.25;
        bones.legRight.rotation.z = -0.15;
      }
      break;
    }

    case 'magic_cast': {
      const hover = Math.sin(t * 1.8) * 0.07;
      const swirl = Math.sin(t * 2.5);
      if (bones.torso) {
        bones.torso.position.y = baseTorsoY + 0.12 + hover; // Levitation
        bones.torso.rotation.y = swirl * 0.08;
        bones.torso.rotation.x = -0.06;
      }
      if (bones.head) {
        bones.head.position.y = baseHeadY + 0.12 + hover;
        bones.head.rotation.x = -0.15; // Looking upward
      }
      // Floating arms gathering energy
      if (bones.armLeft) {
        bones.armLeft.rotation.x = -0.7 + Math.sin(t * 2.5) * 0.15;
        bones.armLeft.rotation.z = 0.45 + Math.cos(t * 2.5) * 0.1;
      }
      if (bones.armRight) {
        bones.armRight.rotation.x = -0.7 - Math.sin(t * 2.5) * 0.15;
        bones.armRight.rotation.z = -0.45 - Math.cos(t * 2.5) * 0.1;
      }
      // Dangling relaxed feet
      if (bones.legLeft) {
        bones.legLeft.rotation.x = 0.15 + hover * 0.5;
        bones.legLeft.rotation.z = 0.05;
      }
      if (bones.legRight) {
        bones.legRight.rotation.x = -0.1 + hover * 0.5;
        bones.legRight.rotation.z = -0.05;
      }
      if (bones.cloakMount) bones.cloakMount.rotation.x = -0.2 - Math.abs(hover) * 1.2;
      break;
    }

    case 'victory': {
      const cheer = Math.sin(t * 3.0) * 0.03;
      if (bones.torso) {
        bones.torso.position.y = baseTorsoY + cheer;
        bones.torso.rotation.x = -0.12; // Proud chest out
      }
      if (bones.head) {
        bones.head.rotation.x = -0.25; // Chin raised
      }
      // Right fist held high to the sky
      if (bones.armRight) {
        bones.armRight.position.set(0.24, 1.25, 0);
        bones.armRight.rotation.set(-0.2, 0, -2.4 + Math.sin(t * 4.0) * 0.08);
      }
      // Left arm on waist / akimbo
      if (bones.armLeft) {
        bones.armLeft.rotation.set(-0.3, 0.2, 0.7);
      }
      if (bones.legLeft) bones.legLeft.rotation.set(0, 0, 0.1);
      if (bones.legRight) bones.legRight.rotation.set(0, 0, -0.1);
      break;
    }
  }
}

/**
 * Exports transferable skeletal animation keyframe tracks as JSON
 */
export function exportTransferableAnimationJSON(
  animationId: TransferableAnimationId,
  characterName: string = 'Humanoid'
): string {
  const fps = 30;
  const duration = 2.0;
  const frameCount = Math.floor(fps * duration);
  const keyframes: Array<{
    time: number;
    bones: Record<string, { position: number[]; rotation: number[] }>;
  }> = [];

  // Mock rig to sample transforms
  const dummyBones: CharacterRigBones = {
    torso: new THREE.Mesh(),
    head: new THREE.Mesh(),
    armLeft: new THREE.Mesh(),
    armRight: new THREE.Mesh(),
    legLeft: new THREE.Mesh(),
    legRight: new THREE.Mesh(),
  };

  for (let i = 0; i <= frameCount; i++) {
    const t = (i / frameCount) * duration;
    evaluateSkeletalKinematics(dummyBones, animationId, t, 1.0);

    keyframes.push({
      time: parseFloat(t.toFixed(3)),
      bones: {
        Torso: {
          position: [
            parseFloat((dummyBones.torso?.position.x || 0).toFixed(4)),
            parseFloat((dummyBones.torso?.position.y || 1.05).toFixed(4)),
            parseFloat((dummyBones.torso?.position.z || 0).toFixed(4)),
          ],
          rotation: [
            parseFloat((dummyBones.torso?.rotation.x || 0).toFixed(4)),
            parseFloat((dummyBones.torso?.rotation.y || 0).toFixed(4)),
            parseFloat((dummyBones.torso?.rotation.z || 0).toFixed(4)),
          ],
        },
        Head: {
          position: [
            parseFloat((dummyBones.head?.position.x || 0).toFixed(4)),
            parseFloat((dummyBones.head?.position.y || 1.48).toFixed(4)),
            parseFloat((dummyBones.head?.position.z || 0).toFixed(4)),
          ],
          rotation: [
            parseFloat((dummyBones.head?.rotation.x || 0).toFixed(4)),
            parseFloat((dummyBones.head?.rotation.y || 0).toFixed(4)),
            parseFloat((dummyBones.head?.rotation.z || 0).toFixed(4)),
          ],
        },
        Arm_Left: {
          position: [-0.3, 0.98, 0],
          rotation: [
            parseFloat((dummyBones.armLeft?.rotation.x || 0).toFixed(4)),
            parseFloat((dummyBones.armLeft?.rotation.y || 0).toFixed(4)),
            parseFloat((dummyBones.armLeft?.rotation.z || 0).toFixed(4)),
          ],
        },
        Arm_Right: {
          position: [0.3, 0.98, 0],
          rotation: [
            parseFloat((dummyBones.armRight?.rotation.x || 0).toFixed(4)),
            parseFloat((dummyBones.armRight?.rotation.y || 0).toFixed(4)),
            parseFloat((dummyBones.armRight?.rotation.z || 0).toFixed(4)),
          ],
        },
        Leg_Left: {
          position: [-0.13, 0.4, 0],
          rotation: [
            parseFloat((dummyBones.legLeft?.rotation.x || 0).toFixed(4)),
            parseFloat((dummyBones.legLeft?.rotation.y || 0).toFixed(4)),
            parseFloat((dummyBones.legLeft?.rotation.z || 0).toFixed(4)),
          ],
        },
        Leg_Right: {
          position: [0.13, 0.4, 0],
          rotation: [
            parseFloat((dummyBones.legRight?.rotation.x || 0).toFixed(4)),
            parseFloat((dummyBones.legRight?.rotation.y || 0).toFixed(4)),
            parseFloat((dummyBones.legRight?.rotation.z || 0).toFixed(4)),
          ],
        },
      },
    });
  }

  const exportData = {
    format: 'CharacterGenHumanoidAnimation',
    version: '1.2.0',
    animationId,
    targetRig: 'HumanoidStandardBiped',
    durationSeconds: duration,
    fps,
    characterName,
    exportedAt: new Date().toISOString(),
    keyframes,
  };

  return JSON.stringify(exportData, null, 2);
}
