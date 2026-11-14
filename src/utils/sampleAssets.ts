import { SAMPLE_PRESETS } from '../data/samples';
import meshyKarateFront from '../assets/images/meshy_karate_front_1794213134683.jpg';
import meshyKarateBack from '../assets/images/meshy_karate_back_1794213151085.jpg';

export { meshyKarateFront, meshyKarateBack };

/** Anciennes URL de développement (/src/assets/...) enregistrées dans le localStorage -> URL actuelles du build. */
const LEGACY_SAMPLE_ASSET_MAP: Record<string, string> = {
  '/src/assets/images/meshy_karate_front_1794213134683.jpg': meshyKarateFront,
  '/src/assets/images/meshy_karate_back_1794213151085.jpg': meshyKarateBack,
  '/src/assets/images/sample_retro_game_1794137120269.jpg': SAMPLE_PRESETS[1]?.imageUrl || meshyKarateFront,
  '/src/assets/images/sample_character_bd_1794137120622.jpg': SAMPLE_PRESETS[2]?.imageUrl || meshyKarateFront,
  '/src/assets/images/sample_spritesheet_1794137121788.jpg': SAMPLE_PRESETS[3]?.imageUrl || meshyKarateFront,
};

export function normalizeSampleAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return LEGACY_SAMPLE_ASSET_MAP[url] || url;
}
