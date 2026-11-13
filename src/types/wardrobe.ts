export type WardrobeSlot =
  | 'hair'
  | 'eyewear'
  | 'armor'
  | 'clothing'
  | 'belt'
  | 'gloves'
  | 'footwear'
  | 'weapon'
  | 'cloak';

export interface WardrobeItem {
  id: string;
  slot: WardrobeSlot;
  name: string;
  categoryName: string; // e.g. "Cheveux", "Lunettes", "Kimono & Vêtements", "Ceinture Obi", "Gants", "Bottes & Sandales", "Armure"
  description: string;
  color: string;
  metalness?: number;
  roughness?: number;
  isInitialDefault?: boolean; // Part of the default import
  isCustomUserItem?: boolean; // Extracted by user from imported image
  customImageCropUrl?: string; // Sliced texture preview
}

export interface CharacterWardrobeState {
  hair: string | null;
  eyewear: string | null;
  armor: string | null;
  clothing: string | null;
  belt: string | null;
  gloves: string | null;
  footwear: string | null;
  weapon: string | null;
  cloak: string | null;
}

export type MultiViewAngle = 'front' | 'left' | 'right' | 'back' | 'three_quarter' | 'top' | 'bottom';

export interface MultiViewSlot {
  angle: MultiViewAngle;
  title: string;
  subtitle: string;
  imageUrl?: string;
  isAiGenerated?: boolean;
}
