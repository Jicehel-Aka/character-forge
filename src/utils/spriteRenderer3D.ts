import * as THREE from 'three';
import JSZip from 'jszip';
import { TransferableAnimationId } from '../types/characterBank';
import { evaluateSkeletalKinematics } from './animationBank';
import type { CharacterRigBones } from '../types/rig';

export type SpritePalettePreset =
  | 'native'
  | 'rgb565'
  | 'gameboy'
  | 'pico8'
  | 'nes'
  | 'cga'
  | 'sweetie16';

export interface SpriteRenderConfig {
  cellSize: 32 | 48 | 64 | 96 | 128;
  directionsCount: 1 | 2 | 4 | 8;
  framesPerDir: number;
  pitchDeg: number;
  paddingPct: number;
  palettePreset: SpritePalettePreset;
  maxColors: number;
  dithering: boolean;
  darkOutline: boolean;
  magentaBg: boolean;
  trimDuplicates: boolean;
  includeRowLabels: boolean;
  clipIndex?: number;
}

export interface RenderedSpriteFrame {
  dirLabel: string;
  dirIndex: number;
  frameIndex: number;
  rgba: Uint8ClampedArray;
}

export interface RenderedSpriteSheetResult {
  sheetCanvas: HTMLCanvasElement;
  sheetDataUrl: string;
  cellSize: number;
  cols: number;
  rows: number;
  framesPerDir: number;
  directions: string[];
  frames: RenderedSpriteFrame[];
  paletteHex: string[];
  rgb565Raw: Uint8Array;
  cHeader: string;
  asepriteJson: string;
  godotTres: string;
  unityMetaJson: string;
  exportFullZip: (characterName?: string) => Promise<Blob>;
}

const DIR_SETS: Record<1 | 2 | 4 | 8, Array<[string, number]>> = {
  1: [['s', 0]],
  2: [
    ['e', 90],
    ['w', -90],
  ],
  4: [
    ['s', 0],
    ['e', 90],
    ['n', 180],
    ['w', -90],
  ],
  8: [
    ['s', 0],
    ['se', 45],
    ['e', 90],
    ['ne', 135],
    ['n', 180],
    ['nw', -135],
    ['w', -90],
    ['sw', -45],
  ],
};

const FIXED_PALETTES: Record<Exclude<SpritePalettePreset, 'native' | 'rgb565'>, Array<[number, number, number]>> = {
  gameboy: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ],
  pico8: [
    [0, 0, 0],
    [29, 43, 83],
    [126, 37, 83],
    [0, 135, 81],
    [171, 82, 54],
    [95, 87, 79],
    [194, 195, 199],
    [255, 241, 232],
    [255, 0, 77],
    [255, 163, 0],
    [255, 236, 39],
    [0, 228, 54],
    [41, 173, 255],
    [131, 118, 156],
    [255, 119, 168],
    [255, 204, 170],
  ],
  cga: [
    [0, 0, 0],
    [0, 0, 170],
    [0, 170, 0],
    [0, 170, 170],
    [170, 0, 0],
    [170, 0, 170],
    [170, 85, 0],
    [170, 170, 170],
    [85, 85, 85],
    [85, 85, 255],
    [85, 255, 85],
    [85, 255, 255],
    [255, 85, 85],
    [255, 85, 255],
    [255, 255, 85],
    [255, 255, 255],
  ],
  sweetie16: [
    [26, 28, 44],
    [93, 39, 93],
    [177, 62, 83],
    [239, 125, 87],
    [255, 205, 117],
    [167, 240, 112],
    [56, 183, 100],
    [37, 113, 121],
    [41, 54, 111],
    [59, 93, 201],
    [65, 166, 246],
    [115, 239, 247],
    [244, 244, 244],
    [148, 176, 194],
    [86, 108, 134],
    [51, 60, 87],
  ],
  nes: [
    [84, 84, 84], [0, 30, 116], [8, 16, 144], [48, 0, 136],
    [68, 0, 100], [92, 0, 48], [84, 4, 0], [60, 24, 0],
    [32, 42, 0], [8, 58, 0], [0, 64, 0], [0, 60, 0],
    [0, 50, 60], [0, 0, 0], [152, 150, 152], [8, 76, 196],
    [48, 50, 236], [92, 30, 228], [136, 20, 176], [160, 20, 100],
    [152, 34, 32], [120, 60, 0], [84, 90, 0], [40, 114, 0],
    [8, 124, 0], [0, 118, 40], [0, 102, 120], [236, 238, 236],
    [76, 154, 236], [120, 124, 236], [176, 98, 236], [228, 84, 236],
    [236, 88, 180], [236, 106, 100], [212, 136, 32], [160, 170, 0],
    [116, 196, 0], [76, 208, 32], [56, 204, 108], [56, 180, 204],
    [60, 60, 60], [168, 204, 236], [188, 188, 236], [212, 178, 236],
    [236, 174, 236], [236, 174, 212], [236, 180, 176], [228, 196, 144],
    [204, 210, 120], [180, 222, 120], [168, 226, 144], [152, 226, 180],
    [160, 214, 228], [160, 162, 160],
  ],
};

const BAYER_4X4 = [
  [-7.5, 0.5, -5.5, 2.5],
  [4.5, -3.5, 6.5, -1.5],
  [-4.5, 3.5, -6.5, 1.5],
  [7.5, -0.5, 5.5, -2.5],
];

function quantizeRgb565(r: number, g: number, b: number): [number, number, number] {
  const r5 = (r >> 3) & 0x1f;
  const g6 = (g >> 2) & 0x3f;
  const b5 = (b >> 3) & 0x1f;
  return [
    Math.round((r5 * 255) / 31),
    Math.round((g6 * 255) / 63),
    Math.round((b5 * 255) / 31),
  ];
}

function toRgb565Word(r: number, g: number, b: number): number {
  return (((r >> 3) & 0x1f) << 11) | (((g >> 2) & 0x3f) << 5) | ((b >> 3) & 0x1f);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

function medianCut(pixels: Array<[number, number, number]>, targetColors: number): Array<[number, number, number]> {
  if (pixels.length === 0) return [[0, 0, 0]];
  const boxes: Array<Array<[number, number, number]>> = [pixels];
  while (boxes.length < targetColors) {
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes.shift();
    if (!box || box.length < 2) {
      if (box) boxes.push(box);
      break;
    }
    let bestCh = 0;
    let bestRange = -1;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255;
      let hi = 0;
      for (const p of box) {
        if (p[ch] < lo) lo = p[ch];
        if (p[ch] > hi) hi = p[ch];
      }
      if (hi - lo > bestRange) {
        bestRange = hi - lo;
        bestCh = ch;
      }
    }
    if (bestRange <= 0) {
      boxes.push(box);
      break;
    }
    box.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes
    .filter((b) => b.length > 0)
    .map((b) => {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (const p of b) {
        sr += p[0];
        sg += p[1];
        sb += p[2];
      }
      return [
        Math.round(sr / b.length),
        Math.round(sg / b.length),
        Math.round(sb / b.length),
      ];
    });
}

function nearestColor(
  r: number,
  g: number,
  b: number,
  palette: Array<[number, number, number]>
): [number, number, number] {
  let bestDist = Infinity;
  let best = palette[0] || [r, g, b];
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    // Perceptual luminance-weighted squared distance
    const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/**
 * Renders any active 3D Object/Group (Sculpted HD Character, Imported GLB/FBX/OBJ, or Procedural Rig)
 * into a multi-directional pixel-art / retro spritesheet with Godot, Unity, Aseprite, and Gamebuino AKA/ESPBoy RGB565 exports.
 */
export async function render3DModelToSpriteSheet(params: {
  targetGroup: THREE.Object3D;
  config: SpriteRenderConfig;
  clips?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer | null;
  proceduralBones?: CharacterRigBones | null;
  proceduralAnimId?: TransferableAnimationId;
  characterName?: string;
  onProgress?: (pct: number, label: string) => void;
}): Promise<RenderedSpriteSheetResult> {
  const {
    targetGroup,
    config,
    clips = [],
    mixer = null,
    proceduralBones = null,
    proceduralAnimId = 'walk',
    characterName = 'Character',
    onProgress,
  } = params;

  const {
    cellSize,
    directionsCount,
    framesPerDir,
    pitchDeg,
    paddingPct,
    palettePreset,
    maxColors,
    dithering,
    darkOutline,
    magentaBg,
    trimDuplicates,
    includeRowLabels,
    clipIndex = 0,
  } = config;

  const dirs = DIR_SETS[directionsCount];
  const S = Math.max(256, cellSize * 4);
  const N = Math.max(1, framesPerDir);

  const offRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  offRenderer.setSize(S, S, false);
  offRenderer.setPixelRatio(1);
  offRenderer.setClearColor(0x000000, 0);
  offRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const offScene = new THREE.Scene();
  offScene.add(new THREE.HemisphereLight(0xfff8f0, 0x1e293b, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.8, 5.2, 4.2);
  offScene.add(key);
  const rim = new THREE.DirectionalLight(0xdbeafe, 0.9);
  rim.position.set(-3.2, 2.5, -3.0);
  offScene.add(rim);

  const pivot = new THREE.Group();
  offScene.add(pivot);

  // Save original parent, transform, and visibility so the main viewport stays completely untouched
  const origParent = targetGroup.parent;
  const origPos = targetGroup.position.clone();
  const origRot = targetGroup.rotation.clone();
  const origScale = targetGroup.scale.clone();
  const origVisible = targetGroup.visible;

  const rawFrames: Array<{
    dirLabel: string;
    dirIndex: number;
    frameIndex: number;
    img: ImageData;
  }> = [];

  try {
    targetGroup.visible = true;
    pivot.add(targetGroup);
    targetGroup.position.set(0, 0, 0);
    targetGroup.rotation.set(0, 0, 0);
    targetGroup.updateMatrixWorld(true);

    // Determine bounding box across the whole pose/clip
    const box = new THREE.Box3().setFromObject(targetGroup, true);
    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    const h = Math.max(0.25, sizeVec.y);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    targetGroup.position.set(-cx, -box.min.y, -cz);
    targetGroup.updateMatrixWorld(true);

    const half = (h * 1.24) / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 500);
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const lookTarget = new THREE.Vector3(0, h * 0.5, 0);
    cam.position.set(0, lookTarget.y + Math.sin(pitchRad) * 60, Math.cos(pitchRad) * 60);
    cam.lookAt(lookTarget);

    const activeClip = clips[clipIndex] || clips[0] || null;
    const grabCanvas = document.createElement('canvas');
    grabCanvas.width = S;
    grabCanvas.height = S;
    const grabCtx = grabCanvas.getContext('2d', { willReadFrequently: true })!;

    let activeAction: THREE.AnimationAction | null = null;
    if (mixer && activeClip) {
      mixer.stopAllAction();
      activeAction = mixer.clipAction(activeClip);
      activeAction.reset().play();
    }

    const totalRenders = dirs.length * N;
    let done = 0;

    for (let dIdx = 0; dIdx < dirs.length; dIdx++) {
      const [dirLabel, yawDeg] = dirs[dIdx];
      pivot.rotation.y = (yawDeg * Math.PI) / 180;

      for (let f = 0; f < N; f++) {
        const phase = N > 1 ? f / N : 0;

        if (mixer && activeClip && activeAction) {
          mixer.setTime(phase * activeClip.duration);
        } else if (proceduralBones && N > 1) {
          proceduralBones.elbowLeft?.rotation.set(-0.1, 0, 0);
          proceduralBones.elbowRight?.rotation.set(-0.1, 0, 0);
          proceduralBones.kneeLeft?.rotation.set(0, 0, 0);
          proceduralBones.kneeRight?.rotation.set(0, 0, 0);
          proceduralBones.footLeft?.rotation.set(0, 0, 0);
          proceduralBones.footRight?.rotation.set(0, 0, 0);
          proceduralBones.torso?.rotation.set(0, 0, 0);
          proceduralBones.head?.rotation.set(0, 0, 0);
          evaluateSkeletalKinematics(proceduralBones, proceduralAnimId, phase * 1.2, 1.0);
        } else if (N > 1) {
          // Gentle synthetic idle breath/bob for static sculpted meshes
          targetGroup.position.y = -box.min.y + Math.sin(phase * Math.PI * 2) * (h * 0.018);
        }

        targetGroup.updateMatrixWorld(true);
        offRenderer.render(offScene, cam);

        grabCtx.clearRect(0, 0, S, S);
        grabCtx.drawImage(offRenderer.domElement, 0, 0);
        rawFrames.push({
          dirLabel,
          dirIndex: dIdx,
          frameIndex: f,
          img: grabCtx.getImageData(0, 0, S, S),
        });

        done++;
        if (done % 4 === 0 || done === totalRenders) {
          onProgress?.(Math.round((done / totalRenders) * 65), `Rendu 3D ${done}/${totalRenders}...`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }

    if (activeAction) {
      activeAction.stop();
    }
  } finally {
    if (origParent) {
      origParent.add(targetGroup);
    }
    targetGroup.position.copy(origPos);
    targetGroup.rotation.copy(origRot);
    targetGroup.scale.copy(origScale);
    targetGroup.visible = origVisible;
    targetGroup.updateMatrixWorld(true);
    offRenderer.dispose();
  }

  // Tight shared bounding box across all rendered frames
  let x0 = S;
  let y0 = S;
  let x1 = -1;
  let y1 = -1;
  for (const fr of rawFrames) {
    const d = fr.img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (d[(y * S + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 < x0 || y1 < y0) {
    x0 = 0;
    y0 = 0;
    x1 = S - 1;
    y1 = S - 1;
  }

  const cropW = x1 - x0 + 1;
  const cropH = y1 - y0 + 1;
  const padPx = Math.round((cellSize * paddingPct) / 100);
  const innerSize = Math.max(8, cellSize - padPx * 2);
  const scale = Math.min(innerSize / cropW, innerSize / cropH);
  const drawW = Math.max(1, Math.round(cropW * scale));
  const drawH = Math.max(1, Math.round(cropH * scale));
  const dx = Math.floor((cellSize - drawW) / 2);
  const dy = cellSize - padPx - drawH;

  // Downsample each frame cleanly with crisp pixel-art edges
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = S;
  srcCanvas.height = S;
  const srcCtx = srcCanvas.getContext('2d')!;

  const cellCanvas = document.createElement('canvas');
  cellCanvas.width = cellSize;
  cellCanvas.height = cellSize;
  const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true })!;
  cellCtx.imageSmoothingEnabled = true;
  cellCtx.imageSmoothingQuality = 'medium';

  const downsampled: RenderedSpriteFrame[] = [];
  const samplePixels: Array<[number, number, number]> = [];

  for (const fr of rawFrames) {
    srcCtx.putImageData(fr.img, 0, 0);
    cellCtx.clearRect(0, 0, cellSize, cellSize);
    cellCtx.drawImage(srcCanvas, x0, y0, cropW, cropH, dx, dy, drawW, drawH);
    const cellData = cellCtx.getImageData(0, 0, cellSize, cellSize).data;
    const rgba = new Uint8ClampedArray(cellData.length);

    for (let i = 0; i < cellData.length; i += 4) {
      const a = cellData[i + 3];
      if (a >= 110) {
        rgba[i] = cellData[i];
        rgba[i + 1] = cellData[i + 1];
        rgba[i + 2] = cellData[i + 2];
        rgba[i + 3] = 255;
        if (samplePixels.length < 24000) {
          samplePixels.push([cellData[i], cellData[i + 1], cellData[i + 2]]);
        }
      }
    }

    downsampled.push({
      dirLabel: fr.dirLabel,
      dirIndex: fr.dirIndex,
      frameIndex: fr.frameIndex,
      rgba,
    });
  }

  onProgress?.(78, 'Quantification palette rétro & contour pixel-art...');

  // Build target palette
  let targetPalette: Array<[number, number, number]> | null = null;
  if (palettePreset === 'rgb565') {
    targetPalette = medianCut(samplePixels, Math.max(4, Math.min(64, maxColors))).map(([r, g, b]) =>
      quantizeRgb565(r, g, b)
    );
  } else if (palettePreset !== 'native') {
    targetPalette = FIXED_PALETTES[palettePreset];
  }

  // Apply palette + optional Bayer dithering + optional 1px dark outline
  const paletteMap = new Map<string, [number, number, number]>();
  for (const fr of downsampled) {
    const px = fr.rgba;
    for (let y = 0; y < cellSize; y++) {
      for (let x = 0; x < cellSize; x++) {
        const idx = (y * cellSize + x) * 4;
        if (px[idx + 3] === 0) continue;

        let r = px[idx];
        let g = px[idx + 1];
        let b = px[idx + 2];

        if (dithering && targetPalette) {
          const bayer = BAYER_4X4[y & 3][x & 3] * 2.2;
          r = Math.max(0, Math.min(255, Math.round(r + bayer)));
          g = Math.max(0, Math.min(255, Math.round(g + bayer)));
          b = Math.max(0, Math.min(255, Math.round(b + bayer)));
        }

        if (targetPalette) {
          const mapped = nearestColor(r, g, b, targetPalette);
          r = mapped[0];
          g = mapped[1];
          b = mapped[2];
        }

        px[idx] = r;
        px[idx + 1] = g;
        px[idx + 2] = b;
        paletteMap.set(rgbToHex(r, g, b), [r, g, b]);
      }
    }

    if (darkOutline) {
      const copy = new Uint8ClampedArray(px);
      for (let y = 0; y < cellSize; y++) {
        for (let x = 0; x < cellSize; x++) {
          const idx = (y * cellSize + x) * 4;
          if (copy[idx + 3] > 0) continue;
          const hasNeighbor =
            (x > 0 && copy[(y * cellSize + x - 1) * 4 + 3] > 0) ||
            (x < cellSize - 1 && copy[(y * cellSize + x + 1) * 4 + 3] > 0) ||
            (y > 0 && copy[((y - 1) * cellSize + x) * 4 + 3] > 0) ||
            (y < cellSize - 1 && copy[((y + 1) * cellSize + x) * 4 + 3] > 0);
          if (hasNeighbor) {
            px[idx] = 16;
            px[idx + 1] = 16;
            px[idx + 2] = 24;
            px[idx + 3] = 255;
          }
        }
      }
    }
  }

  // Optional duplicate frame trimming (only drops column f if identical across all directions)
  let finalFrames = downsampled;
  let finalCols = N;
  if (trimDuplicates && N > 1) {
    const keepIndices: number[] = [0];
    for (let f = 1; f < N; f++) {
      const prevF = keepIndices[keepIndices.length - 1];
      let allMatch = true;
      for (let d = 0; d < dirs.length && allMatch; d++) {
        const a = downsampled.find((fr) => fr.dirIndex === d && fr.frameIndex === prevF)!;
        const b = downsampled.find((fr) => fr.dirIndex === d && fr.frameIndex === f)!;
        let diffPx = 0;
        let activePx = 0;
        for (let p = 0; p < cellSize * cellSize; p++) {
          const aOn = a.rgba[p * 4 + 3] > 0;
          const bOn = b.rgba[p * 4 + 3] > 0;
          if (!aOn && !bOn) continue;
          activePx++;
          if (
            aOn !== bOn ||
            Math.abs(a.rgba[p * 4] - b.rgba[p * 4]) +
              Math.abs(a.rgba[p * 4 + 1] - b.rgba[p * 4 + 1]) +
              Math.abs(a.rgba[p * 4 + 2] - b.rgba[p * 4 + 2]) >
              45
          ) {
            diffPx++;
          }
        }
        if (activePx > 0 && diffPx / activePx > 0.015) {
          allMatch = false;
        }
      }
      if (!allMatch) keepIndices.push(f);
    }

    if (keepIndices.length < N) {
      const remap = new Map(keepIndices.map((oldIdx, newIdx) => [oldIdx, newIdx]));
      finalFrames = downsampled
        .filter((fr) => remap.has(fr.frameIndex))
        .map((fr) => ({ ...fr, frameIndex: remap.get(fr.frameIndex)! }));
      finalCols = keepIndices.length;
    }
  }

  // Build final spritesheet canvas
  const labelOffsetCols = includeRowLabels ? 1 : 0;
  const sheetCols = finalCols + labelOffsetCols;
  const sheetRows = dirs.length;

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = sheetCols * cellSize;
  sheetCanvas.height = sheetRows * cellSize;
  const sCtx = sheetCanvas.getContext('2d')!;

  if (magentaBg) {
    sCtx.fillStyle = '#FF00FF';
    sCtx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  }

  if (includeRowLabels) {
    sCtx.font = `bold ${Math.max(10, Math.round(cellSize * 0.24))}px monospace`;
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    for (let r = 0; r < sheetRows; r++) {
      sCtx.fillStyle = '#0f172a';
      sCtx.fillRect(0, r * cellSize, cellSize, cellSize);
      sCtx.strokeStyle = '#334155';
      sCtx.strokeRect(0.5, r * cellSize + 0.5, cellSize - 1, cellSize - 1);
      sCtx.fillStyle = '#38bdf8';
      sCtx.fillText(dirs[r][0].toUpperCase(), cellSize / 2, r * cellSize + cellSize / 2);
    }
  }

  const tmpCell = document.createElement('canvas');
  tmpCell.width = cellSize;
  tmpCell.height = cellSize;
  const tmpCtx = tmpCell.getContext('2d')!;

  for (const fr of finalFrames) {
    const imgData = new ImageData(new Uint8ClampedArray(fr.rgba), cellSize, cellSize);
    if (magentaBg) {
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i + 3] === 0) {
          imgData.data[i] = 255;
          imgData.data[i + 1] = 0;
          imgData.data[i + 2] = 255;
          imgData.data[i + 3] = 255;
        }
      }
    }
    tmpCtx.putImageData(imgData, 0, 0);
    sCtx.drawImage(tmpCell, (fr.frameIndex + labelOffsetCols) * cellSize, fr.dirIndex * cellSize);
  }

  const sheetDataUrl = sheetCanvas.toDataURL('image/png');
  const cleanIdent = characterName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'character';
  const upperIdent = cleanIdent.toUpperCase();

  // Generate RGB565 LE .raw + C PROGMEM header for the whole sheet
  const sheetData = sCtx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height).data;
  const totalSheetPx = sheetCanvas.width * sheetCanvas.height;
  const rgb565Raw = new Uint8Array(totalSheetPx * 2);
  const words = new Uint16Array(totalSheetPx);

  for (let i = 0; i < totalSheetPx; i++) {
    const idx = i * 4;
    const a = sheetData[idx + 3];
    const r = a < 128 ? 255 : sheetData[idx];
    const g = a < 128 ? 0 : sheetData[idx + 1];
    const b = a < 128 ? 255 : sheetData[idx + 2];
    const w = toRgb565Word(r, g, b);
    words[i] = w;
    rgb565Raw[i * 2] = w & 0xff;
    rgb565Raw[i * 2 + 1] = (w >> 8) & 0xff;
  }

  const hexLines: string[] = [];
  for (let i = 0; i < words.length; i += 16) {
    hexLines.push(
      '  ' +
        Array.from(words.subarray(i, i + 16))
          .map((w) => `0x${w.toString(16).padStart(4, '0').toUpperCase()}`)
          .join(', ')
    );
  }

  const cHeader = `// Généré par Character-Forge Studio (RGB565_LE pour Gamebuino AKA / ESPBoy)
// Transparence Chroma Key : Magenta #FF00FF (0xF81F)
#ifndef _${upperIdent}_SPRITES_H_
#define _${upperIdent}_SPRITES_H_

#include <stdint.h>
#if defined(ESP8266) || defined(ESP32) || defined(ARDUINO_ARCH_AVR)
  #include <avr/pgmspace.h>
#else
  #define PROGMEM
#endif

#define ${upperIdent}_SHEET_W     ${sheetCanvas.width}
#define ${upperIdent}_SHEET_H     ${sheetCanvas.height}
#define ${upperIdent}_CELL_SIZE   ${cellSize}
#define ${upperIdent}_DIRECTIONS  ${dirs.length}
#define ${upperIdent}_FRAMES_DIR  ${finalCols}

const uint16_t ${cleanIdent}_sheet[${words.length}] PROGMEM = {
${hexLines.join(',\n')}
};

#endif
`;

  // Aseprite-compatible Atlas JSON
  const aseFrames: Record<string, unknown> = {};
  for (const fr of finalFrames) {
    const keyName = `${cleanIdent}_${fr.dirLabel}_${fr.frameIndex}.png`;
    aseFrames[keyName] = {
      frame: {
        x: (fr.frameIndex + labelOffsetCols) * cellSize,
        y: fr.dirIndex * cellSize,
        w: cellSize,
        h: cellSize,
      },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellSize, h: cellSize },
      sourceSize: { w: cellSize, h: cellSize },
      duration: 120,
    };
  }
  const asepriteJson = JSON.stringify(
    {
      frames: aseFrames,
      meta: {
        app: 'Character-Forge Studio',
        format: 'RGBA8888',
        image: `${cleanIdent}_spritesheet.png`,
        size: { w: sheetCanvas.width, h: sheetCanvas.height },
        scale: '1',
        frameTags: dirs.map(([dn], r) => ({
          name: `dir_${dn}`,
          from: r * finalCols,
          to: (r + 1) * finalCols - 1,
          direction: 'forward',
        })),
      },
    },
    null,
    2
  );

  // Godot 4 SpriteFrames .tres
  const godotAnims = dirs
    .map(([dn], r) => {
      const framesEntries = Array.from({ length: finalCols }, (_, f) => {
        const subId = `AtlasTexture_${dn}_${f}`;
        return `{
"duration": 1.0,
"texture": SubResource("${subId}")
}`;
      }).join(', ');
      return `{
"frames": [${framesEntries}],
"loop": true,
"name": &"${dn}",
"speed": 8.0
}`;
    })
    .join(', ');

  const godotSubResources = dirs
    .flatMap(([dn], r) =>
      Array.from({ length: finalCols }, (_, f) => {
        const x = (f + labelOffsetCols) * cellSize;
        const y = r * cellSize;
        return `[sub_resource type="AtlasTexture" id="AtlasTexture_${dn}_${f}"]
atlas = ExtResource("1_sheet")
region = Rect2(${x}, ${y}, ${cellSize}, ${cellSize})`;
      })
    )
    .join('\n\n');

  const godotTres = `[gd_resource type="SpriteFrames" load_steps=${dirs.length * finalCols + 2} format=3]

[ext_resource type="Texture2D" path="res://${cleanIdent}_spritesheet.png" id="1_sheet"]

${godotSubResources}

[resource]
animations = [${godotAnims}]
`;

  const unityMetaJson = JSON.stringify(
    {
      engine: 'Unity 2D Sprite Multiple',
      texture: `${cleanIdent}_spritesheet.png`,
      pixelsPerUnit: cellSize,
      filterMode: 'Point',
      slices: finalFrames.map((fr) => ({
        name: `${cleanIdent}_${fr.dirLabel}_${fr.frameIndex}`,
        rect: {
          x: (fr.frameIndex + labelOffsetCols) * cellSize,
          y: sheetCanvas.height - (fr.dirIndex + 1) * cellSize,
          width: cellSize,
          height: cellSize,
        },
        pivot: { x: 0.5, y: 0.0 },
      })),
    },
    null,
    2
  );

  const exportFullZip = async (exportName = characterName): Promise<Blob> => {
    const zip = new JSZip();
    const safe = exportName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'character';

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      sheetCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage PNG impossible (planche trop grande)'))), 'image/png');
    });
    zip.file(`${safe}_spritesheet.png`, pngBlob);
    zip.file(`${safe}_atlas_aseprite.json`, asepriteJson);
    zip.file(`${safe}_godot4.tres`, godotTres);
    zip.file(`${safe}_unity_meta.json`, unityMetaJson);
    zip.file(`${safe}_rgb565_le.raw`, rgb565Raw);
    zip.file(`${safe}_sprites.h`, cHeader);

    const framesFolder = zip.folder('frames');
    if (framesFolder) {
      for (const fr of finalFrames) {
        const fc = document.createElement('canvas');
        fc.width = cellSize;
        fc.height = cellSize;
        const fctx = fc.getContext('2d')!;
        fctx.putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), cellSize, cellSize), 0, 0);
        const fBlob = await new Promise<Blob | null>((res) => fc.toBlob(res, 'image/png'));
        if (fBlob) {
          framesFolder.file(`${safe}_${fr.dirLabel}_${String(fr.frameIndex).padStart(2, '0')}.png`, fBlob);
        }
      }
    }

    zip.file(
      'LICENCE_ET_MOTEURS.txt',
      `Character-Forge Studio — Paquet Spritesheet Multi-Moteurs
=============================================================
- Planche PNG : ${sheetCanvas.width}x${sheetCanvas.height} px (${cellSize}px/case, ${dirs.length} directions, ${finalCols} frames/dir)
- Godot 4 : glisse ${safe}_spritesheet.png et ${safe}_godot4.tres dans res://
- Unity : découpe en Sprite Mode Multiple (${cellSize}x${cellSize}, Point Filter, pivot bas-centre)
- Aseprite / Phaser / Defold : utilise ${safe}_atlas_aseprite.json
- Gamebuino AKA / ESPBoy : utilise ${safe}_rgb565_le.raw ou #include "${safe}_sprites.h"

Rappel Licence :
Les modèles et animations issus d'œuvres protégées (fan-art) doivent rester privés.
Les animations Mixamo suivent les conditions d'utilisation Adobe Mixamo.
Le code et le mannequin exemple sont sous licence MIT / CC0.
`
    );

    return zip.generateAsync({ type: 'blob' });
  };

  onProgress?.(100, 'Planche sprites prête !');

  return {
    sheetCanvas,
    sheetDataUrl,
    cellSize,
    cols: sheetCols,
    rows: sheetRows,
    framesPerDir: finalCols,
    directions: dirs.map((d) => d[0]),
    frames: finalFrames,
    paletteHex: Array.from(paletteMap.keys()),
    rgb565Raw,
    cHeader,
    asepriteJson,
    godotTres,
    unityMetaJson,
    exportFullZip,
  };
}
