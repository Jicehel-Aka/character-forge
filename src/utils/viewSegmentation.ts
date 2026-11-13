import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';

export type BackgroundRemovalMode = 'auto' | 'soft' | 'strong';

export interface SegmentedViewInfo {
  dataUrl: string;
  hadOpaqueBg: boolean;
  coverage: number;
  aspectRatio: number;
  appliedRotationDeg: 0 | 90 | 180 | 270;
  maskHealth: 'clean' | 'uncertain_full';
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image source."));
    img.src = src;
  });
}

/**
 * Samples representative background color clusters along the 4px outer border of an image.
 */
function extractBorderStats(data: Uint8ClampedArray, w: number, h: number) {
  const clusters: Array<{ r: number; g: number; b: number; count: number }> = [];
  let sumLuma = 0;
  let sumChroma = 0;
  let maxChroma = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let sampleCount = 0;

  const addSample = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    if (data[idx + 3] < 40) return;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    sumLuma += luma;
    sumChroma += chroma;
    if (chroma > maxChroma) maxChroma = chroma;
    if (luma < minLuma) minLuma = luma;
    if (luma > maxLuma) maxLuma = luma;
    sampleCount++;

    for (const c of clusters) {
      const dr = r - c.r;
      const dg = g - c.g;
      const db = b - c.b;
      if (dr * dr + dg * dg + db * db < 30 * 30) {
        c.r = (c.r * c.count + r) / (c.count + 1);
        c.g = (c.g * c.count + g) / (c.count + 1);
        c.b = (c.b * c.count + b) / (c.count + 1);
        c.count++;
        return;
      }
    }
    if (clusters.length < 14) {
      clusters.push({ r, g, b, count: 1 });
    }
  };

  const step = Math.max(1, Math.floor(Math.min(w, h) / 112));
  const rim = Math.min(4, Math.floor(Math.min(w, h) / 12));
  for (let x = 0; x < w; x += step) {
    for (let k = 0; k < rim; k++) {
      addSample(x, k);
      addSample(x, h - 1 - k);
    }
  }
  for (let y = 0; y < h; y += step) {
    for (let k = 0; k < rim; k++) {
      addSample(k, y);
      addSample(w - 1 - k, y);
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  const avgLuma = sampleCount > 0 ? sumLuma / sampleCount : 128;
  const avgChroma = sampleCount > 0 ? sumChroma / sampleCount : 20;

  return {
    clusters: clusters.slice(0, 10).map((c) => [c.r, c.g, c.b] as [number, number, number]),
    avgLuma,
    minLuma: sampleCount > 0 ? minLuma : 20,
    maxLuma: sampleCount > 0 ? maxLuma : 220,
    avgChroma,
    maxChroma,
    isDarkStudioBg: avgLuma < 115 && avgChroma < 42,
    isNeutralStudioBg: avgChroma < 44,
    isLightStudioBg: avgLuma > 180 && avgChroma < 34,
  };
}

/**
 * Computes 3x3 Sobel gradient across R, G, B and Luminance channels (0..255 scale) so flood-fill
 * glides across smooth studio gradients/floors while detecting chromatic dark-on-dark boundaries
 * (such as black/brown hair or dark shoe soles against a navy/charcoal studio wall).
 */
function computeFeatures(data: Uint8ClampedArray, w: number, h: number) {
  const total = w * h;
  const luma = new Float32Array(total);
  const chroma = new Uint8Array(total);
  const grad = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const k = i * 4;
    const r = data[k];
    const g = data[k + 1];
    const b = data[k + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }

  for (let y = 1; y < h - 1; y++) {
    const rowUp = (y - 1) * w;
    const rowMid = y * w;
    const rowDn = (y + 1) * w;
    for (let x = 1; x < w - 1; x++) {
      const gxL =
        -luma[rowUp + x - 1] +
        luma[rowUp + x + 1] -
        2 * luma[rowMid + x - 1] +
        2 * luma[rowMid + x + 1] -
        luma[rowDn + x - 1] +
        luma[rowDn + x + 1];
      const gyL =
        -luma[rowUp + x - 1] -
        2 * luma[rowUp + x] -
        luma[rowUp + x + 1] +
        luma[rowDn + x - 1] +
        2 * luma[rowDn + x] +
        luma[rowDn + x + 1];
      const lumaG = Math.sqrt(gxL * gxL + gyL * gyL) * 0.25;

      // Full RGB channel Sobel catches subtle hue shifts (e.g. dark hair vs dark navy wall)
      const ul = (rowUp + x - 1) * 4;
      const um = (rowUp + x) * 4;
      const ur = (rowUp + x + 1) * 4;
      const ml = (rowMid + x - 1) * 4;
      const mr = (rowMid + x + 1) * 4;
      const dl = (rowDn + x - 1) * 4;
      const dm = (rowDn + x) * 4;
      const dr = (rowDn + x + 1) * 4;

      const gxR = -data[ul] + data[ur] - 2 * data[ml] + 2 * data[mr] - data[dl] + data[dr];
      const gyR = -data[ul] - 2 * data[um] - data[ur] + data[dl] + 2 * data[dm] + data[dr];
      const gxG = -data[ul + 1] + data[ur + 1] - 2 * data[ml + 1] + 2 * data[mr + 1] - data[dl + 1] + data[dr + 1];
      const gyG = -data[ul + 1] - 2 * data[um + 1] - data[ur + 1] + data[dl + 1] + 2 * data[dm + 1] + data[dr + 1];
      const gxB = -data[ul + 2] + data[ur + 2] - 2 * data[ml + 2] + 2 * data[mr + 2] - data[dl + 2] + data[dr + 2];
      const gyB = -data[ul + 2] - 2 * data[um + 2] - data[ur + 2] + data[dl + 2] + 2 * data[dm + 2] + data[dr + 2];

      const rgbG =
        Math.sqrt(gxR * gxR + gyR * gyR + gxG * gxG + gyG * gyG + gxB * gxB + gyB * gyB) * 0.165;

      grad[rowMid + x] = Math.min(255, Math.max(lumaG, rgbG));
    }
  }

  return { luma, chroma, grad };
}

/**
 * Edge-Barrier + Studio-Gradient Adaptive Foreground Extraction.
 * Specifically handles:
 *  - Meshy dark/slate studio backgrounds with center spotlight halo, blurred wall lines & reflective floors
 *  - Transparent PNGs, solid backgrounds, fake PNG checkerboards, white/light studio sweeps
 *  - Interior background pockets between legs or under arms (without punching holes in dark hair/black belts)
 *  - Multi-panel Meshy sheets (selecting the relevant character panel when requested)
 */
export function extractAdaptiveForegroundMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: { mode?: BackgroundRemovalMode; targetAngle?: MultiViewAngle } = {}
): { mask: Uint8Array; hadOpaqueBg: boolean } {
  const { mode = 'auto', targetAngle } = options;
  const total = w * h;

  // 1. Check if image already has a clean transparent background around borders
  let borderCount = 0;
  let transparentBorder = 0;
  for (let x = 0; x < w; x += 2) {
    borderCount += 2;
    if (data[x * 4 + 3] < 45) transparentBorder++;
    if (data[((h - 1) * w + x) * 4 + 3] < 45) transparentBorder++;
  }
  for (let y = 0; y < h; y += 2) {
    borderCount += 2;
    if (data[y * w * 4 + 3] < 45) transparentBorder++;
    if (data[(y * w + w - 1) * 4 + 3] < 45) transparentBorder++;
  }

  if (transparentBorder / Math.max(1, borderCount) > 0.25) {
    const alphaMask = new Uint8Array(total);
    let fg = 0;
    for (let i = 0; i < total; i++) {
      if (data[i * 4 + 3] > 45) {
        alphaMask[i] = 1;
        fg++;
      }
    }
    if (fg > 0 && fg / total < 0.90) {
      return { mask: cleanMaskIslands(alphaMask, w, h, targetAngle), hadOpaqueBg: false };
    }
  }

  // 2. Opaque / Studio background analysis
  const borderStats = extractBorderStats(data, w, h);
  if (borderStats.clusters.length === 0) {
    return { mask: new Uint8Array(total).fill(1), hadOpaqueBg: true };
  }

  const { luma, chroma, grad } = computeFeatures(data, w, h);
  const borderClusters = borderStats.clusters;

  const distToClusters = (r: number, g: number, b: number) => {
    let minD2 = 1e9;
    for (let c = 0; c < borderClusters.length; c++) {
      const [cr, cg, cb] = borderClusters[c];
      const dr = r - cr;
      const dg = g - cg;
      const db = b - cb;
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 < minD2) minD2 = d2;
    }
    return Math.sqrt(minD2);
  };

  interface PassConfig {
    seedTol: number;
    baseTol: number;
    stepTol: number;
    edgeBarrier: number;
    maxDrift: number;
    darkBaseTol: number;
    darkStepTol: number;
    darkBarrier: number;
    darkMaxDrift: number;
    studioLumaCeil: number;
    studioChromaCeil: number;
    bokehStepTol: number;
    bokehBarrier: number;
  }

  const runEdgeBarrierBFS = (cfg: PassConfig) => {
    const visited = new Uint8Array(total);
    const bg = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const trySeed = (x: number, y: number) => {
      const p = y * w + x;
      if (visited[p]) return;
      const idx = p * 4;
      if (
        data[idx + 3] < 45 ||
        distToClusters(data[idx], data[idx + 1], data[idx + 2]) <= cfg.seedTol
      ) {
        visited[p] = 1;
        bg[p] = 1;
        queue[tail++] = p;
      }
    };

    for (let x = 0; x < w; x++) {
      trySeed(x, 0);
      trySeed(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      trySeed(0, y);
      trySeed(w - 1, y);
    }

    while (head < tail) {
      const p = queue[head++];
      const cx = p % w;
      const cy = Math.floor(p / w);
      const cIdx = p * 4;
      const cr = data[cIdx];
      const cg = data[cIdx + 1];
      const cb = data[cIdx + 2];

      const nIndices: number[] = [];
      if (cx > 0) nIndices.push(p - 1);
      if (cx < w - 1) nIndices.push(p + 1);
      if (cy > 0) nIndices.push(p - w);
      if (cy < h - 1) nIndices.push(p + w);

      for (let k = 0; k < nIndices.length; k++) {
        const np = nIndices[k];
        if (visited[np]) continue;
        const nIdx = np * 4;
        if (data[nIdx + 3] < 45) {
          visited[np] = 1;
          bg[np] = 1;
          queue[tail++] = np;
          continue;
        }

        const nr = data[nIdx];
        const ng = data[nIdx + 1];
        const nb = data[nIdx + 2];
        const dCluster = distToClusters(nr, ng, nb);
        const dLocal = Math.sqrt((nr - cr) * (nr - cr) + (ng - cg) * (ng - cg) + (nb - cb) * (nb - cb));
        const g = grad[np];
        const lum = luma[np];

        let isBgPixel = false;
        if (lum < 68) {
          // Strict barrier on dark regions so dark hair, black belt & dark shoe soles never get eaten by dark studio walls
          const isDarkBorderMatch = dCluster <= cfg.darkBaseTol && g <= cfg.darkBarrier;
          const isDarkSmoothWall =
            dLocal <= cfg.darkStepTol && g <= cfg.darkBarrier && dCluster <= cfg.darkMaxDrift;
          isBgPixel = isDarkBorderMatch || isDarkSmoothWall;
        } else {
          // Smooth Meshy studio floor / spotlight / bokeh traversal on mid & bright pixels
          const isDirectBorderMatch = dCluster <= cfg.baseTol && g <= cfg.edgeBarrier + 6;
          const isSmoothGradient = dLocal <= cfg.stepTol && g <= cfg.edgeBarrier && dCluster <= cfg.maxDrift;
          const isMeshyStudioBackdrop =
            borderStats.isNeutralStudioBg &&
            dLocal <= cfg.stepTol + 3 &&
            g <= cfg.edgeBarrier &&
            chroma[np] <= cfg.studioChromaCeil &&
            lum <= cfg.studioLumaCeil;
          const isUltraSmoothBokeh =
            dLocal <= cfg.bokehStepTol &&
            g <= cfg.bokehBarrier &&
            chroma[np] <= cfg.studioChromaCeil + 18 &&
            lum <= cfg.studioLumaCeil + 15;
          const isLightStudioSweep =
            borderStats.isLightStudioBg &&
            dLocal <= cfg.stepTol + 3 &&
            g <= cfg.edgeBarrier &&
            chroma[np] <= 30 &&
            lum >= 155;
          isBgPixel =
            isDirectBorderMatch ||
            isSmoothGradient ||
            isMeshyStudioBackdrop ||
            isUltraSmoothBokeh ||
            isLightStudioSweep;
        }

        if (isBgPixel) {
          visited[np] = 1;
          bg[np] = 1;
          queue[tail++] = np;
        }
      }
    }

    // Remove interior enclosed smooth background pockets (e.g., between legs / under arms on studio floor)
    const finalBg = clearInteriorStudioPockets(bg, data, luma, chroma, grad, w, h, borderStats);

    const mask = new Uint8Array(total);
    let fgCount = 0;
    let marginFg = 0;
    let marginTotal = 0;
    let cappedGradSum = 0;
    let edgeHits = 0;
    let boundaryCount = 0;
    let minFgY = h;
    let maxFgY = -1;
    const rowFg = new Int32Array(h);
    const m = Math.max(4, Math.floor(Math.min(w, h) * 0.05));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const isFg = finalBg[p] ? 0 : 1;
        mask[p] = isFg;
        if (isFg) {
          fgCount++;
          rowFg[y]++;
          if (y < minFgY) minFgY = y;
          if (y > maxFgY) maxFgY = y;
          if (
            (x > 0 && finalBg[p - 1]) ||
            (x < w - 1 && finalBg[p + 1]) ||
            (y > 0 && finalBg[p - w]) ||
            (y < h - 1 && finalBg[p + w])
          ) {
            // Cap gradient contribution at 24 so eating dark hair/shoes to land on high-contrast skin/shirt doesn't artificially boost score
            cappedGradSum += Math.min(24, grad[p]);
            if (grad[p] >= 11) edgeHits++;
            boundaryCount++;
          }
        }
        if (x < m || x >= w - m || y < m || y >= h - m) {
          marginTotal++;
          if (isFg) marginFg++;
        }
      }
    }

    // Check if the pass sliced a single vertical character in two (empty waist gap inside [minFgY..maxFgY])
    let emptyGapRows = 0;
    if (maxFgY > minFgY + 16) {
      const spanStart = minFgY + Math.round((maxFgY - minFgY) * 0.15);
      const spanEnd = maxFgY - Math.round((maxFgY - minFgY) * 0.15);
      for (let y = spanStart; y <= spanEnd; y++) {
        if (rowFg[y] === 0) emptyGapRows++;
      }
    }

    const fgRatio = fgCount / total;
    const borderFgRatio = marginFg / Math.max(1, marginTotal);
    const meanCappedGrad = boundaryCount > 0 ? cappedGradSum / boundaryCount : 0;
    const edgeHitRatio = boundaryCount > 0 ? edgeHits / boundaryCount : 0;

    let score =
      meanCappedGrad * 1.85 +
      edgeHitRatio * 34 -
      borderFgRatio * 115 -
      Math.min(1, emptyGapRows / 4) * 85;
    if (fgRatio > 0.68) score -= (fgRatio - 0.68) * 165;
    if (fgRatio < 0.05) score -= 120;

    return { mask, fgRatio, borderFgRatio, score };
  };

  // Studio ceiling adapts to the brightest rim seen on floor/wall while leaving headroom for reflective studio sweeps
  const studioCeil = Math.min(228, Math.max(155, borderStats.maxLuma + 72, borderStats.avgLuma + 105));
  const configs: PassConfig[] =
    mode === 'soft'
      ? [
          {
            seedTol: 26,
            baseTol: 26,
            stepTol: 12,
            edgeBarrier: 18,
            maxDrift: 85,
            darkBaseTol: 11,
            darkStepTol: 4.5,
            darkBarrier: 8.5,
            darkMaxDrift: 18,
            studioLumaCeil: Math.min(210, studioCeil - 20),
            studioChromaCeil: 32,
            bokehStepTol: 7,
            bokehBarrier: 9,
          },
          {
            seedTol: 32,
            baseTol: 34,
            stepTol: 15,
            edgeBarrier: 21,
            maxDrift: 115,
            darkBaseTol: 14,
            darkStepTol: 5.5,
            darkBarrier: 10,
            darkMaxDrift: 22,
            studioLumaCeil: studioCeil - 5,
            studioChromaCeil: 36,
            bokehStepTol: 9,
            bokehBarrier: 11,
          },
        ]
      : mode === 'strong'
      ? [
          {
            seedTol: 44,
            baseTol: 46,
            stepTol: 20,
            edgeBarrier: 29,
            maxDrift: 165,
            darkBaseTol: 20,
            darkStepTol: 8,
            darkBarrier: 12.5,
            darkMaxDrift: 32,
            studioLumaCeil: Math.min(234, studioCeil + 12),
            studioChromaCeil: 46,
            bokehStepTol: 12,
            bokehBarrier: 15,
          },
          {
            seedTol: 52,
            baseTol: 56,
            stepTol: 24,
            edgeBarrier: 34,
            maxDrift: 200,
            darkBaseTol: 25,
            darkStepTol: 10,
            darkBarrier: 14.5,
            darkMaxDrift: 40,
            studioLumaCeil: Math.min(238, studioCeil + 22),
            studioChromaCeil: 52,
            bokehStepTol: 15,
            bokehBarrier: 18,
          },
        ]
      : [
          {
            seedTol: 32,
            baseTol: 32,
            stepTol: 14,
            edgeBarrier: 22,
            maxDrift: 110,
            darkBaseTol: 15,
            darkStepTol: 6,
            darkBarrier: 10.5,
            darkMaxDrift: 24,
            studioLumaCeil: Math.min(220, studioCeil - 10),
            studioChromaCeil: 36,
            bokehStepTol: 8,
            bokehBarrier: 11,
          },
          {
            seedTol: 38,
            baseTol: 42,
            stepTol: 18,
            edgeBarrier: 26,
            maxDrift: 145,
            darkBaseTol: 19,
            darkStepTol: 7.5,
            darkBarrier: 12,
            darkMaxDrift: 30,
            studioLumaCeil: studioCeil,
            studioChromaCeil: 42,
            bokehStepTol: 11,
            bokehBarrier: 14,
          },
          {
            seedTol: 46,
            baseTol: 50,
            stepTol: 22,
            edgeBarrier: 31,
            maxDrift: 175,
            darkBaseTol: 22,
            darkStepTol: 9,
            darkBarrier: 13.5,
            darkMaxDrift: 36,
            studioLumaCeil: Math.min(232, studioCeil + 14),
            studioChromaCeil: 46,
            bokehStepTol: 13,
            bokehBarrier: 16,
          },
        ];

  let best = runEdgeBarrierBFS(configs[0]);
  for (let i = 1; i < configs.length; i++) {
    const candidate = runEdgeBarrierBFS(configs[i]);
    if (candidate.score > best.score && candidate.fgRatio >= 0.04) {
      best = candidate;
    }
  }

  // Soft 4px dark-feature guard: restores dark hair wisps, belt rims & shoe soles touching the core silhouette
  const protectedMask = recoverDarkBoundaryFeatures(best.mask, data, luma, grad, w, h, distToClusters);

  return {
    mask: cleanMaskIslands(protectedMask, w, h, targetAngle),
    hadOpaqueBg: true,
  };
}

/**
 * Recovers up to 4px of dark hair strands, black belt edges, and dark shoe soles immediately
 * adjacent to the character silhouette whenever they have texture/edge or distinct dark albedo.
 */
function recoverDarkBoundaryFeatures(
  mask: Uint8Array,
  data: Uint8ClampedArray,
  luma: Float32Array,
  grad: Float32Array,
  w: number,
  h: number,
  distToClusters: (r: number, g: number, b: number) => number
): Uint8Array {
  const out = new Uint8Array(mask);
  const bbox = computeTightMaskBBox(mask, w, h);
  const charH = Math.max(16, bbox.maxY - bbox.minY + 1);
  const padX0 = Math.max(4, bbox.minX - 10);
  const padX1 = Math.min(w - 5, bbox.maxX + 10);
  const padY0 = Math.max(4, bbox.minY - 14);
  const padY1 = Math.min(h - 5, bbox.maxY + 10);

  const headZoneMaxY = bbox.minY + Math.round(charH * 0.28);
  const soleZoneMinY = bbox.maxY - Math.round(charH * 0.16);

  for (let pass = 0; pass < 5; pass++) {
    const toRestore: number[] = [];
    for (let y = padY0; y <= padY1; y++) {
      const isHeadOrSoleZone = y <= headZoneMaxY || y >= soleZoneMinY;
      for (let x = padX0; x <= padX1; x++) {
        const p = y * w + x;
        if (out[p] || data[p * 4 + 3] < 45) continue;
        if (luma[p] >= 72) continue;

        const hasFgNeighbor =
          out[p - 1] || out[p + 1] || out[p - w] || out[p + w];
        if (!hasFgNeighbor) continue;

        const k = p * 4;
        const dBg = distToClusters(data[k], data[k + 1], data[k + 2]);
        const minGrad = isHeadOrSoleZone ? 6.5 : 8.5;
        const minDist = isHeadOrSoleZone ? 15 : 20;
        if (grad[p] >= minGrad || dBg >= minDist) {
          toRestore.push(p);
        }
      }
    }
    if (toRestore.length === 0) break;
    for (const p of toRestore) out[p] = 1;
  }

  return out;
}

/**
 * Finds interior enclosed regions (such as the gap between legs when a floor shadow connects the shoes)
 * that match the exterior background's low-gradient, low-chroma row-band distribution and clears them safely.
 */
function clearInteriorStudioPockets(
  bg: Uint8Array,
  data: Uint8ClampedArray,
  luma: Float32Array,
  chroma: Uint8Array,
  grad: Float32Array,
  w: number,
  h: number,
  borderStats: ReturnType<typeof extractBorderStats>
): Uint8Array {
  const total = w * h;
  const out = new Uint8Array(bg);

  // Build global & per-band exterior background color stats so bright studio floors at bottom
  // match leg pockets even when top studio walls are dark!
  const BANDS = 16;
  const bandR = new Float32Array(BANDS);
  const bandG = new Float32Array(BANDS);
  const bandB = new Float32Array(BANDS);
  const bandLMin = new Float32Array(BANDS).fill(255);
  const bandLMax = new Float32Array(BANDS).fill(0);
  const bandCnt = new Int32Array(BANDS);

  let bgLumaMin = 255;
  let bgLumaMax = 0;
  let bgChromaMax = 0;
  let bgCnt = 0;

  for (let y = 0; y < h; y += 2) {
    const bIdx = Math.min(BANDS - 1, Math.floor((y / h) * BANDS));
    for (let x = 0; x < w; x += 2) {
      const i = y * w + x;
      if (!bg[i]) continue;
      const l = luma[i];
      const c = chroma[i];
      if (l < bgLumaMin) bgLumaMin = l;
      if (l > bgLumaMax) bgLumaMax = l;
      if (c > bgChromaMax) bgChromaMax = c;
      if (l < bandLMin[bIdx]) bandLMin[bIdx] = l;
      if (l > bandLMax[bIdx]) bandLMax[bIdx] = l;

      const k = i * 4;
      bandR[bIdx] += data[k];
      bandG[bIdx] += data[k + 1];
      bandB[bIdx] += data[k + 2];
      bandCnt[bIdx]++;
      bgCnt++;
    }
  }

  if (bgCnt < 50) return out;
  for (let b = 0; b < BANDS; b++) {
    if (bandCnt[b] > 0) {
      bandR[b] /= bandCnt[b];
      bandG[b] /= bandCnt[b];
      bandB[b] /= bandCnt[b];
    }
  }

  const minL = Math.max(0, bgLumaMin - 8);
  const maxL = Math.min(255, bgLumaMax + 14);
  const maxC = Math.max(26, Math.min(46, bgChromaMax + 8));

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);

  // Only inspect torso/arm/leg zones (never head/hair at top 28% or shoe soles at bottom 6%)
  for (let y = Math.round(h * 0.28); y < Math.round(h * 0.92); y++) {
    const bIdx = Math.min(BANDS - 1, Math.floor((y / h) * BANDS));
    const hasBand = bandCnt[bIdx] >= 8;

    for (let x = Math.round(w * 0.12); x < Math.round(w * 0.88); x++) {
      const start = y * w + x;
      if (out[start] || visited[start]) continue;
      // Never punch holes in dark hair, black belts, or dark shoes (luma < 52)
      if (
        luma[start] < 52 ||
        grad[start] > 10 ||
        chroma[start] > maxC ||
        luma[start] < minL ||
        luma[start] > maxL
      ) {
        continue;
      }

      if (hasBand) {
        const k0 = start * 4;
        const distBand = Math.sqrt(
          (data[k0] - bandR[bIdx]) ** 2 +
            (data[k0 + 1] - bandG[bIdx]) ** 2 +
            (data[k0 + 2] - bandB[bIdx]) ** 2
        );
        if (distBand > (borderStats.isNeutralStudioBg ? 44 : 32)) continue;
      }

      let head = 0;
      let tail = 0;
      const comp: number[] = [];
      let gradSum = 0;
      let highGradPixels = 0;
      let cMinX = w;
      let cMaxX = 0;
      let cMinY = h;
      let cMaxY = 0;
      visited[start] = 1;
      queue[tail++] = start;

      while (head < tail) {
        const p = queue[head++];
        comp.push(p);
        gradSum += grad[p];
        if (grad[p] > 16) highGradPixels++;

        const cx = p % w;
        const cy = Math.floor(p / w);
        if (cx < cMinX) cMinX = cx;
        if (cx > cMaxX) cMaxX = cx;
        if (cy < cMinY) cMinY = cy;
        if (cy > cMaxY) cMaxY = cy;

        const nb = [
          cx > 0 ? p - 1 : -1,
          cx < w - 1 ? p + 1 : -1,
          cy > 0 ? p - w : -1,
          cy < h - 1 ? p + w : -1,
        ];
        for (const np of nb) {
          if (np < 0 || visited[np] || out[np]) continue;
          if (
            luma[np] >= 50 &&
            grad[np] <= 14 &&
            chroma[np] <= maxC &&
            luma[np] >= minL &&
            luma[np] <= maxL
          ) {
            visited[np] = 1;
            queue[tail++] = np;
          }
        }
      }

      const compW = cMaxX - cMinX + 1;
      const compH = cMaxY - cMinY + 1;
      // Reject wide horizontal bands (e.g., waist/belt shadow) — real leg/arm pockets are vertical or compact
      const isHorizontalWaistBand = compW > compH * 1.7 && cMinY > h * 0.34 && cMaxY < h * 0.72;
      const meanG = gradSum / Math.max(1, comp.length);
      if (
        !isHorizontalWaistBand &&
        comp.length >= 24 &&
        comp.length < total * 0.14 &&
        meanG < 8.5 &&
        highGradPixels === 0
      ) {
        for (const p of comp) out[p] = 1;
      }
    }
  }

  return out;
}

/**
 * Removes isolated background noise dots, fills 1px interior holes, drops text labels/UI marks,
 * and if a Meshy multi-panel sheet is detected (e.g. 1x2 Back+Left or 2x2 Front sheet),
 * selects the appropriate single character panel so 3D reconstruction never gets duplicated clones!
 */
function cleanMaskIslands(
  mask: Uint8Array,
  w: number,
  h: number,
  targetAngle?: MultiViewAngle
): Uint8Array {
  const total = w * h;
  const cleaned = new Uint8Array(total);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          n += mask[(y + dy) * w + (x + dx)];
        }
      }
      if (mask[idx] === 1 && n <= 2) cleaned[idx] = 0;
      else if (mask[idx] === 0 && n >= 7) cleaned[idx] = 1;
      else cleaned[idx] = mask[idx];
    }
  }

  const visited = new Uint8Array(total);
  const comps: Array<{
    pixels: number[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    cx: number;
    cy: number;
  }> = [];
  const queue = new Int32Array(total);

  for (let i = 0; i < total; i++) {
    if (cleaned[i] && !visited[i]) {
      let head = 0;
      let tail = 0;
      const pixels: number[] = [];
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      let sx = 0;
      let sy = 0;

      visited[i] = 1;
      queue[tail++] = i;
      while (head < tail) {
        const p = queue[head++];
        pixels.push(p);
        const cx = p % w;
        const cy = Math.floor(p / w);
        sx += cx;
        sy += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx > 0 && cleaned[p - 1] && !visited[p - 1]) {
          visited[p - 1] = 1;
          queue[tail++] = p - 1;
        }
        if (cx < w - 1 && cleaned[p + 1] && !visited[p + 1]) {
          visited[p + 1] = 1;
          queue[tail++] = p + 1;
        }
        if (cy > 0 && cleaned[p - w] && !visited[p - w]) {
          visited[p - w] = 1;
          queue[tail++] = p - w;
        }
        if (cy < h - 1 && cleaned[p + w] && !visited[p + w]) {
          visited[p + w] = 1;
          queue[tail++] = p + w;
        }
      }
      comps.push({
        pixels,
        minX,
        maxX,
        minY,
        maxY,
        cx: sx / pixels.length / w,
        cy: sy / pixels.length / h,
      });
    }
  }

  if (comps.length > 1) {
    comps.sort((a, b) => b.pixels.length - a.pixels.length);
    const mainArea = comps[0].pixels.length;

    // Detect multi-character Meshy turnaround sheet ONLY when large panels are genuinely side-by-side horizontally!
    // Never cut a vertically-stacked torso + legs (same X column) into two halves.
    const majorPanels = comps.filter((c) => c.pixels.length >= mainArea * 0.45);
    if (majorPanels.length >= 2) {
      const p0 = majorPanels[0];
      const p1 = majorPanels[1];
      const xOverlap = Math.max(0, Math.min(p0.maxX, p1.maxX) - Math.max(p0.minX, p1.minX));
      const minW = Math.max(1, Math.min(p0.maxX - p0.minX + 1, p1.maxX - p1.minX + 1));
      const isSideBySideSheet = xOverlap / minW < 0.22 && Math.abs(p0.cx - p1.cx) > 0.28;

      if (isSideBySideSheet) {
        let chosen = majorPanels[0];
        if (targetAngle === 'front' || targetAngle === 'back') {
          chosen = [...majorPanels].sort((a, b) => a.cx + a.cy * 1.4 - (b.cx + b.cy * 1.4))[0];
        } else if (targetAngle === 'left' || targetAngle === 'right') {
          chosen = [...majorPanels].sort((a, b) => b.cx - a.cx)[0];
        }
        // Keep any vertical sub-pieces aligned with the chosen panel's column (e.g. feet/shoes)
        cleaned.fill(0);
        for (const c of comps) {
          const compH = (c.maxY - c.minY + 1) / h;
          const isHeaderFooterText =
            c.pixels.length < mainArea * 0.12 &&
            compH < 0.09 &&
            (c.maxY < h * 0.14 || c.minY > h * 0.86);
          if (
            !isHeaderFooterText &&
            (c === chosen ||
              (Math.abs(c.cx - chosen.cx) < 0.22 && c.pixels.length >= Math.max(14, chosen.pixels.length * 0.025)))
          ) {
            for (const p of c.pixels) cleaned[p] = 1;
          }
        }
        return cleaned;
      }
    }

    // Normal single-subject cleanup: preserve all limbs/torso/shoes/hair aligned with the character while dropping text & specks
    const main = comps[0];
    const keepMin = Math.max(16, mainArea * 0.025);
    cleaned.fill(0);
    for (const c of comps) {
      const compH = (c.maxY - c.minY + 1) / h;
      const isHeaderFooterText =
        c.pixels.length < mainArea * 0.12 &&
        compH < 0.09 &&
        (c.maxY < h * 0.14 || c.minY > h * 0.86);
      const isAlignedBodyPart =
        Math.abs(c.cx - main.cx) <= 0.28 && c.pixels.length >= Math.max(14, mainArea * 0.015);

      if (!isHeaderFooterText && (c.pixels.length >= keepMin || isAlignedBodyPart)) {
        for (const p of c.pixels) cleaned[p] = 1;
      }
    }
  }

  return cleaned;
}

export function computeTightMaskBBox(mask: Uint8Array, w: number, h: number) {
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let fgCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return {
      minX: Math.round(w * 0.15),
      maxX: Math.round(w * 0.85),
      minY: Math.round(h * 0.05),
      maxY: Math.round(h * 0.95),
      fgCount: Math.round(w * h * 0.5),
    };
  }

  return { minX, maxX, minY, maxY, fgCount };
}

/**
 * Rotates an image URL cleanly by 0, 90, 180, or 270 degrees.
 */
export async function rotateImageDataUrl(srcUrl: string, degrees: 0 | 90 | 180 | 270): Promise<string> {
  if (degrees === 0) return srcUrl;
  const img = await loadImageElement(srcUrl);
  const w = img.naturalWidth || img.width || 512;
  const h = img.naturalHeight || img.height || 512;
  const c = document.createElement('canvas');
  if (degrees === 90 || degrees === 270) {
    c.width = h;
    c.height = w;
  } else {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d');
  if (!ctx) return srcUrl;

  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  return c.toDataURL('image/png');
}

/**
 * Cuts out the background cleanly at 512px FIRST (preserving exact original aspect ratio without letterbox padding),
 * applies soft 1px anti-halo edge feathering, crops tightly to the silhouette, and normalizes onto a 512x512
 * transparent PNG aligned consistently at 7%..93% (ground-anchored feet).
 */
export async function cleanAndNormalizeSingleView(
  srcUrl: string,
  angle: MultiViewAngle,
  options: {
    removeBg?: boolean;
    rotateDeg?: 0 | 90 | 180 | 270;
    autoContrast?: boolean;
    mode?: BackgroundRemovalMode;
  } = {}
): Promise<SegmentedViewInfo> {
  const { removeBg = true, rotateDeg = 0, autoContrast = false, mode = 'auto' } = options;
  const workingUrl = rotateDeg !== 0 ? await rotateImageDataUrl(srcUrl, rotateDeg) : srcUrl;
  const img = await loadImageElement(workingUrl);

  const natW = img.naturalWidth || 512;
  const natH = img.naturalHeight || 512;
  const fit = Math.min(512 / natW, 512 / natH);
  const fitW = Math.max(64, Math.round(natW * fit));
  const fitH = Math.max(64, Math.round(natH * fit));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = fitW;
  workCanvas.height = fitH;
  const wCtx = workCanvas.getContext('2d');
  if (!wCtx) {
    return {
      dataUrl: srcUrl,
      hadOpaqueBg: false,
      coverage: 0.5,
      aspectRatio: 0.6,
      appliedRotationDeg: rotateDeg,
      maskHealth: 'clean',
    };
  }

  wCtx.drawImage(img, 0, 0, fitW, fitH);
  const imgData = wCtx.getImageData(0, 0, fitW, fitH);
  const px = imgData.data;
  let { mask, hadOpaqueBg } = extractAdaptiveForegroundMask(px, fitW, fitH, {
    mode,
    targetAngle: angle,
  });

  // Automatic strong retry if auto mode left too much Meshy studio floor / backdrop attached
  if (mode === 'auto' && removeBg) {
    let fg = 0;
    const totalPx = fitW * fitH;
    for (let i = 0; i < totalPx; i++) if (mask[i]) fg++;
    if (fg / totalPx > 0.70) {
      const strongRes = extractAdaptiveForegroundMask(px, fitW, fitH, {
        mode: 'strong',
        targetAngle: angle,
      });
      let sFg = 0;
      for (let i = 0; i < totalPx; i++) if (strongRes.mask[i]) sFg++;
      if (sFg / totalPx >= 0.05 && sFg / totalPx < fg / totalPx - 0.07) {
        mask = strongRes.mask;
      }
    }
  }

  if (removeBg) {
    for (let y = 0; y < fitH; y++) {
      for (let x = 0; x < fitW; x++) {
        const idx = y * fitW + x;
        if (mask[idx] === 0) {
          px[idx * 4 + 3] = 0;
        } else {
          // Soft 1px perimeter anti-aliasing so dark studio halos fade cleanly
          const isPerimeter =
            (x > 0 && mask[idx - 1] === 0) ||
            (x < fitW - 1 && mask[idx + 1] === 0) ||
            (y > 0 && mask[idx - fitW] === 0) ||
            (y < fitH - 1 && mask[idx + fitW] === 0);
          if (isPerimeter) {
            px[idx * 4 + 3] = Math.min(px[idx * 4 + 3], 210);
          }
        }
      }
    }
  }

  if (autoContrast) {
    let sumLuma = 0;
    let cnt = 0;
    for (let i = 0; i < fitW * fitH; i++) {
      if (mask[i]) {
        const k = i * 4;
        sumLuma += 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];
        cnt++;
      }
    }
    const avg = cnt > 0 ? sumLuma / cnt : 128;
    if (avg < 85) {
      const boost = Math.min(1.5, 108 / Math.max(avg, 25));
      for (let i = 0; i < fitW * fitH; i++) {
        if (mask[i]) {
          const k = i * 4;
          px[k] = Math.min(255, Math.round(px[k] * boost));
          px[k + 1] = Math.min(255, Math.round(px[k + 1] * boost));
          px[k + 2] = Math.min(255, Math.round(px[k + 2] * boost));
        }
      }
    }
  }

  wCtx.putImageData(imgData, 0, 0);

  const bbox = computeTightMaskBBox(mask, fitW, fitH);
  const bw = bbox.maxX - bbox.minX + 1;
  const bh = bbox.maxY - bbox.minY + 1;
  const aspectRatio = THREE.MathUtils.clamp(bw / Math.max(1, bh), 0.22, 2.2);

  const outSize = 512;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) {
    const cov = bbox.fgCount / (fitW * fitH);
    return {
      dataUrl: workCanvas.toDataURL('image/png'),
      hadOpaqueBg,
      coverage: cov,
      aspectRatio,
      appliedRotationDeg: rotateDeg,
      maskHealth: cov > 0.85 ? 'uncertain_full' : 'clean',
    };
  }

  const isHorizontalView = angle === 'top' || angle === 'bottom';
  if (isHorizontalView) {
    const maxSpan = outSize * 0.84;
    const sc = Math.min(maxSpan / bw, maxSpan / bh);
    const rw = bw * sc;
    const rh = bh * sc;
    const dx = (outSize - rw) / 2;
    const dy = (outSize - rh) / 2;
    oCtx.drawImage(workCanvas, bbox.minX, bbox.minY, bw, bh, dx, dy, rw, rh);
  } else {
    const targetH = outSize * 0.86;
    const maxW = outSize * 0.88;
    const sc = Math.min(targetH / bh, maxW / bw);
    const rw = bw * sc;
    const rh = bh * sc;
    const dx = (outSize - rw) / 2;
    const dy = outSize * 0.93 - rh;
    oCtx.drawImage(workCanvas, bbox.minX, bbox.minY, bw, bh, dx, dy, rw, rh);
  }

  const finalCov = bbox.fgCount / (fitW * fitH);
  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    hadOpaqueBg,
    coverage: finalCov,
    aspectRatio,
    appliedRotationDeg: rotateDeg,
    maskHealth: finalCov > 0.85 ? 'uncertain_full' : 'clean',
  };
}

/**
 * Computes the best orthogonal rotation (0, 90, 180, 270) for a Top or Bottom view
 * by matching its silhouette aspect ratio & 2D footprint IoU against the Front x Side cross-section.
 */
export async function detectOptimalHorizontalRotation(
  horizontalUrl: string,
  frontUrl: string | null | undefined,
  sideUrl: string | null | undefined,
  sideAngle: 'left' | 'right' = 'right'
): Promise<0 | 90 | 180 | 270> {
  const sampleMaskBox = async (url: string, size = 64, angle?: MultiViewAngle) => {
    const img = await loadImageElement(url);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { mask } = extractAdaptiveForegroundMask(
      ctx.getImageData(0, 0, size, size).data,
      size,
      size,
      { targetAngle: angle }
    );
    const bbox = computeTightMaskBBox(mask, size, size);
    return { mask, size, bbox, aspect: (bbox.maxX - bbox.minX + 1) / Math.max(1, bbox.maxY - bbox.minY + 1) };
  };

  const hInfo = await sampleMaskBox(horizontalUrl, 64, 'top');
  if (!hInfo) return 0;

  const frontInfo = frontUrl ? await sampleMaskBox(frontUrl, 64, 'front').catch(() => null) : null;
  const sideInfo = sideUrl ? await sampleMaskBox(sideUrl, 64, sideAngle).catch(() => null) : null;

  const frontAspect = frontInfo ? frontInfo.aspect : 0.62;
  const sideAspect = sideInfo ? sideInfo.aspect : THREE.MathUtils.clamp(frontAspect * 0.56, 0.25, 0.55);
  const expectedTopAspect = frontAspect / Math.max(0.18, sideAspect);

  const G = 32;
  const footprint = new Uint8Array(G * G);
  for (let iz = 0; iz < G; iz++) {
    const nz = iz / (G - 1);
    for (let ix = 0; ix < G; ix++) {
      const nx = ix / (G - 1);

      let frontHit = true;
      if (frontInfo) {
        const fx = Math.round(frontInfo.bbox.minX + nx * (frontInfo.bbox.maxX - frontInfo.bbox.minX));
        const yStart = Math.round(frontInfo.bbox.minY + 0.08 * (frontInfo.bbox.maxY - frontInfo.bbox.minY));
        const yEnd = Math.round(frontInfo.bbox.minY + 0.72 * (frontInfo.bbox.maxY - frontInfo.bbox.minY));
        let colHits = 0;
        for (let y = yStart; y <= yEnd; y++) {
          if (frontInfo.mask[y * frontInfo.size + fx]) colHits++;
        }
        frontHit = colHits >= 2;
      }

      let sideHit = true;
      if (sideInfo) {
        const uSide = sideAngle === 'right' ? 1 - nz : nz;
        const sx = Math.round(sideInfo.bbox.minX + uSide * (sideInfo.bbox.maxX - sideInfo.bbox.minX));
        const yStart = Math.round(sideInfo.bbox.minY + 0.08 * (sideInfo.bbox.maxY - sideInfo.bbox.minY));
        const yEnd = Math.round(sideInfo.bbox.minY + 0.72 * (sideInfo.bbox.maxY - sideInfo.bbox.minY));
        let colHits = 0;
        for (let y = yStart; y <= yEnd; y++) {
          if (sideInfo.mask[y * sideInfo.size + sx]) colHits++;
        }
        sideHit = colHits >= 2;
      } else {
        sideHit = Math.abs(nz - 0.5) <= 0.42;
      }

      footprint[iz * G + ix] = frontHit && sideHit ? 1 : 0;
    }
  }

  let bestRot: 0 | 90 | 180 | 270 = 0;
  let bestScore = -1e9;

  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  for (const rot of rotations) {
    const bw = hInfo.bbox.maxX - hInfo.bbox.minX + 1;
    const bh = hInfo.bbox.maxY - hInfo.bbox.minY + 1;
    const rotW = rot === 90 || rot === 270 ? bh : bw;
    const rotH = rot === 90 || rot === 270 ? bw : bh;
    const rotAspect = rotW / Math.max(1, rotH);

    const aspectErr = Math.abs(Math.log(Math.max(0.2, rotAspect) / Math.max(0.2, expectedTopAspect)));

    let inter = 0;
    let union = 0;
    for (let iz = 0; iz < G; iz++) {
      const nz = iz / (G - 1);
      for (let ix = 0; ix < G; ix++) {
        const nx = ix / (G - 1);
        let u = nx;
        let v = nz;
        if (rot === 90) {
          u = nz;
          v = 1 - nx;
        } else if (rot === 180) {
          u = 1 - nx;
          v = 1 - nz;
        } else if (rot === 270) {
          u = 1 - nz;
          v = nx;
        }
        const sx = Math.round(hInfo.bbox.minX + u * (bw - 1));
        const sy = Math.round(hInfo.bbox.minY + v * (bh - 1));
        const topBit = hInfo.mask[sy * hInfo.size + sx] === 1;
        const fpBit = footprint[iz * G + ix] === 1;
        if (topBit && fpBit) inter++;
        if (topBit || fpBit) union++;
      }
    }

    const iou = union > 0 ? inter / union : 0;
    const zeroBias = rot === 0 ? 0.015 : 0;
    const score = iou * 2.0 - aspectErr * 1.35 + zeroBias;
    if (score > bestScore) {
      bestScore = score;
      bestRot = rot;
    }
  }

  return bestRot;
}

/**
 * Full automatic preparation of all fixed views:
 * - Removes Meshy/studio/gradient/checkerboard backgrounds cleanly
 * - Aligns and scales all vertical views (Front, Back, Left, Right, 3/4) to the exact same head-to-feet ground line
 * - Auto-rotates Top & Bottom views (0/90/180/270) to match shoulder/depth orientation
 */
export async function autoPrepareAllViews(
  views: Record<MultiViewAngle, string | null>,
  options: {
    removeBg?: boolean;
    autoContrast?: boolean;
    autoRotateTopBottom?: boolean;
    mode?: BackgroundRemovalMode;
  } = {}
): Promise<{
  preparedViews: Record<MultiViewAngle, string | null>;
  actions: string[];
}> {
  const {
    removeBg = true,
    autoContrast = true,
    autoRotateTopBottom = true,
    mode = 'auto',
  } = options;
  const prepared: Record<MultiViewAngle, string | null> = { ...views };
  const actions: string[] = [];

  const verticalAngles: MultiViewAngle[] = ['front', 'back', 'left', 'right', 'three_quarter'];
  let bgRemovedCount = 0;
  let alignedCount = 0;

  await Promise.all(
    verticalAngles.map(async (angle) => {
      const url = views[angle];
      if (!url) return;
      const res = await cleanAndNormalizeSingleView(url, angle, {
        removeBg,
        autoContrast,
        mode,
      });
      prepared[angle] = res.dataUrl;
      alignedCount++;
      if (res.hadOpaqueBg && removeBg) bgRemovedCount++;
    })
  );

  const sideRef = prepared.right || prepared.left;
  const sideAngle: 'left' | 'right' = prepared.right ? 'right' : 'left';
  const horizontalAngles: MultiViewAngle[] = ['top', 'bottom'];
  for (const angle of horizontalAngles) {
    const url = views[angle];
    if (!url) continue;
    let rot: 0 | 90 | 180 | 270 = 0;
    if (autoRotateTopBottom && (prepared.front || sideRef)) {
      rot = await detectOptimalHorizontalRotation(url, prepared.front, sideRef, sideAngle);
      if (rot !== 0) {
        actions.push(
          `Vue "${angle === 'top' ? 'Dessus' : 'Dessous'}" pivotée automatiquement de ${rot}° pour s'aligner sur les épaules`
        );
      }
    }
    const res = await cleanAndNormalizeSingleView(url, angle, {
      removeBg,
      rotateDeg: rot,
      autoContrast,
      mode,
    });
    prepared[angle] = res.dataUrl;
    alignedCount++;
    if (res.hadOpaqueBg && removeBg) bgRemovedCount++;
  }

  if (bgRemovedCount > 0) {
    actions.unshift(`Fond Meshy/Studio retiré automatiquement sur ${bgRemovedCount} vue(s)`);
  }
  if (alignedCount > 0) {
    actions.push(`Échelle et alignement au sol synchronisés sur ${alignedCount} vue(s)`);
  }

  return { preparedViews: prepared, actions };
}
