import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';
import type { Reconstructed3DResult } from './visualHull3D';
import {
  extractAdaptiveForegroundMask,
  computeTightMaskBBox,
  detectOptimalHorizontalRotation,
  rotateImageDataUrl,
  loadImageElement,
} from './viewSegmentation';

export interface TrueMultiViewParams {
  views: Partial<Record<MultiViewAngle, string | null>>;
  characterName?: string;
  /** Grid base resolution along Y (height). X and Z scale proportionally from silhouette aspect ratios. */
  gridY?: number;
  /** Taubin volume-preserving smoothing iterations */
  smoothPasses?: number;
  /** Relief thickness multiplier when side views are absent */
  fallbackDepthScale?: number;
  /** Flatten Z depth slightly for emblem/sword relief mode */
  reliefMode?: boolean;
}

interface PreparedViewWithBox {
  angle: MultiViewAngle;
  sdfSize: number;
  colorSize: number;
  sdf: Float32Array;
  maskColor: Uint8Array;
  colorData: Uint8ClampedArray;
  aspectRatio: number;
  boxNorm: { x0: number; y0: number; w: number; h: number };
}

/**
 * 2-pass Chamfer 2D Signed Distance Field:
 * Negative inside silhouette, Positive outside silhouette, 0 on boundary.
 */
function compute2DSDF(mask: Uint8Array, size: number): Float32Array {
  const INF = 1e6;
  const distOut = new Float32Array(size * size);
  const distIn = new Float32Array(size * size);

  for (let i = 0; i < size * size; i++) {
    if (mask[i]) {
      distOut[i] = 0;
      distIn[i] = INF;
    } else {
      distOut[i] = INF;
      distIn[i] = 0;
    }
  }

  const chamfer = (d: Float32Array) => {
    const SQ2 = 1.41421356;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) v = Math.min(v, d[i - size] + 1);
        if (x > 0 && y > 0) v = Math.min(v, d[i - size - 1] + SQ2);
        if (x < size - 1 && y > 0) v = Math.min(v, d[i - size + 1] + SQ2);
        d[i] = v;
      }
    }
    for (let y = size - 1; y >= 0; y--) {
      for (let x = size - 1; x >= 0; x--) {
        const i = y * size + x;
        let v = d[i];
        if (x < size - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < size - 1) v = Math.min(v, d[i + size] + 1);
        if (x < size - 1 && y < size - 1) v = Math.min(v, d[i + size + 1] + SQ2);
        if (x > 0 && y < size - 1) v = Math.min(v, d[i + size - 1] + SQ2);
        d[i] = v;
      }
    }
  };

  chamfer(distOut);
  chamfer(distIn);

  const sdf = new Float32Array(size * size);
  const normScale = 1 / size;
  for (let i = 0; i < size * size; i++) {
    sdf[i] = mask[i] ? -(Math.max(0.25, distIn[i] - 0.5)) * normScale : (distOut[i] - 0.5) * normScale;
  }
  return sdf;
}

function sampleBilinearSDF(sdf: Float32Array, size: number, nx: number, ny: number): number {
  const fx = THREE.MathUtils.clamp(nx, 0, 1) * (size - 1);
  const fy = THREE.MathUtils.clamp(ny, 0, 1) * (size - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const v00 = sdf[y0 * size + x0];
  const v10 = sdf[y0 * size + x1];
  const v01 = sdf[y1 * size + x0];
  const v11 = sdf[y1 * size + x1];

  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * Smooth Polynomial Maximum so orthogonal Visual Hull intersections carve smooth,
 * rounded organic ellipses/cylinders instead of sharp boxy 90° prism corners.
 */
function smoothMax(a: number, b: number, k = 0.024): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/**
 * Cuts out the background cleanly at HD resolution FIRST, crops tightly to the silhouette,
 * computes a 192px 2D Chamfer SDF, and retains a 640px color buffer for texel-level atlas baking.
 */
async function prepareNormalizedViewWithBox(
  angle: MultiViewAngle,
  srcUrl: string,
  sdfSize = 192,
  colorSize = 640
): Promise<PreparedViewWithBox | null> {
  try {
    const img = await loadImageElement(srcUrl);

    const workCanvas = document.createElement('canvas');
    workCanvas.width = colorSize;
    workCanvas.height = colorSize;
    const wCtx = workCanvas.getContext('2d');
    if (!wCtx) return null;

    const natW = img.naturalWidth || colorSize;
    const natH = img.naturalHeight || colorSize;
    const fit = Math.min(colorSize / natW, colorSize / natH);

    const rawFitW = Math.max(64, Math.round(natW * fit));
    const rawFitH = Math.max(64, Math.round(natH * fit));
    const segCanvas = document.createElement('canvas');
    segCanvas.width = rawFitW;
    segCanvas.height = rawFitH;
    const segCtx = segCanvas.getContext('2d');
    if (!segCtx) return null;
    segCtx.drawImage(img, 0, 0, rawFitW, rawFitH);

    const segImgData = segCtx.getImageData(0, 0, rawFitW, rawFitH);
    let { mask: rawMask } = extractAdaptiveForegroundMask(segImgData.data, rawFitW, rawFitH, {
      targetAngle: angle,
      mode: 'auto',
    });

    const segTotal = rawFitW * rawFitH;
    let rawFg = 0;
    for (let i = 0; i < segTotal; i++) {
      if (rawMask[i]) rawFg++;
    }

    if (rawFg / segTotal > 0.72) {
      const strongRes = extractAdaptiveForegroundMask(segImgData.data, rawFitW, rawFitH, {
        targetAngle: angle,
        mode: 'strong',
      });
      let sFg = 0;
      for (let i = 0; i < segTotal; i++) {
        if (strongRes.mask[i]) sFg++;
      }
      if (sFg / segTotal >= 0.05 && sFg / segTotal < rawFg / segTotal - 0.07) {
        rawMask = strongRes.mask;
        rawFg = sFg;
      }
    }

    for (let i = 0; i < segTotal; i++) {
      if (!rawMask[i]) {
        segImgData.data[i * 4 + 3] = 0;
      }
    }
    segCtx.putImageData(segImgData, 0, 0);

    const fgRatio = rawFg / segTotal;
    if (fgRatio > 0.90) {
      throw new Error(
        `Le fond de la vue "${angle}" n'a pas pu être séparé du personnage (${Math.round(
          fgRatio * 100
        )}% opaque). Activez le "Mode Studio Fort (Meshy)" ou cliquez sur "Correction Erreurs".`
      );
    }

    const bbox = computeTightMaskBBox(rawMask, rawFitW, rawFitH);
    const srcW = Math.max(4, bbox.maxX - bbox.minX + 1);
    const srcH = Math.max(4, bbox.maxY - bbox.minY + 1);
    const aspectRatio = THREE.MathUtils.clamp(srcW / srcH, 0.22, 1.95);

    wCtx.clearRect(0, 0, colorSize, colorSize);
    const targetBox = colorSize * 0.90;
    const scale = Math.min(targetBox / srcW, targetBox / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (colorSize - drawW) / 2;
    const dy = (colorSize - drawH) / 2;

    wCtx.drawImage(segCanvas, bbox.minX, bbox.minY, srcW, srcH, dx, dy, drawW, drawH);
    const colorImgData = wCtx.getImageData(0, 0, colorSize, colorSize);
    const maskColor = new Uint8Array(colorSize * colorSize);
    for (let i = 0; i < colorSize * colorSize; i++) {
      maskColor[i] = colorImgData.data[i * 4 + 3] > 40 ? 1 : 0;
    }

    const sdfCanvas = document.createElement('canvas');
    sdfCanvas.width = sdfSize;
    sdfCanvas.height = sdfSize;
    const sdfCtx = sdfCanvas.getContext('2d');
    if (!sdfCtx) return null;
    sdfCtx.drawImage(workCanvas, 0, 0, sdfSize, sdfSize);
    const sdfData = sdfCtx.getImageData(0, 0, sdfSize, sdfSize).data;
    const sdfMask = new Uint8Array(sdfSize * sdfSize);
    for (let i = 0; i < sdfSize * sdfSize; i++) {
      sdfMask[i] = sdfData[i * 4 + 3] > 45 ? 1 : 0;
    }
    const sdf = compute2DSDF(sdfMask, sdfSize);

    return {
      angle,
      sdfSize,
      colorSize,
      sdf,
      maskColor,
      colorData: colorImgData.data,
      aspectRatio,
      boxNorm: {
        x0: dx / colorSize,
        y0: dy / colorSize,
        w: drawW / colorSize,
        h: drawH / colorSize,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('opaque')) {
      throw err;
    }
    return null;
  }
}

/**
 * Accumulates foreground-masked bilinear RGB sample from a view directly into caller accumulators
 * (zero per-texel heap allocations so baking >1M atlas texels stays under ~100ms).
 */
function accumulateViewColorBilinear(
  view: PreparedViewWithBox,
  uBox: number,
  vBox: number,
  weight: number,
  acc: Float64Array
): void {
  const cx = THREE.MathUtils.clamp(view.boxNorm.x0 + uBox * view.boxNorm.w, 0, 1);
  const cy = THREE.MathUtils.clamp(view.boxNorm.y0 + vBox * view.boxNorm.h, 0, 1);
  const S = view.colorSize;
  const fx = cx * (S - 1);
  const fy = cy * (S - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1 < S ? x0 + 1 : x0;
  const y1 = y0 + 1 < S ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;

  const mask = view.maskColor;
  const data = view.colorData;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let wSum = 0;

  const i00 = y0 * S + x0;
  if (mask[i00]) {
    const w00 = (1 - tx) * (1 - ty);
    const k = i00 * 4;
    rSum += data[k] * w00;
    gSum += data[k + 1] * w00;
    bSum += data[k + 2] * w00;
    wSum += w00;
  }
  const i10 = y0 * S + x1;
  if (mask[i10]) {
    const w10 = tx * (1 - ty);
    const k = i10 * 4;
    rSum += data[k] * w10;
    gSum += data[k + 1] * w10;
    bSum += data[k + 2] * w10;
    wSum += w10;
  }
  const i01 = y1 * S + x0;
  if (mask[i01]) {
    const w01 = (1 - tx) * ty;
    const k = i01 * 4;
    rSum += data[k] * w01;
    gSum += data[k + 1] * w01;
    bSum += data[k + 2] * w01;
    wSum += w01;
  }
  const i11 = y1 * S + x1;
  if (mask[i11]) {
    const w11 = tx * ty;
    const k = i11 * 4;
    rSum += data[k] * w11;
    gSum += data[k + 1] * w11;
    bSum += data[k + 2] * w11;
    wSum += w11;
  }

  if (wSum > 0.001) {
    acc[0] += (rSum / wSum) * weight;
    acc[1] += (gSum / wSum) * weight;
    acc[2] += (bSum / wSum) * weight;
    acc[3] += weight;
    return;
  }

  // Fallback nearest foreground search up to 5px along silhouette rim
  const px = Math.round(fx);
  const py = Math.round(fy);
  for (let rad = 1; rad <= 5; rad++) {
    let fr = 0;
    let fg = 0;
    let fb = 0;
    let cnt = 0;
    for (let dy = -rad; dy <= rad; dy++) {
      const yy = py + dy;
      if (yy < 0 || yy >= S) continue;
      for (let dx = -rad; dx <= rad; dx++) {
        const xx = px + dx;
        if (xx < 0 || xx >= S) continue;
        const idx = yy * S + xx;
        if (mask[idx]) {
          const k = idx * 4;
          fr += data[k];
          fg += data[k + 1];
          fb += data[k + 2];
          cnt++;
        }
      }
    }
    if (cnt > 0) {
      acc[0] += (fr / cnt) * weight;
      acc[1] += (fg / cnt) * weight;
      acc[2] += (fb / cnt) * weight;
      acc[3] += weight;
      return;
    }
  }
}

/**
 * Checks whether a 3/4 view aligns well with (+45 deg) or (-45 deg) of the Front x Side footprint
 * so it only sculpts diagonal corners when pose/orientation genuinely agree.
 */
function detectThreeQuarterSign(
  tqV: PreparedViewWithBox,
  frontV: PreparedViewWithBox | null,
  sideV: PreparedViewWithBox | null,
  worldW: number,
  worldD: number
): 1 | -1 | 0 {
  if (!frontV) return 0;
  const span45 = Math.max(0.01, (worldW + worldD) * 0.7071);
  let scorePos = 0;
  let scoreNeg = 0;
  let samples = 0;

  for (let gy = 0.1; gy <= 0.9; gy += 0.08) {
    for (let gz = 0.1; gz <= 0.9; gz += 0.1) {
      for (let gx = 0.1; gx <= 0.9; gx += 0.1) {
        const insideFront = sampleBilinearSDF(
          frontV.sdf,
          frontV.sdfSize,
          frontV.boxNorm.x0 + gx * frontV.boxNorm.w,
          frontV.boxNorm.y0 + gy * frontV.boxNorm.h
        ) < 0;
        const insideSide = sideV
          ? sampleBilinearSDF(
              sideV.sdf,
              sideV.sdfSize,
              sideV.boxNorm.x0 + (1 - gz) * sideV.boxNorm.w,
              sideV.boxNorm.y0 + gy * sideV.boxNorm.h
            ) < 0
          : Math.abs(gz - 0.5) < 0.36;
        if (!insideFront || !insideSide) continue;
        samples++;

        const uPos = THREE.MathUtils.clamp(
          0.5 + ((gx - 0.5) * worldW - (gz - 0.5) * worldD) * 0.7071 / span45,
          0,
          1
        );
        const uNeg = THREE.MathUtils.clamp(
          0.5 + ((gx - 0.5) * worldW + (gz - 0.5) * worldD) * 0.7071 / span45,
          0,
          1
        );
        if (
          sampleBilinearSDF(
            tqV.sdf,
            tqV.sdfSize,
            tqV.boxNorm.x0 + uPos * tqV.boxNorm.w,
            tqV.boxNorm.y0 + gy * tqV.boxNorm.h
          ) < 0.02
        ) {
          scorePos++;
        }
        if (
          sampleBilinearSDF(
            tqV.sdf,
            tqV.sdfSize,
            tqV.boxNorm.x0 + uNeg * tqV.boxNorm.w,
            tqV.boxNorm.y0 + gy * tqV.boxNorm.h
          ) < 0.02
        ) {
          scoreNeg++;
        }
      }
    }
  }

  if (samples < 10) return 0;
  const ratioPos = scorePos / samples;
  const ratioNeg = scoreNeg / samples;
  if (Math.max(ratioPos, ratioNeg) < 0.58) return 0;
  return ratioPos >= ratioNeg ? 1 : -1;
}

/**
 * Reconstructs a sharp, HD-textured, watertight 3D Character or Object mesh
 * from 1 to 7 fixed orthographic views using:
 *  - High-Res 192px 2D Chamfer SDF + Smooth Polynomial Intersection (eliminates boxy visual-hull corners)
 *  - Surface Nets zero-crossing mesh extraction + crisp 2-pass Taubin smoothing
 *  - Packed Clamped-Cell Multi-View Baked Texture Atlas (50x+ higher color resolution than vertex colors)
 */
export async function reconstructTrueCharacterFromViews(
  params: TrueMultiViewParams
): Promise<Reconstructed3DResult> {
  const {
    views,
    characterName = 'Personnage_3D_Sculpte',
    gridY = 122,
    smoothPasses = 2,
    fallbackDepthScale = 0.68,
    reliefMode = false,
  } = params;

  const sideUrl = views.right || views.left || null;
  const sideAngle: 'left' | 'right' = views.right ? 'right' : 'left';
  let resolvedTopUrl = views.top || null;
  let resolvedBottomUrl = views.bottom || null;

  if (resolvedTopUrl && (views.front || sideUrl)) {
    const topRot = await detectOptimalHorizontalRotation(resolvedTopUrl, views.front, sideUrl, sideAngle);
    if (topRot !== 0) {
      resolvedTopUrl = await rotateImageDataUrl(resolvedTopUrl, topRot);
    }
  }
  if (resolvedBottomUrl && (views.front || sideUrl)) {
    const bottomRot = await detectOptimalHorizontalRotation(resolvedBottomUrl, views.front, sideUrl, sideAngle);
    if (bottomRot !== 0) {
      resolvedBottomUrl = await rotateImageDataUrl(resolvedBottomUrl, bottomRot);
    }
  }

  const [frontV, backV, leftV, rightV, topV, bottomV, tqV] = await Promise.all([
    views.front ? prepareNormalizedViewWithBox('front', views.front) : null,
    views.back ? prepareNormalizedViewWithBox('back', views.back) : null,
    views.left ? prepareNormalizedViewWithBox('left', views.left) : null,
    views.right ? prepareNormalizedViewWithBox('right', views.right) : null,
    resolvedTopUrl ? prepareNormalizedViewWithBox('top', resolvedTopUrl) : null,
    resolvedBottomUrl ? prepareNormalizedViewWithBox('bottom', resolvedBottomUrl) : null,
    views.three_quarter ? prepareNormalizedViewWithBox('three_quarter', views.three_quarter) : null,
  ]);

  const primaryFront = frontV || tqV || backV;
  if (!primaryFront && !leftV && !rightV && !topV) {
    throw new Error('Au moins une vue de face ou de profil est nécessaire pour sculpter le personnage 3D.');
  }

  const frontAspect = primaryFront ? primaryFront.aspectRatio : 0.62;
  const sideRef = rightV || leftV;
  const sideAspect = sideRef
    ? sideRef.aspectRatio
    : reliefMode
    ? 0.16
    : THREE.MathUtils.clamp(frontAspect * fallbackDepthScale, 0.24, 0.62);

  const worldH = 1.72;
  const worldW = worldH * frontAspect;
  const worldD = worldH * sideAspect;

  const tqSign = tqV && frontV ? detectThreeQuarterSign(tqV, primaryFront, sideRef, worldW, worldD) : 0;
  const span45 = Math.max(0.01, (worldW + worldD) * 0.7071);

  // High-resolution anisotropic voxel grid (clamped to keep baked atlas crisp & fast)
  const Ny = Math.max(64, Math.min(132, gridY));
  const Nx = Math.max(40, Math.min(104, Math.round(Ny * frontAspect * 1.12)));
  const Nz = Math.max(36, Math.min(92, Math.round(Ny * sideAspect * 1.12)));

  const padFrac = 0.08;
  const sdfGrid = new Float32Array(Nx * Ny * Nz);

  const evalViewSDF = (v: PreparedViewWithBox | null, uBox: number, vBox: number): number => {
    if (!v) return -1.0;
    const cx = v.boxNorm.x0 + uBox * v.boxNorm.w;
    const cy = v.boxNorm.y0 + vBox * v.boxNorm.h;
    return sampleBilinearSDF(v.sdf, v.sdfSize, cx, cy);
  };

  const hasSide = Boolean(leftV || rightV);
  const hasTop = Boolean(topV || bottomV);

  for (let iz = 0; iz < Nz; iz++) {
    const gz = iz / (Nz - 1);
    const zBox = (gz - padFrac) / (1 - 2 * padFrac);

    for (let iy = 0; iy < Ny; iy++) {
      const gy = iy / (Ny - 1);
      const yBoxTopDown = 1 - (gy - padFrac) / (1 - 2 * padFrac);

      for (let ix = 0; ix < Nx; ix++) {
        const gx = ix / (Nx - 1);
        const xBox = (gx - padFrac) / (1 - 2 * padFrac);

        if (xBox < -0.02 || xBox > 1.02 || yBoxTopDown < -0.02 || yBoxTopDown > 1.02 || zBox < -0.02 || zBox > 1.02) {
          sdfGrid[(iz * Ny + iy) * Nx + ix] = 0.08;
          continue;
        }

        // Front / Back XY silhouette
        let sXY = -1.0;
        if (primaryFront) {
          sXY = smoothMax(sXY, evalViewSDF(primaryFront, xBox, yBoxTopDown), 0.012);
        }
        if (backV) {
          sXY = smoothMax(sXY, evalViewSDF(backV, 1 - xBox, yBoxTopDown), 0.012);
        }

        // Left / Right ZY silhouette
        let sZY = -1.0;
        if (rightV) {
          sZY = smoothMax(sZY, evalViewSDF(rightV, 1 - zBox, yBoxTopDown), 0.012);
        }
        if (leftV) {
          sZY = smoothMax(sZY, evalViewSDF(leftV, zBox, yBoxTopDown), 0.012);
        }

        // Smooth elliptical intersection between XY and ZY eliminates square boxy corners
        let s = hasSide ? smoothMax(sXY, sZY, reliefMode ? 0.014 : 0.028) : sXY;

        // Top / Bottom horizontal footprint carving
        if (topV) {
          s = smoothMax(s, evalViewSDF(topV, xBox, zBox), 0.020);
        }
        if (bottomV) {
          s = smoothMax(s, evalViewSDF(bottomV, xBox, 1 - zBox), 0.020);
        }

        // 3/4 diagonal corner sculpting when pose aligns cleanly
        if (tqV && tqSign !== 0) {
          const u45 = THREE.MathUtils.clamp(
            0.5 + ((xBox - 0.5) * worldW - tqSign * (zBox - 0.5) * worldD) * 0.7071 / span45,
            0,
            1
          );
          s = smoothMax(s, evalViewSDF(tqV, u45, yBoxTopDown) - 0.014, 0.020);
        }

        // Smooth rounded anatomical depth profile when side views are absent
        if (!hasSide && !hasTop) {
          const frontDepth = primaryFront ? Math.max(0, -evalViewSDF(primaryFront, xBox, yBoxTopDown)) : 0.05;
          const halfThick = reliefMode
            ? 0.24 + 0.26 * Math.min(1, Math.sqrt(frontDepth / 0.12))
            : 0.15 + 0.35 * Math.min(1, Math.sqrt(frontDepth / 0.10));
          const zSdf = (Math.abs(zBox - 0.5) - halfThick) * 0.45;
          s = smoothMax(s, zSdf, 0.022);
        }

        sdfGrid[(iz * Ny + iy) * Nx + ix] = s;
      }
    }
  }

  // --- SURFACE NETS EXTRACTION ---
  const cellVertIndex = new Int32Array((Nx - 1) * (Ny - 1) * (Nz - 1)).fill(-1);
  const positions: number[] = [];

  const getSdf = (x: number, y: number, z: number) => sdfGrid[(z * Ny + y) * Nx + x];
  const cellId = (x: number, y: number, z: number) => (z * (Ny - 1) + y) * (Nx - 1) + x;

  const scaleX = worldW / (1 - 2 * padFrac);
  const scaleY = worldH / (1 - 2 * padFrac);
  const scaleZ = worldD / (1 - 2 * padFrac);

  const gridToWorldX = (gx: number) => (gx / (Nx - 1) - 0.5) * scaleX;
  const gridToWorldY = (gy: number) => (gy / (Ny - 1) - padFrac) * scaleY;
  const gridToWorldZ = (gz: number) => (gz / (Nz - 1) - 0.5) * scaleZ;

  const edgeCorners: Array<[number, number, number, number, number, number]> = [
    [0, 0, 0, 1, 0, 0],
    [0, 1, 0, 1, 1, 0],
    [0, 0, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0],
    [1, 0, 0, 1, 1, 0],
    [0, 0, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 1],
    [0, 1, 0, 0, 1, 1],
    [1, 1, 0, 1, 1, 1],
  ];

  for (let z = 0; z < Nz - 1; z++) {
    for (let y = 0; y < Ny - 1; y++) {
      for (let x = 0; x < Nx - 1; x++) {
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        let crossCount = 0;

        for (let e = 0; e < 12; e++) {
          const [dx0, dy0, dz0, dx1, dy1, dz1] = edgeCorners[e];
          const s0 = getSdf(x + dx0, y + dy0, z + dz0);
          const s1 = getSdf(x + dx1, y + dy1, z + dz1);
          if ((s0 < 0 && s1 >= 0) || (s0 >= 0 && s1 < 0)) {
            const denom = s0 - s1;
            const t = Math.abs(denom) > 1e-6 ? THREE.MathUtils.clamp(s0 / denom, 0.05, 0.95) : 0.5;
            sumX += x + dx0 + t * (dx1 - dx0);
            sumY += y + dy0 + t * (dy1 - dy0);
            sumZ += z + dz0 + t * (dz1 - dz0);
            crossCount++;
          }
        }

        if (crossCount > 0) {
          const vIdx = positions.length / 3;
          cellVertIndex[cellId(x, y, z)] = vIdx;
          positions.push(
            gridToWorldX(sumX / crossCount),
            gridToWorldY(sumY / crossCount),
            gridToWorldZ(sumZ / crossCount)
          );
        }
      }
    }
  }

  const indices: number[] = [];

  const pushQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const dxAC = positions[a * 3] - positions[c * 3];
    const dyAC = positions[a * 3 + 1] - positions[c * 3 + 1];
    const dzAC = positions[a * 3 + 2] - positions[c * 3 + 2];
    const distAC = dxAC * dxAC + dyAC * dyAC + dzAC * dzAC;

    const dxBD = positions[b * 3] - positions[d * 3];
    const dyBD = positions[b * 3 + 1] - positions[d * 3 + 1];
    const dzBD = positions[b * 3 + 2] - positions[d * 3 + 2];
    const distBD = dxBD * dxBD + dyBD * dyBD + dzBD * dzBD;

    if (!flip) {
      if (distAC <= distBD) {
        indices.push(a, b, c, a, c, d);
      } else {
        indices.push(a, b, d, b, c, d);
      }
    } else {
      if (distAC <= distBD) {
        indices.push(a, c, b, a, d, c);
      } else {
        indices.push(a, d, b, b, d, c);
      }
    }
  };

  for (let z = 1; z < Nz - 1; z++) {
    for (let y = 1; y < Ny - 1; y++) {
      for (let x = 1; x < Nx - 1; x++) {
        const s0 = getSdf(x, y, z);

        if (x < Nx - 2) {
          const sx = getSdf(x + 1, y, z);
          if ((s0 < 0 && sx >= 0) || (s0 >= 0 && sx < 0)) {
            pushQuad(
              cellVertIndex[cellId(x, y - 1, z - 1)],
              cellVertIndex[cellId(x, y, z - 1)],
              cellVertIndex[cellId(x, y, z)],
              cellVertIndex[cellId(x, y - 1, z)],
              s0 >= 0
            );
          }
        }

        if (y < Ny - 2) {
          const sy = getSdf(x, y + 1, z);
          if ((s0 < 0 && sy >= 0) || (s0 >= 0 && sy < 0)) {
            pushQuad(
              cellVertIndex[cellId(x - 1, y, z - 1)],
              cellVertIndex[cellId(x - 1, y, z)],
              cellVertIndex[cellId(x, y, z)],
              cellVertIndex[cellId(x, y, z - 1)],
              s0 >= 0
            );
          }
        }

        if (z < Nz - 2) {
          const sz = getSdf(x, y, z + 1);
          if ((s0 < 0 && sz >= 0) || (s0 >= 0 && sz < 0)) {
            pushQuad(
              cellVertIndex[cellId(x - 1, y - 1, z)],
              cellVertIndex[cellId(x, y - 1, z)],
              cellVertIndex[cellId(x, y, z)],
              cellVertIndex[cellId(x - 1, y, z)],
              s0 >= 0
            );
          }
        }
      }
    }
  }

  const vertCount = positions.length / 3;
  if (vertCount === 0 || indices.length === 0) {
    throw new Error(
      "L'intersection des vues fixes n'a produit aucun volume commun. Vérifiez l'alignement ou lancez la Correction d'Erreurs."
    );
  }

  // Adjacency & disconnected noise island removal
  const adj: Set<number>[] = Array.from({ length: vertCount }, () => new Set<number>());
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    adj[a].add(b);
    adj[a].add(c);
    adj[b].add(a);
    adj[b].add(c);
    adj[c].add(a);
    adj[c].add(b);
  }

  const visitedVert = new Uint8Array(vertCount);
  const compIds: number[][] = [];
  const bfsQueue = new Int32Array(vertCount);
  for (let v = 0; v < vertCount; v++) {
    if (visitedVert[v] || adj[v].size === 0) continue;
    let h = 0;
    let t = 0;
    const comp: number[] = [];
    visitedVert[v] = 1;
    bfsQueue[t++] = v;
    while (h < t) {
      const cur = bfsQueue[h++];
      comp.push(cur);
      adj[cur].forEach((nb) => {
        if (!visitedVert[nb]) {
          visitedVert[nb] = 1;
          bfsQueue[t++] = nb;
        }
      });
    }
    compIds.push(comp);
  }

  let finalIndices = indices;
  if (compIds.length > 1) {
    compIds.sort((a, b) => b.length - a.length);
    const threshold = Math.max(18, compIds[0].length * 0.04);
    const keepVert = new Uint8Array(vertCount);
    for (const comp of compIds) {
      if (comp.length >= threshold) {
        for (const v of comp) keepVert[v] = 1;
      }
    }
    finalIndices = [];
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      if (keepVert[a] && keepVert[b] && keepVert[c]) {
        finalIndices.push(a, b, c);
      }
    }
  }

  // Crisp Taubin smoothing (preserves sharp hair/belt/hand silhouettes without melting into blobs)
  const posArr = new Float32Array(positions);
  const tmpArr = new Float32Array(posArr.length);
  const taubinStep = (lambda: number) => {
    for (let v = 0; v < vertCount; v++) {
      const nb = adj[v];
      if (nb.size === 0) {
        tmpArr[v * 3] = posArr[v * 3];
        tmpArr[v * 3 + 1] = posArr[v * 3 + 1];
        tmpArr[v * 3 + 2] = posArr[v * 3 + 2];
        continue;
      }
      let ax = 0;
      let ay = 0;
      let az = 0;
      nb.forEach((n) => {
        ax += posArr[n * 3];
        ay += posArr[n * 3 + 1];
        az += posArr[n * 3 + 2];
      });
      ax /= nb.size;
      ay /= nb.size;
      az /= nb.size;
      tmpArr[v * 3] = posArr[v * 3] + lambda * (ax - posArr[v * 3]);
      tmpArr[v * 3 + 1] = posArr[v * 3 + 1] + lambda * (ay - posArr[v * 3 + 1]);
      tmpArr[v * 3 + 2] = posArr[v * 3 + 2] + lambda * (az - posArr[v * 3 + 2]);
    }
    posArr.set(tmpArr);
  };

  const crispPasses = Math.max(1, Math.min(2, smoothPasses));
  for (let p = 0; p < crispPasses; p++) {
    taubinStep(0.36);
    taubinStep(-0.375);
  }

  // Compute smooth outward normals on the indexed mesh before unrolling into UV-packed triangles
  const indexedGeo = new THREE.BufferGeometry();
  indexedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  indexedGeo.setIndex(finalIndices);
  indexedGeo.computeVertexNormals();
  indexedGeo.computeBoundingBox();

  const bbox = indexedGeo.boundingBox!;
  const minX = bbox.min.x;
  const maxX = bbox.max.x;
  const minY = bbox.min.y;
  const maxY = bbox.max.y;
  const minZ = bbox.min.z;
  const maxZ = bbox.max.z;
  const spanX = Math.max(0.01, maxX - minX);
  const spanY = Math.max(0.01, maxY - minY);
  const spanZ = Math.max(0.01, maxZ - minZ);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const normAttr = indexedGeo.getAttribute('normal');
  const triCount = Math.floor(finalIndices.length / 3);

  // --- HD CLAMPED-CELL MULTI-VIEW TEXTURE ATLAS BAKING ---
  // Gives every triangle its own seamless texel patch (50x+ sharper than vertex colors!)
  let atlasSize = triCount > 32000 ? 2048 : triCount > 14000 ? 1536 : 1024;
  let cols = Math.max(1, Math.ceil(Math.sqrt(triCount)));
  let cellPx = Math.floor(atlasSize / cols);
  if (cellPx < 6 && atlasSize < 2048) {
    atlasSize = 2048;
    cellPx = Math.floor(atlasSize / cols);
  }
  cellPx = Math.max(3, cellPx);
  if (cols * cellPx > atlasSize) {
    cols = Math.max(1, Math.floor(atlasSize / cellPx));
  }
  const uvSpan = Math.max(1.5, cellPx - 2.5);

  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const aCtx = atlasCanvas.getContext('2d');
  const atlasImgData = aCtx
    ? aCtx.createImageData(atlasSize, atlasSize)
    : new ImageData(atlasSize, atlasSize);
  const atlasPx = atlasImgData.data;

  // Build non-indexed GPU buffers anchored at ground Y = 0 and centered at X/Z = 0
  const finalPositions = new Float32Array(triCount * 9);
  const finalNormals = new Float32Array(triCount * 9);
  const finalUVs = new Float32Array(triCount * 6);

  const effBack = backV || primaryFront;
  const effRight = rightV || leftV || primaryFront;
  const effLeft = leftV || rightV || primaryFront;
  const acc = new Float64Array(4);

  const invSpanX = 1 / spanX;
  const invSpanY = 1 / spanY;
  const invSpanZ = 1 / spanZ;
  const invAtlas = 1 / atlasSize;

  for (let t = 0; t < triCount; t++) {
    const i0 = finalIndices[t * 3];
    const i1 = finalIndices[t * 3 + 1];
    const i2 = finalIndices[t * 3 + 2];

    const x0 = posArr[i0 * 3];
    const y0 = posArr[i0 * 3 + 1];
    const z0 = posArr[i0 * 3 + 2];
    const x1 = posArr[i1 * 3];
    const y1 = posArr[i1 * 3 + 1];
    const z1 = posArr[i1 * 3 + 2];
    const x2 = posArr[i2 * 3];
    const y2 = posArr[i2 * 3 + 1];
    const z2 = posArr[i2 * 3 + 2];

    const nx0 = normAttr.getX(i0);
    const ny0 = normAttr.getY(i0);
    const nz0 = normAttr.getZ(i0);
    const nx1 = normAttr.getX(i1);
    const ny1 = normAttr.getY(i1);
    const nz1 = normAttr.getZ(i1);
    const nx2 = normAttr.getX(i2);
    const ny2 = normAttr.getY(i2);
    const nz2 = normAttr.getZ(i2);

    const pBase = t * 9;
    finalPositions[pBase] = x0 - centerX;
    finalPositions[pBase + 1] = y0 - minY;
    finalPositions[pBase + 2] = z0 - centerZ;
    finalPositions[pBase + 3] = x1 - centerX;
    finalPositions[pBase + 4] = y1 - minY;
    finalPositions[pBase + 5] = z1 - centerZ;
    finalPositions[pBase + 6] = x2 - centerX;
    finalPositions[pBase + 7] = y2 - minY;
    finalPositions[pBase + 8] = z2 - centerZ;

    finalNormals[pBase] = nx0;
    finalNormals[pBase + 1] = ny0;
    finalNormals[pBase + 2] = nz0;
    finalNormals[pBase + 3] = nx1;
    finalNormals[pBase + 4] = ny1;
    finalNormals[pBase + 5] = nz1;
    finalNormals[pBase + 6] = nx2;
    finalNormals[pBase + 7] = ny2;
    finalNormals[pBase + 8] = nz2;

    const cellCol = t % cols;
    const cellRow = Math.floor(t / cols);
    const ox = cellCol * cellPx;
    const oy = cellRow * cellPx;

    // Triangle vertices mapped with 1px inner gutter so bilinear filtering stays strictly inside clamped cell
    const uBase = t * 6;
    finalUVs[uBase] = (ox + 1.0 + 0.5) * invAtlas;
    finalUVs[uBase + 1] = 1.0 - (oy + 1.0 + 0.5) * invAtlas;
    finalUVs[uBase + 2] = (ox + 1.0 + uvSpan + 0.5) * invAtlas;
    finalUVs[uBase + 3] = 1.0 - (oy + 1.0 + 0.5) * invAtlas;
    finalUVs[uBase + 4] = (ox + 1.0 + 0.5) * invAtlas;
    finalUVs[uBase + 5] = 1.0 - (oy + 1.0 + uvSpan + 0.5) * invAtlas;

    // Rasterize texels inside this cell using clamped barycentric coordinates
    if (oy + cellPx <= atlasSize && ox + cellPx <= atlasSize) {
      for (let ly = 0; ly < cellPx; ly++) {
        const b2Raw = (ly - 1.0) / uvSpan;
        const rowOffset = (oy + ly) * atlasSize;
        for (let lx = 0; lx < cellPx; lx++) {
          const b1Raw = (lx - 1.0) / uvSpan;
          const b0Raw = 1.0 - b1Raw - b2Raw;

          let w0 = b0Raw > 0 ? b0Raw : 0;
          let w1 = b1Raw > 0 ? b1Raw : 0;
          let w2 = b2Raw > 0 ? b2Raw : 0;
          const wSum = w0 + w1 + w2;
          if (wSum > 0) {
            const invW = 1 / wSum;
            w0 *= invW;
            w1 *= invW;
            w2 *= invW;
          } else {
            w0 = 1;
            w1 = 0;
            w2 = 0;
          }

          const px = w0 * x0 + w1 * x1 + w2 * x2;
          const py = w0 * y0 + w1 * y1 + w2 * y2;
          const pz = w0 * z0 + w1 * z1 + w2 * z2;

          let nx = w0 * nx0 + w1 * nx1 + w2 * nx2;
          let ny = w0 * ny0 + w1 * ny1 + w2 * ny2;
          let nz = w0 * nz0 + w1 * nz1 + w2 * nz2;
          const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= nLen;
          ny /= nLen;
          nz /= nLen;

          const uX = THREE.MathUtils.clamp((px - minX) * invSpanX, 0, 1);
          const vY = THREE.MathUtils.clamp(1 - (py - minY) * invSpanY, 0, 1);
          const uZ = THREE.MathUtils.clamp((pz - minZ) * invSpanZ, 0, 1);

          acc[0] = 0;
          acc[1] = 0;
          acc[2] = 0;
          acc[3] = 0;

          if (primaryFront && nz > 0.14) {
            const wF = Math.pow(nz, 3.0) * (frontV ? 1.25 : 0.9);
            if (wF > 0.015) accumulateViewColorBilinear(primaryFront, uX, vY, wF, acc);
          }
          if (effBack && nz < -0.14) {
            const wB = Math.pow(-nz, 3.0) * (backV ? 1.25 : 0.72);
            if (wB > 0.015) accumulateViewColorBilinear(effBack, backV ? 1 - uX : uX, vY, wB, acc);
          }
          if (effRight && nx > 0.14) {
            const wR = Math.pow(nx, 3.0) * (rightV ? 1.15 : leftV ? 0.85 : 0.42);
            if (wR > 0.015) {
              accumulateViewColorBilinear(
                effRight,
                rightV ? 1 - uZ : leftV ? uZ : 0.5 + (0.5 - uZ) * 0.4,
                vY,
                wR,
                acc
              );
            }
          }
          if (effLeft && nx < -0.14) {
            const wL = Math.pow(-nx, 3.0) * (leftV ? 1.15 : rightV ? 0.85 : 0.42);
            if (wL > 0.015) {
              accumulateViewColorBilinear(
                effLeft,
                leftV ? uZ : rightV ? 1 - uZ : 0.5 + (uZ - 0.5) * 0.4,
                vY,
                wL,
                acc
              );
            }
          }
          if (ny > 0.2) {
            const wT = Math.pow(ny, 2.8);
            if (topV) {
              accumulateViewColorBilinear(topV, uX, uZ, wT * 1.15, acc);
            } else if (primaryFront) {
              accumulateViewColorBilinear(primaryFront, uX, Math.min(0.2, vY), wT * 0.5, acc);
            }
          }
          if (bottomV && ny < -0.2) {
            const wBt = Math.pow(-ny, 2.8) * 1.15;
            accumulateViewColorBilinear(bottomV, uX, 1 - uZ, wBt, acc);
          }
          if (tqV && tqSign !== 0) {
            const tqDot = tqSign * nx * 0.65 + nz * 0.76;
            if (tqDot > 0.25) {
              const u45 = THREE.MathUtils.clamp(
                0.5 + ((uX - 0.5) * worldW - tqSign * (uZ - 0.5) * worldD) * 0.7071 / span45,
                0,
                1
              );
              accumulateViewColorBilinear(tqV, u45, vY, Math.pow(tqDot, 3.0) * 0.85, acc);
            }
          }

          if (acc[3] <= 0.001 && primaryFront) {
            accumulateViewColorBilinear(primaryFront, uX, vY, 1.0, acc);
          }

          const outIdx = (rowOffset + ox + lx) * 4;
          if (acc[3] > 0.001) {
            const invAcc = 1 / acc[3];
            atlasPx[outIdx] = Math.min(255, Math.max(0, Math.round(acc[0] * invAcc)));
            atlasPx[outIdx + 1] = Math.min(255, Math.max(0, Math.round(acc[1] * invAcc)));
            atlasPx[outIdx + 2] = Math.min(255, Math.max(0, Math.round(acc[2] * invAcc)));
          } else {
            atlasPx[outIdx] = 185;
            atlasPx[outIdx + 1] = 195;
            atlasPx[outIdx + 2] = 210;
          }
          atlasPx[outIdx + 3] = 255;
        }
      }
    }
  }

  indexedGeo.dispose();

  if (aCtx) {
    aCtx.putImageData(atlasImgData, 0, 0);
  }
  const atlasDataUrl = atlasCanvas.toDataURL('image/png');
  const bakedTexture = new THREE.CanvasTexture(atlasCanvas);
  bakedTexture.colorSpace = THREE.SRGBColorSpace;
  bakedTexture.minFilter = THREE.LinearFilter;
  bakedTexture.magFilter = THREE.LinearFilter;
  bakedTexture.generateMipmaps = false;
  bakedTexture.needsUpdate = true;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(finalUVs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    map: bakedTexture,
    roughness: 0.56,
    metalness: 0.05,
  });

  const rootGroup = new THREE.Group();
  rootGroup.name = characterName;

  const characterMesh = new THREE.Mesh(geometry, material);
  characterMesh.name = `${characterName}_SculptHD`;
  characterMesh.userData.originalMaterial = material;
  characterMesh.castShadow = true;
  characterMesh.receiveShadow = true;
  rootGroup.add(characterMesh);

  const exportObj = (name = characterName) => {
    let out = `# Wavefront 3D Object\n# HD Multi-View Surface Nets Character\no ${name}\n\n`;
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');

    for (let i = 0; i < pos.count; i++) {
      out += `v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}\n`;
    }
    if (norm) {
      for (let i = 0; i < norm.count; i++) {
        out += `vn ${norm.getX(i).toFixed(4)} ${norm.getY(i).toFixed(4)} ${norm.getZ(i).toFixed(4)}\n`;
      }
    }
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        out += `vt ${uv.getX(i).toFixed(5)} ${uv.getY(i).toFixed(5)}\n`;
      }
    }
    for (let i = 0; i < pos.count; i += 3) {
      const i1 = i + 1;
      const i2 = i + 2;
      const i3 = i + 3;
      out += `f ${i1}/${i1}/${i1} ${i2}/${i2}/${i2} ${i3}/${i3}/${i3}\n`;
    }
    return out;
  };

  const exportGlbBlob = async (): Promise<Blob> => {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
      exporter.parse(
        rootGroup,
        (gltf) => {
          if (gltf instanceof ArrayBuffer) {
            resolve(new Blob([gltf], { type: 'model/gltf-binary' }));
          } else {
            resolve(new Blob([JSON.stringify(gltf)], { type: 'application/json' }));
          }
        },
        (err) => reject(err),
        { binary: true }
      );
    });
  };

  return {
    mesh: rootGroup,
    geometry,
    material,
    vertexCount: finalPositions.length / 3,
    triangleCount: triCount,
    atlasDataUrl,
    exportObj,
    exportGlbBlob,
  };
}
