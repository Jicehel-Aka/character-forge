import JSZip from 'jszip';
import { DetectedElement, CharacterProfile } from '../types/assets';
import { imageToRGB565 } from './rgb565';

export interface ZipExportOptions {
  includePng?: boolean;
  includeRgb565Le?: boolean;
  includeRgb565Be?: boolean;
  includeCHeaders?: boolean;
  includeMetadataJson?: boolean;
  includePalette?: boolean;
  includeCharacterSpec?: boolean;
}

export interface ZipExportData {
  elements: DetectedElement[];
  palette: string[];
  characterProfile?: CharacterProfile;
  imageDimensions: { width: number; height: number };
  options?: ZipExportOptions;
  onProgress?: (current: number, total: number, label: string) => void;
}

/**
 * Packs all extracted assets into a clean ZIP archive for ESPBoy, AKA, Godot, or BD pipelines.
 * Supports configurable inclusions and progress feedback for Bulk Export.
 */
export async function generateAssetZip(data: ZipExportData): Promise<Blob> {
  const zip = new JSZip();
  const opts = {
    includePng: data.options?.includePng ?? true,
    includeRgb565Le: data.options?.includeRgb565Le ?? true,
    includeRgb565Be: data.options?.includeRgb565Be ?? true,
    includeCHeaders: data.options?.includeCHeaders ?? true,
    includeMetadataJson: data.options?.includeMetadataJson ?? true,
    includePalette: data.options?.includePalette ?? true,
    includeCharacterSpec: data.options?.includeCharacterSpec ?? true,
  };

  const spritesFolder = opts.includePng ? zip.folder('sprites') : null;
  const rgb565LeFolder = opts.includeRgb565Le ? zip.folder('rgb565_le') : null;
  const rgb565BeFolder = opts.includeRgb565Be ? zip.folder('rgb565_be') : null;
  const cHeadersFolder = opts.includeCHeaders ? zip.folder('c_headers') : null;
  const paletteFolder = opts.includePalette ? zip.folder('palette') : null;

  const metadataList: any[] = [];
  const totalElements = data.elements.length;

  let currentIndex = 0;
  for (const el of data.elements) {
    currentIndex++;
    data.onProgress?.(currentIndex, totalElements, el.label || `Élément ${currentIndex}`);
    const cleanId = el.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (el.croppedDataUrl) {
      // 1. Add PNG sprite
      if (opts.includePng && spritesFolder) {
        const base64Data = el.croppedDataUrl.replace(/^data:image\/png;base64,/, '');
        spritesFolder.file(`${cleanId}.png`, base64Data, { base64: true });
      }

      // Convert to RGB565 buffers if any binary or C header is requested
      const needRgbProcessing = opts.includeRgb565Le || opts.includeRgb565Be || opts.includeCHeaders || opts.includeMetadataJson;
      if (needRgbProcessing) {
        try {
          const offscreen = document.createElement('canvas');
          const img = new Image();
          img.src = el.croppedDataUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, img.width, img.height);
            const rgb = imageToRGB565(imgData, cleanId);

            // 2. Add Little-Endian .bin (ESPBoy / AKA TFT standard)
            if (opts.includeRgb565Le && rgb565LeFolder) {
              rgb565LeFolder.file(`${cleanId}_le.bin`, rgb.bytesLE);
            }

            // 3. Add Big-Endian .bin
            if (opts.includeRgb565Be && rgb565BeFolder) {
              rgb565BeFolder.file(`${cleanId}_be.bin`, rgb.bytesBE);
            }

            // 4. Add C header .h
            if (opts.includeCHeaders && cHeadersFolder) {
              cHeadersFolder.file(`${cleanId}.h`, rgb.cHeader);
            }

            metadataList.push({
              id: el.id,
              label: el.label,
              category: el.category,
              box_2d: el.box_2d,
              width: rgb.width,
              height: rgb.height,
              bytes: rgb.byteLength,
              dominantColor: el.dominantColor,
            });
          }
        } catch (err) {
          console.warn(`Could not process RGB565 for ${cleanId}`, err);
        }
      }
    }
  }

  // 5. Add Palette
  if (opts.includePalette && data.palette && data.palette.length > 0 && paletteFolder) {
    paletteFolder.file('palette.hex', data.palette.join('\n'));

    // C palette array
    const cPalette = `// Color Palette (RGB565) generated for ESPBoy & AKA
#ifndef _PALETTE_H_
#define _PALETTE_H_

#include <stdint.h>

const uint16_t PALETTE[${data.palette.length}] = {
${data.palette.map((hex) => {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const val = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  return `  0x${val.toString(16).padStart(4, '0').toUpperCase()} /* ${hex} */`;
}).join(',\n')}
};

#endif
`;
    paletteFolder.file('palette_rgb565.h', cPalette);
  }

  // 6. Metadata JSON
  if (opts.includeMetadataJson) {
    const rootMeta = {
      generator: 'Asset Recovery Agent & CharacterAI Studio',
      bundleType: 'Bulk Export Archive',
      exportedAt: new Date().toISOString(),
      sourceResolution: data.imageDimensions,
      totalElements: data.elements.length,
      bundledElementsCount: metadataList.length,
      elements: metadataList,
      palette: data.palette,
      characterProfile: data.characterProfile,
    };
    zip.file('metadata.json', JSON.stringify(rootMeta, null, 2));
  }

  // 7. Character Profile (if present)
  if (opts.includeCharacterSpec && data.characterProfile) {
    zip.file('character_spec.json', JSON.stringify(data.characterProfile, null, 2));
  }

  // 8. Manifest & Readme
  const readme = `=== Character Forge & Asset Recovery Agent : Bulk Export Pack ===
Export généré le : ${new Date().toLocaleString()}
Nombre total d'éléments groupés : ${data.elements.length}
Dimensions de la scène source : ${data.imageDimensions.width}x${data.imageDimensions.height}px

Contenu du Bundle :
${opts.includePng ? '- /sprites/     : Fichiers PNG transparents haute résolution pour chaque élément découpé\n' : ''}${opts.includeRgb565Le ? '- /rgb565_le/   : Binaires 16-bit Little-Endian (.bin) pour consoles ESPBoy / AKA TFT\n' : ''}${opts.includeRgb565Be ? '- /rgb565_be/   : Binaires 16-bit Big-Endian (.bin)\n' : ''}${opts.includeCHeaders ? '- /c_headers/   : Headers C/C++ avec tableaux PROGMEM prêts pour Arduino IDE / PlatformIO\n' : ''}${opts.includePalette ? '- /palette/     : Palette dominante (.hex et code C uint16_t PALETTE[])\n' : ''}${opts.includeMetadataJson ? '- metadata.json : Métadonnées complètes avec coordonnées [ymin, xmin, ymax, xmax] (0-1000)\n' : ''}
Éléments inclus dans ce lot :
${data.elements.map((e, idx) => `  ${idx + 1}. [${e.category}] ${e.label} (box_2d: ${JSON.stringify(e.box_2d)})`).join('\n')}
`;
  zip.file('BULK_EXPORT_MANIFEST.txt', readme);

  return await zip.generateAsync({ type: 'blob' });
}
