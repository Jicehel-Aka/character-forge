import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  X,
  Film,
  Download,
  Play,
  Pause,
  RefreshCw,
  FolderArchive,
  Palette,
  Cpu,
  ShieldCheck,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  render3DModelToSpriteSheet,
  RenderedSpriteSheetResult,
  SpritePalettePreset,
  SpriteRenderConfig,
} from '../utils/spriteRenderer3D';
import { TransferableAnimationId } from '../types/characterBank';
import type { CharacterRigBones } from '../types/rig';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetGroup: THREE.Object3D | null;
  sourceLabel: string;
  characterName: string;
  clips?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer | null;
  proceduralBones?: CharacterRigBones | null;
  proceduralAnimId?: TransferableAnimationId;
  onSendSheetToWorkspace?: (sheetDataUrl: string, name: string) => void;
}

const DEFAULT_CONFIG: SpriteRenderConfig = {
  cellSize: 64,
  directionsCount: 8,
  framesPerDir: 6,
  pitchDeg: 25,
  paddingPct: 5,
  palettePreset: 'rgb565',
  maxColors: 32,
  dithering: false,
  darkOutline: true,
  magentaBg: false,
  trimDuplicates: true,
  includeRowLabels: false,
  clipIndex: 0,
};

export const Sprite3DRendererModal: React.FC<Props> = ({
  isOpen,
  onClose,
  targetGroup,
  sourceLabel,
  characterName,
  clips = [],
  mixer = null,
  proceduralBones = null,
  proceduralAnimId = 'walk',
  onSendSheetToWorkspace,
}) => {
  const [config, setConfig] = useState<SpriteRenderConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<RenderedSpriteSheetResult | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedDir, setSelectedDir] = useState<number>(0);
  const [previewFrameIdx, setPreviewFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(8);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const animCanvasRef = useRef<HTMLCanvasElement>(null);
  const paletteCanvasRef = useRef<HTMLCanvasElement>(null);

  const hasEmbeddedOrRigMotion =
    clips.length > 0 || Boolean(proceduralBones);

  // Auto-default to 1 frame turnaround when static mesh has no skeleton, or 6 frames when animated
  useEffect(() => {
    if (!isOpen) return;
    setConfig((prev) => ({
      ...prev,
      framesPerDir: hasEmbeddedOrRigMotion ? Math.max(4, prev.framesPerDir) : 1,
      clipIndex: 0,
    }));
  }, [isOpen, hasEmbeddedOrRigMotion]);

  const handleGenerate = async () => {
    if (!targetGroup) {
      setErrorMsg("Aucun modèle 3D actif dans la scène. Chargez ou sculptez d'abord un personnage.");
      return;
    }
    setIsRendering(true);
    setErrorMsg(null);
    setProgressMsg('Initialisation du moteur orthographique 3D → 2D...');
    try {
      const rendered = await render3DModelToSpriteSheet({
        targetGroup,
        config,
        clips,
        mixer,
        proceduralBones,
        proceduralAnimId,
        characterName,
        onProgress: (_pct, label) => setProgressMsg(label),
      });
      setResult(rendered);
      setSelectedDir(0);
      setPreviewFrameIdx(0);
      setProgressMsg(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du rendu des sprites.';
      setErrorMsg(msg);
      setProgressMsg(null);
    } finally {
      setIsRendering(false);
    }
  };

  // Auto-generate on modal open
  useEffect(() => {
    if (isOpen && targetGroup) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Animate preview loop
  useEffect(() => {
    if (!isOpen || !result || !isPlaying || result.framesPerDir <= 1) return;
    const timer = setInterval(() => {
      setPreviewFrameIdx((prev) => (prev + 1) % result.framesPerDir);
    }, Math.max(40, Math.round(1000 / fps)));
    return () => clearInterval(timer);
  }, [isOpen, result, isPlaying, fps]);

  // Draw current animated sprite frame to preview canvas
  useEffect(() => {
    if (!result || !animCanvasRef.current) return;
    const canvas = animCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dirFrames = result.frames.filter((f) => f.dirIndex === selectedDir);
    const frame = dirFrames[previewFrameIdx % Math.max(1, dirFrames.length)] || result.frames[0];
    if (!frame) return;

    canvas.width = result.cellSize;
    canvas.height = result.cellSize;
    ctx.clearRect(0, 0, result.cellSize, result.cellSize);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), result.cellSize, result.cellSize), 0, 0);
  }, [result, selectedDir, previewFrameIdx]);

  // Draw extracted palette strip onto canvas (avoids inline styles)
  useEffect(() => {
    if (!result || !paletteCanvasRef.current) return;
    const canvas = paletteCanvasRef.current;
    const colors = result.paletteHex.slice(0, 32);
    const sw = 16;
    canvas.width = Math.max(sw, colors.length * sw);
    canvas.height = sw;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    colors.forEach((hex, idx) => {
      ctx.fillStyle = hex;
      ctx.fillRect(idx * sw, 0, sw - 1, sw);
    });
  }, [result]);

  if (!isOpen) return null;

  const safeSlug = characterName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'character';

  const triggerDownload = (blob: Blob, filename: string, notice: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice(notice);
    setTimeout(() => setExportNotice(null), 4000);
  };

  const handleExportZip = async () => {
    if (!result) return;
    try {
      const blob = await result.exportFullZip(characterName);
      triggerDownload(blob, `${safeSlug}_sprites_pack.zip`, 'Paquet complet (.zip) téléchargé !');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Échec export ZIP');
    }
  };

  const handleExportPng = () => {
    if (!result) return;
    result.sheetCanvas.toBlob((blob) => {
      if (!blob) {
        setErrorMsg(
          `Image trop grande pour l'encodage PNG (${result.sheetCanvas.width}×${result.sheetCanvas.height}px). Réduisez la taille de case ou le nombre d'images.`
        );
        return;
      }
      triggerDownload(blob, `${safeSlug}_spritesheet.png`, 'Planche PNG téléchargée !');
    }, 'image/png');
  };

  const handleExportText = (content: string, filename: string, notice: string) => {
    triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), filename, notice);
  };

  const handleExportRaw = () => {
    if (!result) return;
    const buf = new ArrayBuffer(result.rgb565Raw.byteLength);
    new Uint8Array(buf).set(result.rgb565Raw);
    triggerDownload(
      new Blob([buf], { type: 'application/octet-stream' }),
      `${safeSlug}_rgb565_le.raw`,
      'Fichier binaire .raw RGB565 téléchargé !'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <span>Atelier 3D → Planches de Sprites Multi-Moteurs</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {sourceLabel}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Rendu 1 à 8 directions · Palettes Game Boy / PICO-8 / NES / RGB565 · Export Godot, Unity, Aseprite &amp; Gamebuino AKA
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* Left Settings Column */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60 p-4 overflow-y-auto flex flex-col gap-4 modal-scroll-body text-xs">
            {/* Clip Selector if animated GLB/FBX */}
            {clips.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Animation du modèle (.GLB/.FBX)</span>
                </span>
                <select
                  value={config.clipIndex ?? 0}
                  onChange={(e) => setConfig({ ...config, clipIndex: Number(e.target.value) })}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                >
                  {clips.map((c, idx) => (
                    <option key={idx} value={idx}>
                      {c.name || `Clip ${idx + 1}`} ({c.duration.toFixed(2)} s)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Geometry & Camera Grid */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-3">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Cadrage &amp; Directions</span>
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Taille (px)</span>
                  <select
                    value={config.cellSize}
                    onChange={(e) =>
                      setConfig({ ...config, cellSize: Number(e.target.value) as SpriteRenderConfig['cellSize'] })
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100"
                  >
                    <option value={32}>32 × 32 px</option>
                    <option value={48}>48 × 48 px</option>
                    <option value={64}>64 × 64 px</option>
                    <option value={96}>96 × 96 px</option>
                    <option value={128}>128 × 128 px</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Directions</span>
                  <select
                    value={config.directionsCount}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        directionsCount: Number(e.target.value) as SpriteRenderConfig['directionsCount'],
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100"
                  >
                    <option value={8}>8 directions (RPG / Iso)</option>
                    <option value={4}>4 directions (S, E, N, W)</option>
                    <option value={2}>2 profils (Plateforme G/D)</option>
                    <option value={1}>1 vue (Face)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Frames / direction</span>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={config.framesPerDir}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        framesPerDir: Math.max(1, Math.min(16, Number(e.target.value) || 1)),
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100"
                  />
                </label>

                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Inclinaison (°)</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={config.pitchDeg}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        pitchDeg: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-slate-400">
                <div className="flex justify-between">
                  <span>Marge intérieure</span>
                  <span className="font-mono text-slate-200">{config.paddingPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={config.paddingPct}
                  onChange={(e) => setConfig({ ...config, paddingPct: Number(e.target.value) })}
                  className="accent-sky-500 cursor-pointer"
                />
              </label>
            </div>

            {/* Retro Palettes & Pixel Art */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-pink-400" />
                <span>Palette Rétro &amp; Pixel-Art</span>
              </span>

              <select
                value={config.palettePreset}
                onChange={(e) =>
                  setConfig({ ...config, palettePreset: e.target.value as SpritePalettePreset })
                }
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              >
                <option value="native">Couleurs HD d&apos;origine (RGBA)</option>
                <option value="rgb565">RGB565 quantifié (Gamebuino / ESPBoy)</option>
                <option value="gameboy">Game Boy (4 verts rétro)</option>
                <option value="pico8">PICO-8 (16 couleurs)</option>
                <option value="sweetie16">Sweetie 16 (Pixel-art moderne)</option>
                <option value="nes">NES (54 couleurs)</option>
                <option value="cga">CGA (16 couleurs)</option>
              </select>

              {config.palettePreset === 'rgb565' && (
                <label className="flex flex-col gap-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Couleurs max (Median-Cut)</span>
                    <span className="font-mono text-emerald-300">{config.maxColors}</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={64}
                    step={2}
                    value={config.maxColors}
                    onChange={(e) => setConfig({ ...config, maxColors: Number(e.target.value) })}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </label>
              )}

              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.darkOutline}
                    onChange={(e) => setConfig({ ...config, darkOutline: e.target.checked })}
                    className="accent-sky-500"
                  />
                  <span>Contour sombre automatique (1 px)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.dithering}
                    onChange={(e) => setConfig({ ...config, dithering: e.target.checked })}
                    className="accent-sky-500"
                  />
                  <span>Tramage pixel-art Bayer 4×4 (dégradés)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.trimDuplicates}
                    onChange={(e) => setConfig({ ...config, trimDuplicates: e.target.checked })}
                    className="accent-sky-500"
                  />
                  <span>Supprimer les frames identiques</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.magentaBg}
                    onChange={(e) => setConfig({ ...config, magentaBg: e.target.checked })}
                    className="accent-pink-500"
                  />
                  <span>Fond Magenta #FF00FF (chroma key rétro)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.includeRowLabels}
                    onChange={(e) => setConfig({ ...config, includeRowLabels: e.target.checked })}
                    className="accent-sky-500"
                  />
                  <span>Case direction à gauche (S, SE, E…)</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isRendering || !targetGroup}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRendering ? 'animate-spin' : ''}`} />
              <span>{isRendering ? progressMsg || 'Génération...' : '⚡ Générer / Actualiser la Planche'}</span>
            </button>

            {/* License Safety Reminder from GitHub README */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Rappel Licence :</strong> Le code et le mannequin exemple sont MIT/CC0. Les personnages fan-art restent à usage privé, et les animations Mixamo conservent leurs conditions Adobe.
              </span>
            </div>
          </div>

          {/* Right Preview & Multi-Engine Export Column */}
          <div className="lg:col-span-8 p-5 overflow-y-auto flex flex-col gap-4 modal-scroll-body">
            {errorMsg && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/60 rounded-xl text-xs text-rose-200">
                {errorMsg}
              </div>
            )}
            {exportNotice && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-xs text-emerald-200">
                {exportNotice}
              </div>
            )}

            {/* Animated Preview + Sheet Info */}
            {result ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Direction Animated Player */}
                  <div className="md:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">Aperçu Direction</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setIsPlaying(!isPlaying)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300"
                          title={isPlaying ? 'Pause' : 'Lecture'}
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <select
                          value={fps}
                          onChange={(e) => setFps(Number(e.target.value))}
                          className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-200"
                        >
                          <option value={4}>4 FPS</option>
                          <option value={8}>8 FPS</option>
                          <option value={12}>12 FPS</option>
                          <option value={16}>16 FPS</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {result.directions.map((dir, idx) => (
                        <button
                          key={dir}
                          onClick={() => setSelectedDir(idx)}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase transition-colors ${
                            selectedDir === idx
                              ? 'bg-sky-500 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>

                    <div className="h-44 rounded-lg border border-slate-800 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] flex items-center justify-center p-2">
                      <canvas
                        ref={animCanvasRef}
                        className="h-36 w-36 object-contain pixelated"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Case : {result.cellSize}×{result.cellSize} px</span>
                      <span>
                        Planche : {result.sheetCanvas.width}×{result.sheetCanvas.height} px
                      </span>
                    </div>
                  </div>

                  {/* Full Sheet Preview */}
                  <div className="md:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">
                        Planche Complète ({result.rows} dir × {result.framesPerDir} frames)
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400">
                        {result.paletteHex.length} couleurs
                      </span>
                    </div>

                    <div className="flex-1 min-h-[180px] max-h-60 overflow-auto rounded-lg border border-slate-800 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] flex items-center justify-center p-2">
                      <img
                        src={result.sheetDataUrl}
                        alt="Spritesheet généré"
                        className="max-w-full max-h-full object-contain pixelated"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>Palette :</span>
                      <canvas ref={paletteCanvasRef} className="h-4 rounded border border-slate-800" />
                    </div>
                  </div>
                </div>

                {/* Multi-Engine Export Grid */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Exports Multi-Moteurs &amp; Consoles Rétro</span>
                  </span>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      onClick={handleExportZip}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg shadow-md cursor-pointer"
                    >
                      <FolderArchive className="w-4 h-4" />
                      <span>Paquet Complet (.zip)</span>
                    </button>

                    <button
                      onClick={handleExportPng}
                      className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Planche PNG</span>
                    </button>

                    <button
                      onClick={() =>
                        handleExportText(
                          result.godotTres,
                          `${safeSlug}_godot4.tres`,
                          'Ressource Godot 4 (.tres) téléchargée !'
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Godot 4 (.tres)</span>
                    </button>

                    <button
                      onClick={() =>
                        handleExportText(
                          result.asepriteJson,
                          `${safeSlug}_atlas_aseprite.json`,
                          'Atlas JSON (Aseprite/Phaser) téléchargé !'
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Atlas JSON (Aseprite)</span>
                    </button>

                    <button
                      onClick={() =>
                        handleExportText(
                          result.unityMetaJson,
                          `${safeSlug}_unity_meta.json`,
                          'Découpe Unity (.json) téléchargée !'
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unity Meta</span>
                    </button>

                    <button
                      onClick={handleExportRaw}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.raw RGB565 (AKA)</span>
                    </button>

                    <button
                      onClick={() =>
                        handleExportText(
                          result.cHeader,
                          `${safeSlug}_sprites.h`,
                          'En-tête C PROGMEM (.h) téléchargé !'
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>En-tête C (.h)</span>
                    </button>

                    {onSendSheetToWorkspace && (
                      <button
                        onClick={() => {
                          onSendSheetToWorkspace(result.sheetDataUrl, `${characterName} (Spritesheet)`);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/80 hover:bg-indigo-500 text-white font-semibold rounded-lg cursor-pointer ml-auto"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ouvrir dans Découpe 2D</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-slate-400 text-xs gap-2">
                <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                <span>{progressMsg || 'Préparation du rendu 3D → 2D...'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
