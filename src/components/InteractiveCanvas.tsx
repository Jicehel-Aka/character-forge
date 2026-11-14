import React, { useRef, useState } from 'react';
import {
  Crosshair,
  Trash2,
  Grid,
  Pipette,
} from 'lucide-react';
import { DetectedElement, AssetCategory } from '../types/assets';
import { ChromaKeyOptions } from '../utils/imageProcessing';

interface Props {
  imageUrl: string;
  elements: DetectedElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
  onAddElement: (element: DetectedElement) => void;
  onDeleteElement: (id: string) => void;
  chromaKey: ChromaKeyOptions;
  onChangeChromaKey: (chromaKey: ChromaKeyOptions) => void;
  onApplyGridSlice: (rows: number, cols: number) => void;
}

const CATEGORY_COLORS: Record<AssetCategory, { border: string; bg: string; text: string }> = {
  player: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
  enemy: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
  vehicle: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
  weapon: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' },
  item: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
  ui: { border: '#eab308', bg: 'rgba(234, 179, 8, 0.2)', text: '#fde047' },
  background: { border: '#64748b', bg: 'rgba(100, 116, 139, 0.2)', text: '#94a3b8' },
  character_part: { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)', text: '#f472b6' },
  animation_frame: { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)', text: '#22d3ee' },
};

export const InteractiveCanvas: React.FC<Props> = ({
  imageUrl,
  elements,
  selectedElementId,
  onSelectElement,
  onAddElement,
  onDeleteElement,
  chromaKey,
  onChangeChromaKey,
  onApplyGridSlice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [newLabel] = useState<string>('Custom Sprite');
  const [newCategory] = useState<AssetCategory>('item');
  const [showGridModal, setShowGridModal] = useState<boolean>(false);
  const [gridRows, setGridRows] = useState<number>(2);
  const [gridCols, setGridCols] = useState<number>(4);
  const [isEyedropperActive, setIsEyedropperActive] = useState<boolean>(false);

  // Handle canvas mouse click / drag to create custom bounding boxes
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEyedropperActive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1000, ((e.clientX - rect.left) / rect.width) * 1000));
    const y = Math.max(0, Math.min(1000, ((e.clientY - rect.top) / rect.height) * 1000));

    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentPoint({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1000, ((e.clientX - rect.left) / rect.width) * 1000));
    const y = Math.max(0, Math.min(1000, ((e.clientY - rect.top) / rect.height) * 1000));
    setCurrentPoint({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !currentPoint) {
      setIsDrawing(false);
      return;
    }

    const xmin = Math.round(Math.min(startPoint.x, currentPoint.x));
    const xmax = Math.round(Math.max(startPoint.x, currentPoint.x));
    const ymin = Math.round(Math.min(startPoint.y, currentPoint.y));
    const ymax = Math.round(Math.max(startPoint.y, currentPoint.y));

    // Minimum size threshold (at least 15 units on 1000 scale)
    if (xmax - xmin > 15 && ymax - ymin > 15) {
      const newEl: DetectedElement = {
        id: `custom_${Date.now()}`,
        label: newLabel || `Sprite #${elements.length + 1}`,
        category: newCategory,
        box_2d: [ymin, xmin, ymax, xmax],
        dominantColor: '#38bdf8',
      };
      onAddElement(newEl);
      onSelectElement(newEl.id);
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  // Eyedropper handler for chroma key color pick
  const handleEyedropperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEyedropperActive || !imageRef.current) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.floor(((e.clientX - rect.left) / rect.width) * img.naturalWidth);
    const clickY = Math.floor(((e.clientY - rect.top) / rect.height) * img.naturalHeight);

    const pixel = ctx.getImageData(clickX, clickY, 1, 1).data;
    onChangeChromaKey({
      ...chromaKey,
      enabled: true,
      targetColor: { r: pixel[0], g: pixel[1], b: pixel[2] },
    });
    setIsEyedropperActive(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs">
        {/* Left tools: Mode & instructions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded border border-slate-800 text-slate-300">
            <Crosshair className="w-3.5 h-3.5 text-sky-400" />
            <span>Glissez pour tracer une découpe manuelle</span>
          </div>

          {/* Slicer grid button */}
          <button
            onClick={() => setShowGridModal(!showGridModal)}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
          >
            <Grid className="w-3.5 h-3.5 text-sky-400" />
            <span>Découper Grille ({gridRows}×{gridCols})</span>
          </button>
        </div>

        {/* Right tools: Chroma Key / Fond transparent */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={chromaKey.enabled}
              onChange={(e) => onChangeChromaKey({ ...chromaKey, enabled: e.target.checked })}
              className="accent-sky-500 rounded"
            />
            <span>Détourage Transparent (Chroma Key)</span>
          </label>

          {chromaKey.enabled && (
            <div className="flex items-center gap-2">
              {/* Eyedropper button */}
              <button
                onClick={() => setIsEyedropperActive(!isEyedropperActive)}
                className={`p-1.5 rounded transition-colors ${
                  isEyedropperActive
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Pipette : cliquez sur le fond de l'image"
              >
                <Pipette className="w-3.5 h-3.5" />
              </button>

              {/* Color swatch */}
              <div
                className="w-5 h-5 rounded border border-white/20"
                style={{
                  backgroundColor: `rgb(${chromaKey.targetColor.r}, ${chromaKey.targetColor.g}, ${chromaKey.targetColor.b})`,
                }}
                title={`Couleur clé: rgb(${chromaKey.targetColor.r},${chromaKey.targetColor.g},${chromaKey.targetColor.b})`}
              />

              {/* Tolerance slider */}
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>Tolérance:</span>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={chromaKey.tolerance}
                  onChange={(e) =>
                    onChangeChromaKey({ ...chromaKey, tolerance: Number(e.target.value) })
                  }
                  className="w-16 accent-sky-500 cursor-pointer"
                />
                <span className="font-mono text-slate-200">{chromaKey.tolerance}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Slicer Config Dropdown */}
      {showGridModal && (
        <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-200">Division de spritesheet en matrice régulière :</span>
            <div className="flex items-center gap-1.5">
              <span>Lignes:</span>
              <input
                type="number"
                min="1"
                max="16"
                value={gridRows}
                onChange={(e) => setGridRows(Math.max(1, Number(e.target.value)))}
                className="w-12 px-2 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-center"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span>Colonnes:</span>
              <input
                type="number"
                min="1"
                max="16"
                value={gridCols}
                onChange={(e) => setGridCols(Math.max(1, Number(e.target.value)))}
                className="w-12 px-2 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-center"
              />
            </div>
            <span className="text-slate-400 font-mono text-[11px]">
              → {gridRows * gridCols} cellules
            </span>
          </div>

          <button
            onClick={() => {
              onApplyGridSlice(gridRows, gridCols);
              setShowGridModal(false);
            }}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium transition-colors"
          >
            Générer Découpage Grille
          </button>
        </div>
      )}

      {/* Interactive Canvas Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleEyedropperClick}
        className={`relative w-full aspect-auto max-h-[580px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 select-none flex items-center justify-center ${
          isEyedropperActive ? 'cursor-crosshair' : 'cursor-crosshair'
        }`}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Source to slice"
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* Render Bounding Boxes */}
        {elements.map((el) => {
          const [ymin, xmin, ymax, xmax] = el.box_2d;
          const isSelected = el.id === selectedElementId;
          const style = CATEGORY_COLORS[el.category] || CATEGORY_COLORS.item;

          return (
            <div
              key={el.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectElement(el.id);
              }}
              style={{
                top: `${ymin / 10}%`,
                left: `${xmin / 10}%`,
                width: `${(xmax - xmin) / 10}%`,
                height: `${(ymax - ymin) / 10}%`,
                borderColor: isSelected ? '#38bdf8' : style.border,
                backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.25)' : style.bg,
              }}
              className={`absolute border-2 transition-all cursor-pointer rounded-sm ${
                isSelected ? 'ring-2 ring-sky-400 z-20' : 'hover:border-white z-10'
              }`}
            >
              {/* Floating Label Badge */}
              <div
                style={{ backgroundColor: style.border }}
                className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-950 whitespace-nowrap shadow-md pointer-events-none"
              >
                {el.label}
              </div>

              {/* Delete Button on selection */}
              {isSelected && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteElement(el.id);
                  }}
                  className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 z-30"
                  title="Supprimer cet asset"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Temporary box while dragging */}
        {isDrawing && startPoint && currentPoint && (
          <div
            style={{
              top: `${Math.min(startPoint.y, currentPoint.y) / 10}%`,
              left: `${Math.min(startPoint.x, currentPoint.x) / 10}%`,
              width: `${Math.abs(currentPoint.x - startPoint.x) / 10}%`,
              height: `${Math.abs(currentPoint.y - startPoint.y) / 10}%`,
            }}
            className="absolute border-2 border-dashed border-sky-400 bg-sky-500/20 pointer-events-none z-30"
          />
        )}
      </div>
    </div>
  );
};
