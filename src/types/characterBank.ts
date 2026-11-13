import { MultiViewAngle, WardrobeItem, CharacterWardrobeState } from './wardrobe';
import { DetectedElement, CharacterProfile } from './assets';

export type CharacterArchetype = 'martial_arts' | 'fantasy_warrior' | 'cyberpunk' | 'mage' | 'retro_mecha' | 'ninja';

export interface BankCharacter {
  id: string;
  name: string;
  archetype: CharacterArchetype;
  archetypeLabel: string;
  tagline: string;
  description: string;
  imageUrl: string;
  palette: string[];
  wardrobeState: CharacterWardrobeState;
  customWardrobeItems?: WardrobeItem[];
  multiViews: Record<MultiViewAngle, string | null>;
  defaultElements: DetectedElement[];
  profile: CharacterProfile;
}

export interface BankPropObject {
  id: string;
  name: string;
  category: 'weapon' | 'armor' | 'clothing' | 'hair' | 'eyewear' | 'footwear' | 'accessory';
  categoryLabel: string;
  slot: 'weapon' | 'armor' | 'clothing' | 'hair' | 'eyewear' | 'footwear' | 'belt' | 'gloves' | 'cloak';
  description: string;
  icon: string;
  color: string;
  wardrobeItemId: string;
  recommendedFor: CharacterArchetype[];
}

export type TransferableAnimationId =
  | 't_pose'
  | 'a_pose'
  | 'idle'
  | 'walk'
  | 'sprint'
  | 'martial_kick'
  | 'sword_combo'
  | 'victory'
  | 'defense_block'
  | 'magic_cast';

export interface TransferableAnimation {
  id: TransferableAnimationId;
  name: string;
  category: 'calibration' | 'locomotion' | 'combat' | 'emotes' | 'arcane';
  description: string;
  icon: string;
  durationSeconds: number;
  tags: string[];
}
