/**
 * Constructeurs de scène du mannequin 3D (extraits de ThreeCharacterViewport.tsx) :
 * matériaux, corps anatomique, garde-robe, accessoire et diorama. Fonctions pures three.js,
 * sans état React.
 */
import * as THREE from 'three';
import type { CharacterRigBones } from '../types/rig';
import { WardrobeItem, CharacterWardrobeState } from '../types/wardrobe';
import { AnatomicalProportions, DEFAULT_PROPORTIONS, createSculptedHumanoidMeshes } from './humanoidCalibrator';

// Shading mode applicator
export function applyShaderMode(mesh: THREE.Mesh, mode: 'pbr' | 'toon' | 'normal' | 'clay', wireframe: boolean) {
  if (!mesh.userData.originalMaterial) {
    mesh.userData.originalMaterial = mesh.material;
  }

  if (mode === 'normal') {
    mesh.material = new THREE.MeshNormalMaterial({ wireframe });
  } else if (mode === 'clay') {
    mesh.material = new THREE.MeshStandardMaterial({
      color: 0xd9c5b2,
      roughness: 0.85,
      metalness: 0.05,
      wireframe,
    });
  } else {
    mesh.material = mesh.userData.originalMaterial;
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => {
        if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
      });
    } else if (mesh.material && 'wireframe' in mesh.material) {
      (mesh.material as THREE.MeshStandardMaterial).wireframe = wireframe;
    }
  }
}

// Builds the Sculpted Anatomical Humanoid Base Body with organic proportions
export function buildAnatomicalBaseBody(
  group: THREE.Group,
  skelGroup: THREE.Group,
  bones: CharacterRigBones,
  proportions: AnatomicalProportions = DEFAULT_PROPORTIONS,
  style: 'studio' | 'skin' | 'wireframe' = 'studio',
  frontTexture?: THREE.Texture | null
) {
  // Clear any existing body meshes from group
  const toRemove: THREE.Object3D[] = [];
  group.children.forEach((c) => {
    if (
      c.name === 'TorsoBase' ||
      c.name === 'HeadBase' ||
      c.name.includes('Arm') ||
      c.name.includes('Leg') ||
      c.name.includes('Foot') ||
      c.name.includes('Briefs') ||
      c.name.includes('Assembly')
    ) {
      toRemove.push(c);
    }
  });
  toRemove.forEach((c) => group.remove(c));

  // Clear previous skeleton visualization
  while (skelGroup.children.length > 0) {
    skelGroup.remove(skelGroup.children[0]);
  }

  const p = proportions;
  const skinColor = style === 'studio' ? 0xe2e8f0 : 0xe8d7c3;
  const undergarmentColor = 0x1e293b;

  const sculpted = createSculptedHumanoidMeshes(p, skinColor, undergarmentColor, frontTexture);

  // 1. Torso
  const torso = sculpted.torsoGroup as unknown as THREE.Mesh;
  torso.name = 'TorsoBase';
  const torsoBaseY = p.legLength + p.torsoHeight * 0.42;
  torso.position.set(0, torsoBaseY, 0);
  torso.userData.baseY = torsoBaseY;
  group.add(torso);
  bones.torso = torso;

  // Mounts on Torso
  const armorMount = new THREE.Group();
  armorMount.name = 'ArmorMount';
  torso.add(armorMount);
  bones.armorMount = armorMount;

  const beltMount = new THREE.Group();
  beltMount.name = 'BeltMount';
  beltMount.position.set(0, -0.15, 0);
  torso.add(beltMount);
  bones.beltMount = beltMount;

  const cloakMount = new THREE.Group();
  cloakMount.name = 'CloakMount';
  cloakMount.position.set(0, 0.15, -0.16);
  torso.add(cloakMount);
  bones.cloakMount = cloakMount;

  // 2. Head
  const head = sculpted.headGroup as unknown as THREE.Mesh;
  head.name = 'HeadBase';
  const headBaseY = torsoBaseY + p.torsoHeight * 0.52 + 0.16 * p.headScale;
  head.position.set(0, headBaseY, 0);
  head.userData.baseY = headBaseY;
  group.add(head);
  bones.head = head;

  const hairMount = new THREE.Group();
  hairMount.name = 'HairMount';
  head.add(hairMount);
  bones.hairMount = hairMount;

  const eyewearMount = new THREE.Group();
  eyewearMount.name = 'EyewearMount';
  head.add(eyewearMount);
  bones.eyewearMount = eyewearMount;

  // 3. Arms (with articulated elbow & hand pivots)
  const armL = sculpted.armL.armGroup as unknown as THREE.Mesh;
  const armR = sculpted.armR.armGroup as unknown as THREE.Mesh;
  const shoulderY = torsoBaseY + p.torsoHeight * 0.32;
  const shoulderX = p.shoulderWidth * 0.52;

  armL.position.set(-shoulderX, shoulderY, 0);
  armL.userData.baseX = shoulderX;
  armL.userData.baseY = shoulderY;
  armL.rotation.z = p.armPoseAngle;
  group.add(armL);
  bones.armLeft = armL;
  bones.elbowLeft = sculpted.armL.elbowGroup;
  bones.handLeft = sculpted.armL.handGroup;

  armR.position.set(shoulderX, shoulderY, 0);
  armR.userData.baseX = shoulderX;
  armR.userData.baseY = shoulderY;
  armR.rotation.z = -p.armPoseAngle;
  group.add(armR);
  bones.armRight = armR;
  bones.elbowRight = sculpted.armR.elbowGroup;
  bones.handRight = sculpted.armR.handGroup;

  const glovesLeftMount = new THREE.Group();
  glovesLeftMount.name = 'GlovesLeftMount';
  sculpted.armL.handGroup.add(glovesLeftMount);
  bones.glovesLeftMount = glovesLeftMount;

  const glovesRightMount = new THREE.Group();
  glovesRightMount.name = 'GlovesRightMount';
  sculpted.armR.handGroup.add(glovesRightMount);
  bones.glovesRightMount = glovesRightMount;

  const weaponMount = new THREE.Group();
  weaponMount.name = 'WeaponMount';
  weaponMount.position.set(0, -0.04, 0.08);
  sculpted.armR.handGroup.add(weaponMount);
  bones.weaponMount = weaponMount;

  // 4. Legs (with articulated knee & foot pivots)
  const legL = sculpted.legL.legGroup as unknown as THREE.Mesh;
  const legR = sculpted.legR.legGroup as unknown as THREE.Mesh;
  const hipX = p.hipWidth * 0.38;
  const hipY = p.legLength * 0.98;

  legL.position.set(-hipX, hipY, 0);
  legL.userData.baseX = hipX;
  legL.userData.baseY = hipY;
  group.add(legL);
  bones.legLeft = legL;
  bones.kneeLeft = sculpted.legL.kneeGroup;

  legR.position.set(hipX, hipY, 0);
  legR.userData.baseX = hipX;
  legR.userData.baseY = hipY;
  group.add(legR);
  bones.legRight = legR;
  bones.kneeRight = sculpted.legR.kneeGroup;

  // Feet
  bones.footLeft = sculpted.legL.footGroup as unknown as THREE.Mesh;
  bones.footRight = sculpted.legR.footGroup as unknown as THREE.Mesh;

  // Wireframe style support
  if (style === 'wireframe') {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if ('wireframe' in m) m.wireframe = true;
          });
        } else if ('wireframe' in mat) {
          (mat as THREE.MeshStandardMaterial).wireframe = true;
        }
      }
    });
  }

  // 5. Dynamic Live Skeleton Rig visualizer (16 joints + 15 bone segments updated in real time)
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const ptsMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.065, sizeAttenuation: true });
  const ptsObj = new THREE.Points(ptsGeo, ptsMat);
  ptsObj.name = 'SkeletonDynamicJoints';
  ptsObj.frustumCulled = false;
  skelGroup.add(ptsObj);

  const linesGeo = new THREE.BufferGeometry();
  linesGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
  const linesMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.9 });
  const lineSegments = new THREE.LineSegments(linesGeo, linesMat);
  lineSegments.name = 'SkeletonDynamicLines';
  lineSegments.frustumCulled = false;
  skelGroup.add(lineSegments);
}

// Dynamically attaches/updates the 3D meshes for each equipped wardrobe slot
export function updateWardrobeMeshes(
  bones: CharacterRigBones,
  wardrobe: CharacterWardrobeState,
  customWardrobeItems: WardrobeItem[] = [],
  customEquippedProp?: THREE.Group | null
) {
  // Clear previous slot attachments
  if (bones.hairMount) bones.hairMount.clear();
  if (bones.eyewearMount) bones.eyewearMount.clear();
  if (bones.armorMount) bones.armorMount.clear();
  if (bones.beltMount) bones.beltMount.clear();
  if (bones.glovesLeftMount) bones.glovesLeftMount.clear();
  if (bones.glovesRightMount) bones.glovesRightMount.clear();
  if (bones.weaponMount) bones.weaponMount.clear();
  if (bones.cloakMount) bones.cloakMount.clear();

  // Remove existing footwear if any
  bones.footLeft?.parent?.getObjectByName('FootwearLeft')?.removeFromParent();
  bones.footRight?.parent?.getObjectByName('FootwearRight')?.removeFromParent();

  // 1. HAIR SLOT
  if (wardrobe.hair && bones.hairMount) {
    if (wardrobe.hair === 'hair_spiky_bandeau') {
      // Meshy / Shonen anime spiky hair + blue headband
      const hairMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.65 });
      // Hair crown spikes
      for (let i = 0; i < 9; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.06, 0.22, 5);
        const spike = new THREE.Mesh(spikeGeo, hairMat);
        const angle = (i / 9) * Math.PI * 1.8 - Math.PI * 0.9;
        spike.position.set(Math.sin(angle) * 0.14, 0.14 + Math.cos(angle) * 0.05, Math.cos(angle) * 0.08);
        spike.rotation.z = -angle * 0.55;
        spike.rotation.x = 0.2;
        bones.hairMount.add(spike);
      }
      // Top spike clump
      const topSpikeGeo = new THREE.ConeGeometry(0.08, 0.26, 6);
      const topSpike = new THREE.Mesh(topSpikeGeo, hairMat);
      topSpike.position.set(0, 0.22, 0);
      bones.hairMount.add(topSpike);

      // Blue headband ring around forehead
      const headbandMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
      const bandGeo = new THREE.TorusGeometry(0.162, 0.024, 8, 24);
      const band = new THREE.Mesh(bandGeo, headbandMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.04, 0);
      bones.hairMount.add(band);

      // Rear knot and hanging ribbon tails
      const knotGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const knot = new THREE.Mesh(knotGeo, headbandMat);
      knot.position.set(0, 0.04, -0.165);
      bones.hairMount.add(knot);

      const ribbonMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, side: THREE.DoubleSide });
      const ribbonGeo = new THREE.PlaneGeometry(0.04, 0.28);
      const ribbon1 = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon1.position.set(-0.03, -0.1, -0.17);
      ribbon1.rotation.z = 0.2;
      ribbon1.rotation.y = 0.1;
      const ribbon2 = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon2.position.set(0.03, -0.09, -0.17);
      ribbon2.rotation.z = -0.3;
      ribbon2.rotation.y = -0.1;
      bones.hairMount.add(ribbon1, ribbon2);
    } else if (wardrobe.hair === 'hair_braids') {
      const braidMat = new THREE.MeshStandardMaterial({ color: 0xd4d8dd, roughness: 0.7 });
      const braidGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.45, 8);
      const bL = new THREE.Mesh(braidGeo, braidMat);
      bL.position.set(-0.16, -0.12, 0.05);
      bL.rotation.z = 0.15;
      const bR = new THREE.Mesh(braidGeo, braidMat);
      bR.position.set(0.16, -0.12, 0.05);
      bR.rotation.z = -0.15;
      bones.hairMount.add(bL, bR);
    } else if (wardrobe.hair === 'hair_warrior_short') {
      const shortMat = new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.8 });
      const capGeo = new THREE.SphereGeometry(0.165, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.Mesh(capGeo, shortMat);
      cap.position.y = 0.01;
      bones.hairMount.add(cap);
    } else if (wardrobe.hair === 'hair_anime_spiky') {
      const spikyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 });
      for (let i = 0; i < 7; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.05, 0.18, 5);
        const spike = new THREE.Mesh(spikeGeo, spikyMat);
        const angle = (i / 7) * Math.PI * 1.6 - Math.PI * 0.8;
        spike.position.set(Math.sin(angle) * 0.14, 0.14 + Math.cos(angle) * 0.04, Math.cos(angle) * 0.08);
        spike.rotation.z = -angle * 0.6;
        bones.hairMount.add(spike);
      }
    } else if (wardrobe.hair === 'hair_viking_bun') {
      const bunMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 });
      const bunGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const bun = new THREE.Mesh(bunGeo, bunMat);
      bun.position.set(0, 0.18, -0.06);
      bones.hairMount.add(bun);
    } else {
      // User custom extracted hair piece
      const customItem = customWardrobeItems.find((i) => i.id === wardrobe.hair);
      if (customItem) {
        const hairMat = new THREE.MeshStandardMaterial({ color: customItem.color || 0x1e293b, roughness: 0.6 });
        const capGeo = new THREE.SphereGeometry(0.17, 12, 12);
        const cap = new THREE.Mesh(capGeo, hairMat);
        cap.position.y = 0.02;
        bones.hairMount.add(cap);
      }
    }
  }

  // 2. EYEWEAR SLOT
  if (wardrobe.eyewear && bones.eyewearMount) {
    if (wardrobe.eyewear === 'eyewear_cyber_visor') {
      const visorGeo = new THREE.BoxGeometry(0.24, 0.06, 0.08);
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.6,
        roughness: 0.1,
      });
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.02, 0.14);
      bones.eyewearMount.add(visor);
    } else if (wardrobe.eyewear === 'eyewear_aviator') {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.2 });
      const frameGeo = new THREE.TorusGeometry(0.04, 0.01, 8, 16);
      const leftLens = new THREE.Mesh(frameGeo, glassMat);
      leftLens.position.set(-0.06, 0.02, 0.15);
      const rightLens = new THREE.Mesh(frameGeo, glassMat);
      rightLens.position.set(0.06, 0.02, 0.15);
      bones.eyewearMount.add(leftLens, rightLens);
    } else if (wardrobe.eyewear === 'eyewear_monocle') {
      const monoMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9 });
      const monoGeo = new THREE.TorusGeometry(0.045, 0.008, 8, 16);
      const monocle = new THREE.Mesh(monoGeo, monoMat);
      monocle.position.set(0.06, 0.02, 0.15);
      bones.eyewearMount.add(monocle);
    }
  }

  // 3. ARMOR & CLOTHING SLOT (Kimonos, Haori, Cuirass, Robes)
  if (bones.armorMount) {
    if (wardrobe.clothing === 'clothing_karate_gi') {
      // White karate dogi with crossed collar
      const giMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.75 });
      const giGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.48, 14);
      const gi = new THREE.Mesh(giGeo, giMat);
      gi.position.y = 0.01;
      bones.armorMount.add(gi);

      // Folded V-lapels on chest
      const lapelGeo = new THREE.BoxGeometry(0.05, 0.25, 0.03);
      const lapelL = new THREE.Mesh(lapelGeo, giMat);
      lapelL.position.set(-0.06, 0.08, 0.15);
      lapelL.rotation.z = -0.4;
      const lapelR = new THREE.Mesh(lapelGeo, giMat);
      lapelR.position.set(0.06, 0.08, 0.15);
      lapelR.rotation.z = 0.4;
      bones.armorMount.add(lapelL, lapelR);

      // Flared sleeves
      if (bones.armLeft && bones.armRight) {
        const sleeveGeo = new THREE.CylinderGeometry(0.085, 0.07, 0.20, 10);
        const sL = new THREE.Mesh(sleeveGeo, giMat);
        sL.position.set(0, 0.05, 0);
        const sR = new THREE.Mesh(sleeveGeo, giMat);
        sR.position.set(0, 0.05, 0);
        bones.armorMount.add(sL, sR);
      }
    } else if (wardrobe.clothing === 'clothing_kimono') {
      const kimonoMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.65 });
      const kimonoGeo = new THREE.CylinderGeometry(0.25, 0.32, 0.58, 14);
      const kimono = new THREE.Mesh(kimonoGeo, kimonoMat);
      kimono.position.y = -0.04;
      bones.armorMount.add(kimono);
    } else if (wardrobe.clothing === 'clothing_haori') {
      const haoriMat = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.7 });
      const haoriGeo = new THREE.CylinderGeometry(0.26, 0.33, 0.52, 14);
      const haori = new THREE.Mesh(haoriGeo, haoriMat);
      haori.position.y = 0;
      bones.armorMount.add(haori);
    } else if (wardrobe.armor === 'armor_leather_cuirass') {
      const cuirassGeo = new THREE.CylinderGeometry(0.25, 0.22, 0.44, 14);
      const cuirassMat = new THREE.MeshStandardMaterial({ color: 0x5a3e2b, roughness: 0.65, metalness: 0.25 });
      const cuirass = new THREE.Mesh(cuirassGeo, cuirassMat);
      cuirass.position.y = 0.02;
      bones.armorMount.add(cuirass);

      const pauldronGeo = new THREE.SphereGeometry(0.12, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const pauldronMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.8, roughness: 0.3 });
      const pauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
      pauldron.position.set(-0.28, 0.18, 0);
      pauldron.rotation.z = -Math.PI / 4;
      bones.armorMount.add(pauldron);
    } else if (wardrobe.armor === 'armor_steel_plate') {
      const plateGeo = new THREE.CylinderGeometry(0.26, 0.23, 0.48, 14);
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.92, roughness: 0.18 });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.y = 0.02;
      bones.armorMount.add(plate);
    } else if (wardrobe.clothing === 'clothing_linen_tunic') {
      const tunicGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.52, 14);
      const tunicMat = new THREE.MeshStandardMaterial({ color: 0xd6c7b2, roughness: 0.9 });
      const tunic = new THREE.Mesh(tunicGeo, tunicMat);
      tunic.position.y = -0.02;
      bones.armorMount.add(tunic);
    } else if (wardrobe.clothing === 'clothing_mage_robe') {
      const robeGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.65, 14);
      const robeMat = new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.7 });
      const robe = new THREE.Mesh(robeGeo, robeMat);
      robe.position.y = -0.1;
      bones.armorMount.add(robe);
    }
  }

  // 4. BELT SLOT (Ceintures & Obi)
  if (wardrobe.belt && bones.beltMount) {
    if (wardrobe.belt === 'belt_black_obi') {
      // Black martial arts obi with front knot and hanging straps
      const obiMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
      const obiBandGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.09, 16);
      const obiBand = new THREE.Mesh(obiBandGeo, obiMat);
      bones.beltMount.add(obiBand);

      const knotGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const knot = new THREE.Mesh(knotGeo, obiMat);
      knot.position.set(0, 0, 0.19);
      bones.beltMount.add(knot);

      const strapGeo = new THREE.BoxGeometry(0.04, 0.24, 0.015);
      const strap1 = new THREE.Mesh(strapGeo, obiMat);
      strap1.position.set(-0.025, -0.12, 0.195);
      strap1.rotation.z = 0.1;
      const strap2 = new THREE.Mesh(strapGeo, obiMat);
      strap2.position.set(0.025, -0.11, 0.195);
      strap2.rotation.z = -0.15;
      bones.beltMount.add(strap1, strap2);
    } else if (wardrobe.belt === 'belt_obi_red') {
      const obiMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
      const obiBandGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
      const obiBand = new THREE.Mesh(obiBandGeo, obiMat);
      bones.beltMount.add(obiBand);

      // Rear obi bow knot
      const bowGeo = new THREE.BoxGeometry(0.18, 0.10, 0.06);
      const bow = new THREE.Mesh(bowGeo, obiMat);
      bow.position.set(0, 0, -0.21);
      bones.beltMount.add(bow);
    } else if (wardrobe.belt === 'belt_obi_gold') {
      const obiMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.4, roughness: 0.4 });
      const obiBandGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
      const obiBand = new THREE.Mesh(obiBandGeo, obiMat);
      bones.beltMount.add(obiBand);
    } else if (wardrobe.belt === 'belt_leather') {
      const leatherMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
      const beltGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.06, 16);
      const belt = new THREE.Mesh(beltGeo, leatherMat);
      bones.beltMount.add(belt);

      // Buckle
      const buckleMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85 });
      const buckleGeo = new THREE.BoxGeometry(0.06, 0.07, 0.02);
      const buckle = new THREE.Mesh(buckleGeo, buckleMat);
      buckle.position.set(0, 0, 0.19);
      bones.beltMount.add(buckle);
    }
  }

  // 5. GLOVES SLOT (Gants, Mitaines & Gantelets)
  if (wardrobe.gloves) {
    if (wardrobe.gloves === 'gloves_sparring_blue' && bones.glovesLeftMount && bones.glovesRightMount) {
      const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
      const fistGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const fL = new THREE.Mesh(fistGeo, gloveMat);
      bones.glovesLeftMount.add(fL);
      const fR = new THREE.Mesh(fistGeo, gloveMat);
      bones.glovesRightMount.add(fR);

      // Wrist strap
      const strapGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 10);
      const strapMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8 });
      const sL = new THREE.Mesh(strapGeo, strapMat);
      sL.position.y = 0.06;
      bones.glovesLeftMount.add(sL);
      const sR = new THREE.Mesh(strapGeo, strapMat);
      sR.position.y = 0.06;
      bones.glovesRightMount.add(sR);
    } else if (wardrobe.gloves === 'gloves_leather' && bones.glovesLeftMount && bones.glovesRightMount) {
      const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.7 });
      const cuffGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10);
      const cL = new THREE.Mesh(cuffGeo, gloveMat);
      bones.glovesLeftMount.add(cL);
      const cR = new THREE.Mesh(cuffGeo, gloveMat);
      bones.glovesRightMount.add(cR);
    } else if (wardrobe.gloves === 'gloves_steel_gauntlets' && bones.glovesLeftMount && bones.glovesRightMount) {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
      const gauntletGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.16, 10);
      const gL = new THREE.Mesh(gauntletGeo, steelMat);
      bones.glovesLeftMount.add(gL);
      const gR = new THREE.Mesh(gauntletGeo, steelMat);
      bones.glovesRightMount.add(gR);
    }
  }

  // 6. FOOTWEAR SLOT (Bottes, Sandales, Geta, Baskets)
  const footParent = bones.footLeft?.parent;
  if (footParent) {
    if (wardrobe.footwear === 'footwear_martial_sneakers') {
      const upperMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
      const soleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
      const upperGeo = new THREE.BoxGeometry(0.12, 0.10, 0.22);
      const soleGeo = new THREE.BoxGeometry(0.125, 0.03, 0.23);

      const bL = new THREE.Group();
      bL.name = 'FootwearLeft';
      bL.position.set(-0.13, 0.05, 0.03);
      const upL = new THREE.Mesh(upperGeo, upperMat);
      const soL = new THREE.Mesh(soleGeo, soleMat);
      soL.position.y = -0.04;
      bL.add(upL, soL);

      const bR = new THREE.Group();
      bR.name = 'FootwearRight';
      bR.position.set(0.13, 0.05, 0.03);
      const upR = new THREE.Mesh(upperGeo, upperMat);
      const soR = new THREE.Mesh(soleGeo, soleMat);
      soR.position.y = -0.04;
      bR.add(upR, soR);

      footParent.add(bL, bR);
    } else if (wardrobe.footwear === 'footwear_geta') {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
      const platGeo = new THREE.BoxGeometry(0.12, 0.035, 0.22);
      const toothGeo = new THREE.BoxGeometry(0.11, 0.06, 0.02);

      const gL = new THREE.Group();
      gL.name = 'FootwearLeft';
      gL.position.set(-0.13, 0.06, 0.03);
      const pL = new THREE.Mesh(platGeo, woodMat);
      const tL1 = new THREE.Mesh(toothGeo, woodMat);
      tL1.position.set(0, -0.045, -0.05);
      const tL2 = new THREE.Mesh(toothGeo, woodMat);
      tL2.position.set(0, -0.045, 0.05);
      gL.add(pL, tL1, tL2);

      const gR = new THREE.Group();
      gR.name = 'FootwearRight';
      gR.position.set(0.13, 0.06, 0.03);
      const pR = new THREE.Mesh(platGeo, woodMat);
      const tR1 = new THREE.Mesh(toothGeo, woodMat);
      tR1.position.set(0, -0.045, -0.05);
      const tR2 = new THREE.Mesh(toothGeo, woodMat);
      tR2.position.set(0, -0.045, 0.05);
      gR.add(pR, tR1, tR2);

      footParent.add(gL, gR);
    } else if (wardrobe.footwear === 'footwear_reinforced_boots') {
      const bootMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.7, metalness: 0.2 });
      const bootGeo = new THREE.BoxGeometry(0.12, 0.32, 0.20);
      const bL = new THREE.Mesh(bootGeo, bootMat);
      bL.name = 'FootwearLeft';
      bL.position.set(-0.13, 0.16, 0.03);
      const bR = new THREE.Mesh(bootGeo, bootMat);
      bR.name = 'FootwearRight';
      bR.position.set(0.13, 0.16, 0.03);
      footParent.add(bL, bR);
    } else if (wardrobe.footwear === 'footwear_knight_boots') {
      const knightMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
      const bootGeo = new THREE.BoxGeometry(0.13, 0.34, 0.21);
      const bL = new THREE.Mesh(bootGeo, knightMat);
      bL.name = 'FootwearLeft';
      bL.position.set(-0.13, 0.16, 0.03);
      const bR = new THREE.Mesh(bootGeo, knightMat);
      bR.name = 'FootwearRight';
      bR.position.set(0.13, 0.16, 0.03);
      footParent.add(bL, bR);
    } else if (wardrobe.footwear === 'footwear_gladiator_sandals') {
      const sandalMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
      const soleGeo = new THREE.BoxGeometry(0.11, 0.03, 0.21);
      const sL = new THREE.Mesh(soleGeo, sandalMat);
      sL.name = 'FootwearLeft';
      sL.position.set(-0.13, 0.02, 0.04);
      const sR = new THREE.Mesh(soleGeo, sandalMat);
      sR.name = 'FootwearRight';
      sR.position.set(0.13, 0.02, 0.04);
      footParent.add(sL, sR);
    } else if (wardrobe.footwear === 'footwear_leather_shoes') {
      const shoeMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 });
      const shoeGeo = new THREE.BoxGeometry(0.11, 0.12, 0.20);
      const sL = new THREE.Mesh(shoeGeo, shoeMat);
      sL.name = 'FootwearLeft';
      sL.position.set(-0.13, 0.06, 0.03);
      const sR = new THREE.Mesh(shoeGeo, shoeMat);
      sR.name = 'FootwearRight';
      sR.position.set(0.13, 0.06, 0.03);
      footParent.add(sL, sR);
    }
  }

  // 7. WEAPON SLOT (Katana, Épée, Bouclier)
  if (wardrobe.weapon && bones.weaponMount) {
    if (wardrobe.weapon === 'weapon_katana') {
      const bladeGeo = new THREE.BoxGeometry(0.04, 0.85, 0.012);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.40;
      blade.rotation.z = 0.05;

      const tsubaMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8 });
      const tsubaGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16);
      const tsuba = new THREE.Mesh(tsubaGeo, tsubaMat);
      tsuba.position.y = -0.02;

      const tsukaMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
      const tsukaGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10);
      const tsuka = new THREE.Mesh(tsukaGeo, tsukaMat);
      tsuka.position.y = -0.13;

      bones.weaponMount.add(blade, tsuba, tsuka);
    } else if (wardrobe.weapon === 'weapon_runic_sword') {
      const bladeGeo = new THREE.BoxGeometry(0.06, 0.75, 0.015);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.9, roughness: 0.2 });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.35;
      blade.castShadow = true;

      const guardGeo = new THREE.BoxGeometry(0.20, 0.03, 0.04);
      const guardMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, metalness: 0.6, roughness: 0.4 });
      const guard = new THREE.Mesh(guardGeo, guardMat);
      guard.position.y = -0.02;

      bones.weaponMount.add(blade, guard);
    } else if (wardrobe.weapon === 'weapon_viking_shield') {
      const shieldGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20);
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.rotation.z = Math.PI / 2;
      shield.position.set(-0.05, 0.1, 0);

      const umboGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const umboMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.9 });
      const umbo = new THREE.Mesh(umboGeo, umboMat);
      umbo.position.set(0, 0.02, 0);
      shield.add(umbo);

      bones.weaponMount.add(shield);
    }
  }

  // 8. CLOAK SLOT
  if (wardrobe.cloak && bones.cloakMount) {
    if (wardrobe.cloak === 'cloak_forest') {
      const cloakGeo = new THREE.PlaneGeometry(0.55, 0.85);
      const cloakMat = new THREE.MeshStandardMaterial({ color: 0x243b2c, roughness: 0.9, side: THREE.DoubleSide });
      const cloak = new THREE.Mesh(cloakGeo, cloakMat);
      cloak.position.set(0, -0.3, 0);
      cloak.rotation.x = -0.08;
      cloak.castShadow = true;
      bones.cloakMount.add(cloak);
    } else if (wardrobe.cloak === 'cloak_fur') {
      const furGeo = new THREE.BoxGeometry(0.58, 0.25, 0.22);
      const furMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 });
      const fur = new THREE.Mesh(furGeo, furMat);
      fur.position.set(0, -0.05, 0);
      bones.cloakMount.add(fur);
    }
  }

  // 9. CUSTOM FORGED 3D PROP ATTACHED TO RIGHT HAND
  if (customEquippedProp && bones.weaponMount) {
    const cloned = customEquippedProp.clone();
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const targetScale = 0.72 / maxDim;
    cloned.scale.setScalar(targetScale);
    cloned.position.set(0, 0.12, 0.08);
    cloned.rotation.x = Math.PI / 4;
    bones.weaponMount.add(cloned);
  }
}

// Skeletal Pose Animator
// Builds 3D Prop Model
export function buildPropModel(group: THREE.Group) {
  const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.2, 24);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.5,
    roughness: 0.4,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = 0.1;
  group.add(pedestal);

  const sword = new THREE.Group();
  sword.position.set(0, 1.1, 0);

  const bladeGeo = new THREE.BoxGeometry(0.12, 1.3, 0.025);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xc4c9d4,
    metalness: 0.95,
    roughness: 0.15,
  });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.castShadow = true;
  sword.add(blade);

  const guardGeo = new THREE.BoxGeometry(0.4, 0.05, 0.06);
  const guardMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.85,
    roughness: 0.3,
  });
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.y = -0.65;
  sword.add(guard);

  const hiltGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12);
  const hiltMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.8 });
  const hilt = new THREE.Mesh(hiltGeo, hiltMat);
  hilt.position.y = -0.8;
  sword.add(hilt);

  group.add(sword);
}

// Builds 3D Diorama Stage
export function buildDioramaStage(group: THREE.Group) {
  const baseGeo = new THREE.BoxGeometry(2.4, 0.15, 2.0);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.05;
  group.add(base);

  const wallGeo = new THREE.PlaneGeometry(2.4, 1.4);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 0.8, -0.95);
  group.add(wall);

  const trunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.4, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
  const foliageGeo = new THREE.ConeGeometry(0.25, 0.6, 8);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 });

  [
    [-0.8, 0, -0.5],
    [0.7, 0, -0.4],
  ].forEach(([x, y, z]) => {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.3, z);
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.set(x, 0.65, z);
    group.add(trunk);
    group.add(foliage);
  });
}
