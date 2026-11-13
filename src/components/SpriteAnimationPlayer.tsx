import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, RefreshCw, ZoomIn, ZoomOut, Film } from 'lucide-react';
import { DetectedElement } from '../types/assets';

interface Props {
  frames: DetectedElement[];
  onSelectFrame?: (frame: DetectedElement) => void;
}

export const SpriteAnimationPlayer: React.FC<Props> = ({ frames, onSelectFrame }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [fps, setFps] = useState<number>(10);
  const [scale, setScale] = useState<number>(4);
  const [activeGroup, setActiveGroup] = useState<'all' | 'run' | 'jump'>('all');

  // Filter frames based on group selection if names match
  const filteredFrames = React.useMemo(() => {
    if (activeGroup === 'run') {
      const runFrames = frames.filter((f) => f.label.toLowerCase().includes('run') || f.label.toLowerCase().includes('course'));
      return runFrames.length > 0 ? runFrames : frames.slice(0, Math.ceil(frames.length / 2));
    }
    if (activeGroup === 'jump') {
      const jumpFrames = frames.filter((f) => f.label.toLowerCase().includes('jump') || f.label.toLowerCase().includes('saut'));
      return jumpFrames.length > 0 ? jumpFrames : frames.slice(Math.ceil(frames.length / 2));
    }
    return frames;
  }, [frames, activeGroup]);

  // Animation timer loop
  useEffect(() => {
    if (!isPlaying || filteredFrames.length <= 1) return;

    const interval = 1000 / fps;
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % filteredFrames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, fps, filteredFrames.length]);

  // Reset index when group changes
  useEffect(() => {
    setCurrentFrameIndex(0);
  }, [activeGroup, filteredFrames.length]);

  const currentFrame = filteredFrames[currentFrameIndex] || filteredFrames[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-sky-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Lecteur d'Animation & Spritesheet</h3>
          <span className="text-xs text-slate-400">
            ({filteredFrames.length} frames disponibles)
          </span>
        </div>

        {/* Animation sequence switch (All / Run / Jump) */}
        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveGroup('all')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeGroup === 'all' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            Toutes ({frames.length})
          </button>
          <button
            onClick={() => setActiveGroup('run')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeGroup === 'run' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            Course / Run
          </button>
          <button
            onClick={() => setActiveGroup('jump')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeGroup === 'jump' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            Saut / Jump
          </button>
        </div>
      </div>

      {/* Main Preview Screen */}
      <div className="relative w-full h-64 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-center overflow-hidden">
        {/* Subtle retro pixel grid background */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, #38bdf8 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        />

        {currentFrame?.croppedDataUrl ? (
          <img
            src={currentFrame.croppedDataUrl}
            alt={currentFrame.label}
            className="pixelated object-contain max-h-[85%] max-w-[85%] transition-transform duration-75 drop-shadow-md"
            style={{ transform: `scale(${scale})` }}
          />
        ) : (
          <div className="text-center text-xs text-slate-500">
            Aucun sprite sélectionné pour la prévisualisation
          </div>
        )}

        {/* Frame Info Overlay */}
        {currentFrame && (
          <div className="absolute top-2 left-2 bg-slate-900/90 border border-slate-700/60 px-2.5 py-1 rounded text-[11px] text-slate-300 flex items-center gap-2">
            <span className="font-semibold text-sky-400">
              Frame {currentFrameIndex + 1}/{filteredFrames.length}
            </span>
            <span className="text-slate-500">·</span>
            <span>{currentFrame.label}</span>
          </div>
        )}

        {/* Zoom scale pills */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-slate-900/90 border border-slate-700/60 p-1 rounded text-[11px]">
          <button
            onClick={() => setScale((s) => Math.max(1, s - 1))}
            className="p-1 hover:text-white text-slate-400"
            title="Réduire"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 font-mono text-slate-300">{scale}x</span>
          <button
            onClick={() => setScale((s) => Math.min(8, s + 1))}
            className="p-1 hover:text-white text-slate-400"
            title="Agrandir"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Playback Controls & Frame Scrubber */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Play/Pause & Steppers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentFrameIndex((prev) => (prev > 0 ? prev - 1 : filteredFrames.length - 1))}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Frame précédente"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors shadow-sm"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Lecture</span>
              </>
            )}
          </button>
          <button
            onClick={() => setCurrentFrameIndex((prev) => (prev + 1) % filteredFrames.length)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Frame suivante"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* FPS Slider & Presets */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Cadence:</span>
          <div className="flex items-center gap-1.5">
            {[6, 10, 15, 24].map((rate) => (
              <button
                key={rate}
                onClick={() => setFps(rate)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  fps === rate ? 'bg-sky-500 text-white font-medium' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {rate} FPS
              </button>
            ))}
          </div>
          <input
            type="range"
            min="1"
            max="30"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-20 accent-sky-500 cursor-pointer"
          />
          <span className="text-xs font-mono text-slate-300 w-8">{fps} fps</span>
        </div>
      </div>

      {/* Frame Strip Thumbnails */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-t border-slate-800/80">
        {filteredFrames.map((frame, idx) => (
          <button
            key={frame.id}
            onClick={() => {
              setCurrentFrameIndex(idx);
              setIsPlaying(false);
              onSelectFrame?.(frame);
            }}
            className={`flex-shrink-0 relative w-12 h-12 rounded-lg border overflow-hidden p-1 bg-slate-950 transition-all ${
              idx === currentFrameIndex
                ? 'border-sky-500 ring-2 ring-sky-500/30'
                : 'border-slate-800 hover:border-slate-700 opacity-60 hover:opacity-100'
            }`}
          >
            {frame.croppedDataUrl ? (
              <img
                src={frame.croppedDataUrl}
                alt={frame.label}
                className="w-full h-full object-contain pixelated"
              />
            ) : (
              <div className="w-full h-full bg-slate-900" />
            )}
            <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold text-slate-300 bg-slate-900/80 px-1 rounded">
              {idx + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
