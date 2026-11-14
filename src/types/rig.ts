import type * as THREE from 'three';

/** Os (meshes / groupes) du mannequin procédural articulé. */
export interface CharacterRigBones {
  torso?: THREE.Mesh;
  head?: THREE.Mesh;
  armLeft?: THREE.Mesh;
  elbowLeft?: THREE.Group;
  handLeft?: THREE.Group;
  armRight?: THREE.Mesh;
  elbowRight?: THREE.Group;
  handRight?: THREE.Group;
  legLeft?: THREE.Mesh;
  kneeLeft?: THREE.Group;
  legRight?: THREE.Mesh;
  kneeRight?: THREE.Group;
  footLeft?: THREE.Mesh;
  footRight?: THREE.Mesh;
  weaponMount?: THREE.Group;
  cloakMount?: THREE.Group;
  hairMount?: THREE.Group;
  eyewearMount?: THREE.Group;
  armorMount?: THREE.Group;
  beltMount?: THREE.Group;
  glovesLeftMount?: THREE.Group;
  glovesRightMount?: THREE.Group;
}
