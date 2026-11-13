/**
 * Client-side Canvas Image Processing, Sprite Cropping, Chroma Keying & Auto-Slicing
 */

export interface ChromaKeyOptions {
  enabled: boolean;
  targetColor: { r: number; g: number; b: number };
  tolerance: number; // 0 - 100
}

/**
 * Loads an HTMLImageElement asynchronously from an image URL or Data URL.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Crops a normalized bounding box ([ymin, xmin, ymax, xmax] in 0-1000 range)
 * with optional chroma-key transparency applied.
 */
export async function cropElement(
  img: HTMLImageElement,
  box_2d: [number, number, number, number],
  chromaKey?: ChromaKeyOptions
): Promise<{ dataUrl: string; imageData: ImageData; width: number; height: number }> {
  const [ymin, xmin, ymax, xmax] = box_2d;

  const sx = Math.max(0, Math.floor((xmin / 1000) * img.naturalWidth));
  const sy = Math.max(0, Math.floor((ymin / 1000) * img.naturalHeight));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.floor(((xmax - xmin) / 1000) * img.naturalWidth)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.floor(((ymax - ymin) / 1000) * img.naturalHeight)));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const imgData = ctx.getImageData(0, 0, sw, sh);

  // Apply chroma key if enabled
  if (chromaKey && chromaKey.enabled) {
    applyChromaKey(imgData, chromaKey.targetColor, chromaKey.tolerance);
    ctx.putImageData(imgData, 0, 0);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    imageData: imgData,
    width: sw,
    height: sh,
  };
}

/**
 * Applies chroma-key transparency in place on ImageData.
 */
export function applyChromaKey(
  imageData: ImageData,
  targetColor: { r: number; g: number; b: number },
  tolerance: number
) {
  const data = imageData.data;
  const maxDistance = (tolerance / 100) * 441.67; // sqrt(255^2 + 255^2 + 255^2) = ~441.67

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dr = r - targetColor.r;
    const dg = g - targetColor.g;
    const db = b - targetColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= maxDistance) {
      data[i + 3] = 0; // Make transparent
    }
  }
}

/**
 * Automatically splits a spritesheet image into regular rows x columns grid cells.
 */
export function sliceGrid(
  rows: number,
  cols: number,
  prefix: string = 'frame'
): Array<{
  id: string;
  label: string;
  category: 'animation_frame';
  box_2d: [number, number, number, number];
}> {
  const elements = [];
  const cellHeight = 1000 / rows;
  const cellWidth = 1000 / cols;

  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ymin = Math.round(r * cellHeight);
      const xmin = Math.round(c * cellWidth);
      const ymax = Math.round((r + 1) * cellHeight);
      const xmax = Math.round((c + 1) * cellWidth);

      elements.push({
        id: `grid_${index}`,
        label: `${prefix}_${index + 1} (R${r + 1}:C${c + 1})`,
        category: 'animation_frame' as const,
        box_2d: [ymin, xmin, ymax, xmax] as [number, number, number, number],
      });
      index++;
    }
  }

  return elements;
}

/**
 * Extracts a palette of dominant colors from an ImageData.
 */
export function extractPaletteFromImageData(imgData: ImageData, maxColors: number = 12): string[] {
  const data = imgData.data;
  const buckets = new Map<string, number>();

  // Sample every few pixels for performance
  const step = Math.max(1, Math.floor(data.length / (4 * 1000)));

  for (let i = 0; i < data.length; i += 4 * step) {
    const a = data[i + 3];
    if (a < 50) continue; // Skip transparent

    // Quantize to reduce near-duplicates (16 levels per channel)
    const r = Math.round(data[i] / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;

    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
    buckets.set(hex, (buckets.get(hex) || 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([hex]) => hex);
}
