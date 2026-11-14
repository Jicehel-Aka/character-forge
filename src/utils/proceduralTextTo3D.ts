import { apiFetch, readApiError } from './serverApi';
import * as THREE from 'three';
import {
  exportGroupToGlbBlob,
  exportGroupToObjString,
  groundAndCenterGroup,
} from './fixedView3DBuilder';

export type BlueprintPrimitiveKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'lathe_vessel'
  | 'extrude_blade'
  | 'octahedron_crystal'
  | 'ring';

export interface BlueprintPartSpec {
  name: string;
  kind: BlueprintPrimitiveKind;
  position: [number, number, number];
  rotationDeg?: [number, number, number];
  scale?: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  textureStyle?: 'none' | 'metal' | 'wood' | 'stone' | 'crystal';
}

export interface Generated3DBlueprint {
  title: string;
  category: 'weapon' | 'shield' | 'potion' | 'chest' | 'helmet' | 'staff' | 'scifi' | 'scenery' | 'character' | 'prop';
  descriptionSummary: string;
  parts: BlueprintPartSpec[];
}

export interface TextTo3DResult {
  mesh: THREE.Group;
  title: string;
  category: Generated3DBlueprint['category'];
  partCount: number;
  vertexCount: number;
  triangleCount: number;
  usedAI: boolean;
  /** Renseigné quand l'IA était demandée mais indisponible : l'objet vient alors du moteur procédural. */
  aiWarning?: string;
  blueprint: Generated3DBlueprint;
  exportObj: (name?: string) => string;
  exportGlbBlob: () => Promise<Blob>;
}

export const TEXT_TO_3D_EXAMPLES: Array<{ label: string; prompt: string; category: string }> = [
  {
    label: 'Épée Runique',
    prompt: 'Épée runique médiévale en acier forgé avec garde en or, poignée cuir sombre et cristal cyan lumineux au pommeau',
    category: 'Arme',
  },
  {
    label: 'Fiole de Potion',
    prompt: 'Fiole alchimique en verre translucide remplie de potion émeraude luminescente avec bouchon de liège et col doré',
    category: 'Alchimie',
  },
  {
    label: 'Bouclier Nordique',
    prompt: 'Bouclier rond viking en bois de chêne cerclé de fer battu avec umbo central en acier poli et runes bleues',
    category: 'Défense',
  },
  {
    label: 'Coffre au Trésor',
    prompt: 'Coffre au trésor pirate en bois foncé avec arceaux en bronze doré, serrure en or et gemme rubis',
    category: 'Objet',
  },
  {
    label: 'Bâton Arcanique',
    prompt: 'Bâton magique de sorcier en bois ancien torsadé avec anneaux en or et prisme de cristal violet flottant lumineux',
    category: 'Magie',
  },
  {
    label: 'Drone Sci-Fi',
    prompt: 'Drone de reconnaissance futuriste noir mat et titane avec noyau central cyan néon et antennes latérales',
    category: 'Sci-Fi',
  },
  {
    label: 'Lanterne Médiévale',
    prompt: 'Lanterne de donjon en fer forgé noir avec anse supérieure et cœur de flamme ambre chaleureuse',
    category: 'Décor',
  },
  {
    label: 'Golem / Chevalier',
    prompt: 'Chevalier armuré stylisé avec casque à visière dorée, plastron acier et cape émeraude',
    category: 'Personnage',
  },
];

/**
 * Generates procedural canvas texture for subtle micro-surface detail (wood grain, brushed metal, stone speckles)
 */
function createProceduralSurfaceTexture(style: BlueprintPartSpec['textureStyle'], baseHex: string): THREE.CanvasTexture | null {
  if (!style || style === 'none') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 128, 128);

  if (style === 'wood') {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 128; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(42, y + ((y % 12) - 6) * 0.4, 86, y - ((y % 12) - 6) * 0.4, 128, y);
      ctx.stroke();
    }
  } else if (style === 'metal') {
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, (i * 3) % 128, 128, 1);
    }
  } else if (style === 'stone') {
    for (let i = 0; i < 240; i++) {
      const x = (i * 53) % 128;
      const y = (i * 97) % 128;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(x, y, 3, 3);
    }
  } else if (style === 'crystal') {
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Extracts color palette & material hints directly from a French or English text description.
 */
function parseSemanticTraits(prompt: string) {
  const p = prompt.toLowerCase();

  let primaryColor = '#94a3b8';
  let accentColor = '#d97706';
  let glowColor = '#38bdf8';

  if (p.includes('or') || p.includes('doré') || p.includes('gold')) accentColor = '#f59e0b';
  if (p.includes('bronze') || p.includes('cuivre')) accentColor = '#b45309';
  if (p.includes('argent') || p.includes('acier') || p.includes('silver') || p.includes('titane')) primaryColor = '#cbd5e1';
  if (p.includes('fer') || p.includes('sombre') || p.includes('noir') || p.includes('obsidienne') || p.includes('dark')) primaryColor = '#1e293b';
  if (p.includes('bois') || p.includes('chêne') || p.includes('wood') || p.includes('pirate')) primaryColor = '#78350f';
  if (p.includes('cuir') || p.includes('leather')) primaryColor = '#6e472b';
  if (p.includes('rouge') || p.includes('rubis') || p.includes('feu') || p.includes('lave') || p.includes('red')) {
    glowColor = '#ef4444';
    if (!p.includes('bois') && !p.includes('acier')) primaryColor = '#dc2626';
  }
  if (p.includes('vert') || p.includes('émeraude') || p.includes('poison') || p.includes('green') || p.includes('forêt')) {
    glowColor = '#10b981';
    if (!p.includes('bois') && !p.includes('acier')) primaryColor = '#15803d';
  }
  if (p.includes('violet') || p.includes('arcan') || p.includes('magi') || p.includes('purple')) {
    glowColor = '#a855f7';
  }
  if (p.includes('cyan') || p.includes('glace') || p.includes('plasma') || p.includes('néon') || p.includes('neon') || p.includes('bleu')) {
    glowColor = '#06b6d4';
  }
  if (p.includes('ambre') || p.includes('flamme') || p.includes('feu')) {
    glowColor = '#f97316';
  }

  const isGlowing =
    p.includes('lumin') ||
    p.includes('runi') ||
    p.includes('magi') ||
    p.includes('néon') ||
    p.includes('neon') ||
    p.includes('plasma') ||
    p.includes('flamme') ||
    p.includes('cristal') ||
    p.includes('arcan');

  const isMetallic = p.includes('acier') || p.includes('fer') || p.includes('or') || p.includes('titane') || p.includes('métal') || p.includes('bronze');
  const isWood = p.includes('bois') || p.includes('chêne') || p.includes('coffre') || p.includes('bouclier');
  const isGlass = p.includes('verre') || p.includes('fiole') || p.includes('potion') || p.includes('transluc');

  return { primaryColor, accentColor, glowColor, isGlowing, isMetallic, isWood, isGlass };
}

/**
 * Deterministic multi-part semantic blueprint generator (works reliably 100% offline/online).
 */
export function buildDeterministicBlueprint(prompt: string): Generated3DBlueprint {
  const p = prompt.toLowerCase();
  const t = parseSemanticTraits(prompt);
  const emissive = t.isGlowing ? t.glowColor : '#000000';
  const emissiveInt = t.isGlowing ? 1.15 : 0;

  // 1. SWORD / BLADE / KATANA / AXE
  if (p.includes('épée') || p.includes('epee') || p.includes('sword') || p.includes('katana') || p.includes('sabre') || p.includes('dague')) {
    const isKatana = p.includes('katana') || p.includes('sabre');
    return {
      title: isKatana ? 'Katana Forgé 3D' : 'Épée Runique 3D',
      category: 'weapon',
      descriptionSummary: prompt,
      parts: [
        { name: 'Lame_Principale', kind: 'extrude_blade', position: [0, 0.88, 0], scale: [isKatana ? 0.65 : 1.0, 1.1, 1.0], color: t.primaryColor, metalness: 0.92, roughness: 0.16, textureStyle: 'metal' },
        { name: 'Nervure_Runique', kind: 'box', position: [0, 0.80, 0], scale: [0.025, 0.85, 0.032], color: t.glowColor, metalness: 0.3, roughness: 0.2, emissive, emissiveIntensity: emissiveInt },
        { name: 'Garde_Transversale', kind: isKatana ? 'cylinder' : 'box', position: [0, 0.35, 0], scale: isKatana ? [0.11, 0.025, 0.11] : [0.36, 0.045, 0.075], color: t.accentColor, metalness: 0.88, roughness: 0.25, textureStyle: 'metal' },
        { name: 'Ornements_Garde_L', kind: 'sphere', position: [isKatana ? 0 : -0.18, 0.35, 0], scale: [0.038, 0.038, 0.038], color: t.accentColor, metalness: 0.9, roughness: 0.2 },
        { name: 'Ornements_Garde_R', kind: 'sphere', position: [isKatana ? 0 : 0.18, 0.35, 0], scale: [0.038, 0.038, 0.038], color: t.accentColor, metalness: 0.9, roughness: 0.2 },
        { name: 'Poignee_Cuir', kind: 'cylinder', position: [0, 0.20, 0], scale: [0.032, 0.26, 0.032], color: '#3b2416', metalness: 0.1, roughness: 0.85, textureStyle: 'wood' },
        { name: 'Bague_Pommeau', kind: 'torus', position: [0, 0.07, 0], rotationDeg: [90, 0, 0], scale: [0.042, 0.042, 0.042], color: t.accentColor, metalness: 0.9, roughness: 0.25 },
        { name: 'Cristal_Pommeau', kind: 'octahedron_crystal', position: [0, 0.03, 0], scale: [0.055, 0.075, 0.055], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive, emissiveIntensity: Math.max(0.8, emissiveInt), textureStyle: 'crystal' },
      ],
    };
  }

  // 2. POTION / VIAL / CHALICE / VASE
  if (p.includes('potion') || p.includes('fiole') || p.includes('flacon') || p.includes('vase') || p.includes('calice')) {
    return {
      title: 'Fiole Alchimique 3D',
      category: 'potion',
      descriptionSummary: prompt,
      parts: [
        { name: 'Liquide_Magique', kind: 'sphere', position: [0, 0.36, 0], scale: [0.30, 0.30, 0.30], color: t.glowColor, metalness: 0.1, roughness: 0.15, emissive: t.glowColor, emissiveIntensity: 1.1 },
        { name: 'Enveloppe_Verre', kind: 'lathe_vessel', position: [0, 0, 0], scale: [0.85, 0.85, 0.85], color: '#e0f2fe', metalness: 0.05, roughness: 0.08, opacity: 0.42, textureStyle: 'crystal' },
        { name: 'Collet_Dore', kind: 'torus', position: [0, 0.72, 0], rotationDeg: [90, 0, 0], scale: [0.15, 0.15, 0.15], color: t.accentColor, metalness: 0.9, roughness: 0.22 },
        { name: 'Bouchon_Liege', kind: 'cylinder', position: [0, 0.82, 0], scale: [0.10, 0.14, 0.10], color: '#92400e', metalness: 0.02, roughness: 0.92, textureStyle: 'wood' },
        { name: 'Socle_Alchimique', kind: 'cylinder', position: [0, 0.03, 0], scale: [0.24, 0.06, 0.24], color: t.accentColor, metalness: 0.85, roughness: 0.3 },
      ],
    };
  }

  // 3. SHIELD / ÉCU / BOUCLIER
  if (p.includes('bouclier') || p.includes('shield') || p.includes('écu') || p.includes('ecu')) {
    return {
      title: 'Bouclier Forgé 3D',
      category: 'shield',
      descriptionSummary: prompt,
      parts: [
        { name: 'Plateau_Bois', kind: 'cylinder', position: [0, 0.65, 0], rotationDeg: [90, 0, 0], scale: [0.56, 0.06, 0.56], color: t.isWood ? '#78350f' : t.primaryColor, metalness: t.isWood ? 0.08 : 0.6, roughness: t.isWood ? 0.82 : 0.35, textureStyle: t.isWood ? 'wood' : 'metal' },
        { name: 'Cerclage_Acier', kind: 'torus', position: [0, 0.65, 0], scale: [0.56, 0.56, 0.56], color: t.accentColor, metalness: 0.9, roughness: 0.24, textureStyle: 'metal' },
        { name: 'Umbo_Central', kind: 'sphere', position: [0, 0.65, 0.05], scale: [0.16, 0.16, 0.09], color: '#cbd5e1', metalness: 0.95, roughness: 0.15 },
        { name: 'Anneau_Runique', kind: 'torus', position: [0, 0.65, 0.04], scale: [0.26, 0.26, 0.26], color: t.glowColor, metalness: 0.4, roughness: 0.2, emissive, emissiveIntensity: emissiveInt },
        { name: 'Poignee_Arriere', kind: 'box', position: [0, 0.65, -0.07], scale: [0.06, 0.24, 0.06], color: '#3b2416', metalness: 0.1, roughness: 0.85 },
      ],
    };
  }

  // 4. TREASURE CHEST / COFFRE
  if (p.includes('coffre') || p.includes('chest') || p.includes('trésor') || p.includes('tresor')) {
    return {
      title: 'Coffre au Trésor 3D',
      category: 'chest',
      descriptionSummary: prompt,
      parts: [
        { name: 'Caisson_Bois', kind: 'box', position: [0, 0.28, 0], scale: [0.95, 0.52, 0.62], color: '#78350f', metalness: 0.08, roughness: 0.85, textureStyle: 'wood' },
        { name: 'Couvercle_Bombe', kind: 'cylinder', position: [0, 0.54, 0], rotationDeg: [0, 0, 90], scale: [0.31, 0.95, 0.31], color: '#6d2e0b', metalness: 0.08, roughness: 0.82, textureStyle: 'wood' },
        { name: 'Cerclage_Gauche', kind: 'box', position: [-0.34, 0.42, 0], scale: [0.07, 0.58, 0.66], color: t.accentColor, metalness: 0.88, roughness: 0.28, textureStyle: 'metal' },
        { name: 'Cerclage_Droit', kind: 'box', position: [0.34, 0.42, 0], scale: [0.07, 0.58, 0.66], color: t.accentColor, metalness: 0.88, roughness: 0.28, textureStyle: 'metal' },
        { name: 'Serrure_Or', kind: 'box', position: [0, 0.48, 0.33], scale: [0.16, 0.18, 0.05], color: '#f59e0b', metalness: 0.95, roughness: 0.18 },
        { name: 'Gemme_Serrure', kind: 'octahedron_crystal', position: [0, 0.49, 0.36], scale: [0.05, 0.06, 0.04], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive: t.glowColor, emissiveIntensity: 0.9 },
      ],
    };
  }

  // 5. STAFF / SCEPTER / WAND
  if (p.includes('bâton') || p.includes('baton') || p.includes('staff') || p.includes('sceptre') || p.includes('baguette')) {
    return {
      title: 'Bâton Arcanique 3D',
      category: 'staff',
      descriptionSummary: prompt,
      parts: [
        { name: 'Hampe_Principale', kind: 'cylinder', position: [0, 0.72, 0], scale: [0.04, 1.44, 0.04], color: '#5c3317', metalness: 0.12, roughness: 0.8, textureStyle: 'wood' },
        { name: 'Bague_Or_Haute', kind: 'torus', position: [0, 1.42, 0], rotationDeg: [90, 0, 0], scale: [0.075, 0.075, 0.075], color: t.accentColor, metalness: 0.92, roughness: 0.2 },
        { name: 'Croissant_Support', kind: 'torus', position: [0, 1.56, 0], scale: [0.14, 0.14, 0.14], color: t.accentColor, metalness: 0.92, roughness: 0.2 },
        { name: 'Prisme_Cristal', kind: 'octahedron_crystal', position: [0, 1.58, 0], scale: [0.095, 0.15, 0.095], color: t.glowColor, metalness: 0.2, roughness: 0.08, emissive: t.glowColor, emissiveIntensity: 1.35, textureStyle: 'crystal' },
        { name: 'Embout_Inferieur', kind: 'cone', position: [0, 0.05, 0], rotationDeg: [180, 0, 0], scale: [0.055, 0.12, 0.055], color: t.accentColor, metalness: 0.9, roughness: 0.25 },
      ],
    };
  }

  // 6. DRONE / ROBOT / SCI-FI
  if (p.includes('drone') || p.includes('robot') || p.includes('mecha') || p.includes('tourelle') || p.includes('sci-fi') || p.includes('futur')) {
    return {
      title: 'Drone Tactique Sci-Fi 3D',
      category: 'scifi',
      descriptionSummary: prompt,
      parts: [
        { name: 'Châssis_Sphère', kind: 'sphere', position: [0, 0.75, 0], scale: [0.34, 0.28, 0.36], color: '#1e293b', metalness: 0.82, roughness: 0.28, textureStyle: 'metal' },
        { name: 'Oeil_Optique_Neon', kind: 'sphere', position: [0, 0.75, 0.28], scale: [0.12, 0.12, 0.08], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive: t.glowColor, emissiveIntensity: 1.4 },
        { name: 'Anneau_Stabilisateur', kind: 'torus', position: [0, 0.75, 0], rotationDeg: [80, 0, 0], scale: [0.52, 0.52, 0.52], color: '#94a3b8', metalness: 0.9, roughness: 0.22 },
        { name: 'Propulseur_G', kind: 'cylinder', position: [-0.46, 0.78, 0], scale: [0.11, 0.20, 0.11], color: '#334155', metalness: 0.85, roughness: 0.3 },
        { name: 'Propulseur_D', kind: 'cylinder', position: [0.46, 0.78, 0], scale: [0.11, 0.20, 0.11], color: '#334155', metalness: 0.85, roughness: 0.3 },
        { name: 'Antenne_Haute', kind: 'cone', position: [0.12, 1.08, -0.05], scale: [0.025, 0.24, 0.025], color: t.accentColor, metalness: 0.9, roughness: 0.2 },
        { name: 'Socle_Holographique', kind: 'cylinder', position: [0, 0.04, 0], scale: [0.32, 0.08, 0.32], color: '#0f172a', metalness: 0.7, roughness: 0.35 },
      ],
    };
  }

  // 7. LANTERN / TORCH / LAMP
  if (p.includes('lanterne') || p.includes('torche') || p.includes('lampe') || p.includes('lantern')) {
    return {
      title: 'Lanterne Forgée 3D',
      category: 'prop',
      descriptionSummary: prompt,
      parts: [
        { name: 'Socle_Fer', kind: 'cylinder', position: [0, 0.06, 0], scale: [0.24, 0.12, 0.24], color: '#1e293b', metalness: 0.85, roughness: 0.45, textureStyle: 'metal' },
        { name: 'Coeur_Flamme', kind: 'octahedron_crystal', position: [0, 0.36, 0], scale: [0.12, 0.20, 0.12], color: t.glowColor, metalness: 0.1, roughness: 0.1, emissive: t.glowColor, emissiveIntensity: 1.5 },
        { name: 'Montant_1', kind: 'box', position: [-0.17, 0.38, 0.17], scale: [0.03, 0.52, 0.03], color: '#1e293b', metalness: 0.85, roughness: 0.4 },
        { name: 'Montant_2', kind: 'box', position: [0.17, 0.38, 0.17], scale: [0.03, 0.52, 0.03], color: '#1e293b', metalness: 0.85, roughness: 0.4 },
        { name: 'Montant_3', kind: 'box', position: [-0.17, 0.38, -0.17], scale: [0.03, 0.52, 0.03], color: '#1e293b', metalness: 0.85, roughness: 0.4 },
        { name: 'Montant_4', kind: 'box', position: [0.17, 0.38, -0.17], scale: [0.03, 0.52, 0.03], color: '#1e293b', metalness: 0.85, roughness: 0.4 },
        { name: 'Chapiteau_Toit', kind: 'cone', position: [0, 0.72, 0], scale: [0.28, 0.22, 0.28], color: '#334155', metalness: 0.85, roughness: 0.35 },
        { name: 'Anse_Anneau', kind: 'torus', position: [0, 0.88, 0], scale: [0.09, 0.09, 0.09], color: t.accentColor, metalness: 0.9, roughness: 0.25 },
      ],
    };
  }

  // 8. HELMET / CROWN / MASK
  if (p.includes('casque') || p.includes('heaume') || p.includes('couronne') || p.includes('helmet') || p.includes('crown')) {
    return {
      title: 'Heaume Forgé 3D',
      category: 'helmet',
      descriptionSummary: prompt,
      parts: [
        { name: 'Calotte_Acier', kind: 'sphere', position: [0, 0.42, 0], scale: [0.28, 0.32, 0.30], color: t.primaryColor, metalness: 0.9, roughness: 0.2, textureStyle: 'metal' },
        { name: 'Visiere_Avant', kind: 'box', position: [0, 0.36, 0.24], scale: [0.34, 0.14, 0.14], color: '#0f172a', metalness: 0.92, roughness: 0.18 },
        { name: 'Cimier_Dore', kind: 'box', position: [0, 0.68, -0.02], scale: [0.06, 0.22, 0.44], color: t.accentColor, metalness: 0.9, roughness: 0.22 },
        { name: 'Bandeau_Frontal', kind: 'torus', position: [0, 0.45, 0], rotationDeg: [90, 0, 0], scale: [0.29, 0.29, 0.29], color: t.accentColor, metalness: 0.92, roughness: 0.2 },
        { name: 'Gemme_Frontale', kind: 'octahedron_crystal', position: [0, 0.50, 0.30], scale: [0.05, 0.07, 0.04], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive, emissiveIntensity: Math.max(0.8, emissiveInt) },
      ],
    };
  }

  // 9. CHARACTER / STATUE / KNIGHT / GOLEM
  if (p.includes('chevalier') || p.includes('guerrier') || p.includes('golem') || p.includes('personnage') || p.includes('mage') || p.includes('statue')) {
    return {
      title: 'Sculpture Personnage 3D',
      category: 'character',
      descriptionSummary: prompt,
      parts: [
        { name: 'Torse_Armure', kind: 'box', position: [0, 1.06, 0], scale: [0.38, 0.46, 0.24], color: t.primaryColor, metalness: 0.78, roughness: 0.3, textureStyle: 'metal' },
        { name: 'Tete_Casque', kind: 'sphere', position: [0, 1.48, 0], scale: [0.16, 0.18, 0.17], color: t.primaryColor, metalness: 0.85, roughness: 0.25 },
        { name: 'Visiere_Lumineuse', kind: 'box', position: [0, 1.48, 0.14], scale: [0.18, 0.045, 0.06], color: t.glowColor, metalness: 0.3, roughness: 0.15, emissive: t.glowColor, emissiveIntensity: 1.2 },
        { name: 'Epaulette_G', kind: 'sphere', position: [-0.26, 1.24, 0], scale: [0.12, 0.10, 0.13], color: t.accentColor, metalness: 0.88, roughness: 0.25 },
        { name: 'Epaulette_D', kind: 'sphere', position: [0.26, 1.24, 0], scale: [0.12, 0.10, 0.13], color: t.accentColor, metalness: 0.88, roughness: 0.25 },
        { name: 'Bras_Gauche', kind: 'capsule', position: [-0.28, 0.96, 0], rotationDeg: [0, 0, 12], scale: [0.075, 0.44, 0.075], color: t.primaryColor, metalness: 0.6, roughness: 0.4 },
        { name: 'Bras_Droit', kind: 'capsule', position: [0.28, 0.96, 0], rotationDeg: [0, 0, -12], scale: [0.075, 0.44, 0.075], color: t.primaryColor, metalness: 0.6, roughness: 0.4 },
        { name: 'Jambe_Gauche', kind: 'capsule', position: [-0.11, 0.44, 0], scale: [0.09, 0.64, 0.09], color: '#334155', metalness: 0.5, roughness: 0.45 },
        { name: 'Jambe_Droite', kind: 'capsule', position: [0.11, 0.44, 0], scale: [0.09, 0.64, 0.09], color: '#334155', metalness: 0.5, roughness: 0.45 },
        { name: 'Cape_Dorsale', kind: 'box', position: [0, 0.88, -0.16], rotationDeg: [8, 0, 0], scale: [0.46, 0.88, 0.03], color: t.glowColor, metalness: 0.05, roughness: 0.85 },
      ],
    };
  }

  // 10. FALLBACK: CRYSTAL MONOLITH / SCULPTED TOTEM ARTIFACT
  return {
    title: 'Artefact Sculpté 3D',
    category: 'scenery',
    descriptionSummary: prompt,
    parts: [
      { name: 'Socle_Pierre', kind: 'cylinder', position: [0, 0.12, 0], scale: [0.42, 0.24, 0.42], color: '#334155', metalness: 0.15, roughness: 0.85, textureStyle: 'stone' },
      { name: 'Couronne_Runes', kind: 'torus', position: [0, 0.26, 0], rotationDeg: [90, 0, 0], scale: [0.36, 0.36, 0.36], color: t.accentColor, metalness: 0.85, roughness: 0.25 },
      { name: 'Cristal_Central', kind: 'octahedron_crystal', position: [0, 0.72, 0], scale: [0.24, 0.46, 0.24], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive: t.glowColor, emissiveIntensity: 1.05, textureStyle: 'crystal' },
      { name: 'Eclat_Satellite_G', kind: 'octahedron_crystal', position: [-0.28, 0.52, 0.10], rotationDeg: [0, 0, 22], scale: [0.09, 0.22, 0.09], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive: t.glowColor, emissiveIntensity: 0.8 },
      { name: 'Eclat_Satellite_D', kind: 'octahedron_crystal', position: [0.28, 0.52, -0.10], rotationDeg: [0, 0, -22], scale: [0.09, 0.22, 0.09], color: t.glowColor, metalness: 0.2, roughness: 0.1, emissive: t.glowColor, emissiveIntensity: 0.8 },
    ],
  };
}

function createGeometryForPart(spec: BlueprintPartSpec): THREE.BufferGeometry {
  const [sx, sy, sz] = spec.scale || [1, 1, 1];
  switch (spec.kind) {
    case 'box': {
      const geo = new THREE.BoxGeometry(sx, sy, sz, 2, 2, 2);
      return geo;
    }
    case 'cylinder': {
      return new THREE.CylinderGeometry(sx, sx, sy, 28);
    }
    case 'sphere': {
      const geo = new THREE.SphereGeometry(1, 28, 22);
      geo.scale(sx, sy, sz);
      return geo;
    }
    case 'cone': {
      return new THREE.ConeGeometry(sx, sy, 24);
    }
    case 'torus': {
      const geo = new THREE.TorusGeometry(sx, Math.max(0.014, sx * 0.14), 14, 36);
      return geo;
    }
    case 'ring': {
      const geo = new THREE.TorusGeometry(sx, Math.max(0.012, sx * 0.1), 12, 32);
      return geo;
    }
    case 'capsule': {
      const r = sx;
      const len = Math.max(0.05, sy - r * 2);
      return new THREE.CapsuleGeometry(r, len, 10, 20);
    }
    case 'octahedron_crystal': {
      const geo = new THREE.OctahedronGeometry(1, 0);
      geo.scale(sx, sy, sz);
      return geo;
    }
    case 'lathe_vessel': {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.24 * sx, 0.04 * sy),
        new THREE.Vector2(0.42 * sx, 0.28 * sy),
        new THREE.Vector2(0.38 * sx, 0.54 * sy),
        new THREE.Vector2(0.14 * sx, 0.72 * sy),
        new THREE.Vector2(0.18 * sx, 0.88 * sy),
        new THREE.Vector2(0.15 * sx, 0.88 * sy),
      ];
      return new THREE.LatheGeometry(pts, 32);
    }
    case 'extrude_blade': {
      const shape = new THREE.Shape();
      const w = 0.075 * sx;
      const h = 0.92 * sy;
      shape.moveTo(-w * 0.85, -h * 0.5);
      shape.lineTo(w * 0.85, -h * 0.5);
      shape.lineTo(w * 0.62, h * 0.35);
      shape.lineTo(0, h * 0.55);
      shape.lineTo(-w * 0.62, h * 0.35);
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.018 * sz,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
      });
      geo.center();
      return geo;
    }
    default:
      return new THREE.BoxGeometry(sx, sy, sz);
  }
}

/**
 * Compiles a Generated3DBlueprint into a ready-to-render & export THREE.Group.
 */
export function instantiateBlueprintGroup(blueprint: Generated3DBlueprint): {
  group: THREE.Group;
  vertexCount: number;
  triangleCount: number;
} {
  const group = new THREE.Group();
  group.name = blueprint.title.replace(/\s+/g, '_');

  let vertexCount = 0;
  let triangleCount = 0;

  blueprint.parts.forEach((part, index) => {
    const cleanColor = (part.color || '#94a3b8').trim();
    const cleanEmissive = part.emissive ? part.emissive.trim() : '';
    const geo = createGeometryForPart(part);
    const tex = createProceduralSurfaceTexture(part.textureStyle, cleanColor);

    const isTransparent = part.opacity !== undefined && part.opacity < 0.99;
    const mat = isTransparent
      ? new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(cleanColor),
          roughness: part.roughness ?? 0.1,
          metalness: part.metalness ?? 0.05,
          transparent: true,
          opacity: part.opacity ?? 0.5,
          transmission: 0.35,
          ior: 1.45,
          map: tex || undefined,
        })
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(cleanColor),
          roughness: part.roughness ?? 0.45,
          metalness: part.metalness ?? 0.25,
          emissive: cleanEmissive ? new THREE.Color(cleanEmissive) : new THREE.Color(0x000000),
          emissiveIntensity: part.emissiveIntensity ?? 0,
          map: tex || undefined,
        });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = part.name || `Part_${index + 1}`;
    mesh.position.set(part.position[0], part.position[1], part.position[2]);
    if (part.rotationDeg) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(part.rotationDeg[0]),
        THREE.MathUtils.degToRad(part.rotationDeg[1]),
        THREE.MathUtils.degToRad(part.rotationDeg[2])
      );
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    if (pos) vertexCount += pos.count;
    if (idx) triangleCount += idx.count / 3;
    else if (pos) triangleCount += pos.count / 3;
  });

  groundAndCenterGroup(group);

  return {
    group,
    vertexCount: Math.round(vertexCount),
    triangleCount: Math.round(triangleCount),
  };
}

/**
 * Generates a rich 3D object from a natural-language description (attempts Gemini AI blueprint route first, falls back cleanly to semantic procedural builder).
 */
export async function generate3DFromDescription(
  prompt: string,
  preferAI = true
): Promise<TextTo3DResult> {
  let blueprint: Generated3DBlueprint | null = null;
  let usedAI = false;

  let aiWarning: string | undefined;

  if (preferAI && prompt.trim().length > 3) {
    try {
      const resp = await apiFetch('api/generate/3d-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.parts && Array.isArray(data.parts) && data.parts.length >= 2) {
          blueprint = data as Generated3DBlueprint;
          usedAI = true;
        } else {
          aiWarning = "L'IA a renvoyé un plan 3D inexploitable.";
        }
      } else {
        aiWarning = await readApiError(resp);
      }
    } catch (err) {
      aiWarning = err instanceof Error ? err.message : "L'IA est injoignable.";
    }
    if (aiWarning) {
      console.warn('Génération 3D par IA indisponible :', aiWarning);
      aiWarning = `Génération par IA indisponible (${aiWarning.replace(/\.$/, '')}). Repli sur la synthèse procédurale.`;
    }
  }

  if (!blueprint) {
    blueprint = buildDeterministicBlueprint(prompt);
    usedAI = false;
  }

  const { group, vertexCount, triangleCount } = instantiateBlueprintGroup(blueprint);

  return {
    mesh: group,
    title: blueprint.title,
    category: blueprint.category,
    partCount: blueprint.parts.length,
    vertexCount,
    triangleCount,
    usedAI,
    aiWarning,
    blueprint,
    exportObj: (name = blueprint!.title) => exportGroupToObjString(group, name),
    exportGlbBlob: () => exportGroupToGlbBlob(group),
  };
}
