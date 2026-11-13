export type AssetCategory =
  | 'player'
  | 'enemy'
  | 'vehicle'
  | 'item'
  | 'ui'
  | 'background'
  | 'weapon'
  | 'character_part'
  | 'animation_frame';

export interface BoundingBox {
  ymin: number; // 0 to 1000
  xmin: number; // 0 to 1000
  ymax: number; // 0 to 1000
  xmax: number; // 0 to 1000
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedElement {
  id: string;
  label: string;
  category: AssetCategory;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  description?: string;
  dominantColor?: string;
  // Sliced data URL
  croppedDataUrl?: string;
  rgb565Stats?: {
    bytes: number;
    width: number;
    height: number;
    sampleHex: string;
  };
}

export interface CharacterProfile {
  name?: string;
  hair?: string;
  eyes?: string;
  outfit?: string;
  weapons?: string[];
  dominantStyle?: string;
  turnaroundPrompts?: {
    front?: string;
    left_profile?: string;
    right_profile?: string;
    three_quarter?: string;
    back?: string;
  };
}

export interface ExtractionResult {
  summary: string;
  suggestedType: 'game_screenshot' | 'spritesheet' | 'character_bd' | 'retro_sprite';
  elements: DetectedElement[];
  palette: string[]; // hex codes
  characterProfile?: CharacterProfile;
}

export interface RGB565Options {
  littleEndian: boolean; // true for ESPBoy / AKA LE
  includeAlphaMask?: boolean;
  dither?: boolean;
}

export interface SamplePreset {
  id: string;
  title: string;
  badge: string;
  description: string;
  imageUrl: string;
  type: 'game_screenshot' | 'character_bd' | 'spritesheet';
  defaultElements: DetectedElement[];
  defaultPalette: string[];
  defaultProfile?: CharacterProfile;
}

export type AssetCreationIntent = 'character' | 'object' | 'scenery' | 'spritesheet';

export type Model3DViewMode = 'character' | 'prop' | 'diorama';

export type RigAnimationPose = 'a_pose' | 't_pose' | 'idle' | 'walk' | 'attack';

export interface CanonicalMultiViews {
  front: string;
  back: string;
  left: string;
  right: string;
  three_quarter: string;
}

