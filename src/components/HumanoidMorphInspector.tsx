import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Wand2,
  Sparkles,
  User,
  Eye,
  Layers,
  RotateCcw,
  Check,
  Camera,
  Scissors,
  Box,
  Palette,
} from 'lucide-react';
import { AnatomicalProportions, DEFAULT_PROPORTIONS } from '../utils/humanoidCalibrator';
import { MultiViewAngle } from '../types/wardrobe';

interface Props {
  proportions: AnatomicalProportions;
  onChangeProportions: (p: AnatomicalProportions) => void;
  onAutoCalibrateFromFront: () => Promise<void>;
  frontImageUrl?: string | null;
  multiViews?: Partial<Record<MultiViewAngle, string | null>>;
  showGhostOverlay: boolean;
  onToggleGhostOverlay: (show: boolean) => void;
  ghostOpacity: number;
  onChangeGhostOpacity: (val: number) => void;
  projectTextureOnMannequin: boolean;
  onToggleProjectTexture: (enabled: boolean) => void;
  mannequinStyle: 'studio' | 'skin' | 'wireframe';
  onChangeMannequinStyle: (style: 'studio' | 'skin' | 'wireframe') => void;
  isCalibrating: boolean;
}

export const HumanoidMorphInspector: React.FC<Props> = ({
  proportions,
  onChangeProportions,
  onAutoCalibrateFromFront,
  frontImageUrl,
  multiViews,
  showGhostOverlay,
  onToggleGhostOverlay,
  ghostOpacity,
  onChangeGhostOpacity,
  projectTextureOnMannequin,
  onToggleProjectTexture,
  mannequinStyle,
  onChangeMannequinStyle,
  isCalibrating,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'proportions' | 'overlay' | 'style'>('proportions');

  const updateProp = (key: keyof AnatomicalProportions, val: number) => {
    onChangeProportions({
      ...proportions,
      [key]: val,
    });
  };

  const hasFrontImage = Boolean(frontImageUrl || multiViews?.front);

  return (
    <div className="flex flex-col gap-4 text-xs text-slate-200">
      {/* Top Banner & Auto-Calibrate Action */}
      <div className="p-3.5 bg-gradient-to-br from-indigo-950/80 to-purple-950/80 border border-indigo-500/40 rounded-xl shadow-lg flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-bold text-sm text-white">Mannequin Humanoïde Haute-Fidélité</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
            Morphing 3D Live
          </span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Le mannequin procédural utilise désormais une <strong>anatomie organique sculptée</strong> (tête, cou, clavicules, torse, bras articulés, mains, cuisses, mollets et pieds).
        </p>

        {/* 1-Click Auto-Calibration Button */}
        <button
          onClick={onAutoCalibrateFromFront}
          disabled={!hasFrontImage || isCalibrating}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs shadow-md transition-all ${
            hasFrontImage
              ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white ring-1 ring-purple-400/50 hover:shadow-indigo-500/25 cursor-pointer'
              : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
          }`}
          title={
            hasFrontImage
              ? "Analyse la silhouette de face (ou multi-vues) et ajuste instantanément tête, épaules, torse et jambes du mannequin !"
              : "Chargez une vue de face ou une image pour activer l'auto-calibrage"
          }
        >
          <Wand2 className={`w-4 h-4 ${isCalibrating ? 'animate-spin text-amber-300' : 'text-pink-300'}`} />
          <span>
            {isCalibrating
              ? 'Analyse morphologique en cours...'
              : hasFrontImage
              ? '🎯 Auto-calibrer sur l’image de face / multi-vues'
              : 'Chargez une image pour auto-calibrer'}
          </span>
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
        <button
          onClick={() => setActiveSubTab('proportions')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all ${
            activeSubTab === 'proportions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Proportions</span>
        </button>
        <button
          onClick={() => setActiveSubTab('overlay')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all ${
            activeSubTab === 'overlay'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Calque Fantôme</span>
        </button>
        <button
          onClick={() => setActiveSubTab('style')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all ${
            activeSubTab === 'style'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Apparence</span>
        </button>
      </div>

      {/* TAB 1: Proportions & Sliders */}
      {activeSubTab === 'proportions' && (
        <div className="flex flex-col gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-semibold text-slate-300">Morphologie du mannequin</span>
            <button
              onClick={() => onChangeProportions({ ...DEFAULT_PROPORTIONS })}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
              title="Réinitialiser aux proportions standards"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Défaut</span>
            </button>
          </div>

          {/* Head Scale */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Proportion Tête</span>
              <span className="font-mono text-indigo-400">{(proportions.headScale * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.40"
              step="0.02"
              value={proportions.headScale}
              onChange={(e) => updateProp('headScale', parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Héroïque (1:8)</span>
              <span>Réaliste (1:7.5)</span>
              <span>Stylisé / Chibi</span>
            </div>
          </div>

          {/* Shoulder Width */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Largeur d'Épaules</span>
              <span className="font-mono text-indigo-400">{proportions.shoulderWidth.toFixed(2)} m</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.65"
              step="0.01"
              value={proportions.shoulderWidth}
              onChange={(e) => updateProp('shoulderWidth', parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Chest & Waist Width */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Poitrine / Torse</span>
                <span className="font-mono text-indigo-400">{proportions.chestBreadth.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.18"
                max="0.40"
                step="0.01"
                value={proportions.chestBreadth}
                onChange={(e) => updateProp('chestBreadth', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Tour de Taille</span>
                <span className="font-mono text-indigo-400">{proportions.waistWidth.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.14"
                max="0.36"
                step="0.01"
                value={proportions.waistWidth}
                onChange={(e) => updateProp('waistWidth', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Hip & Pelvis Width */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Bassin / Hanches</span>
              <span className="font-mono text-indigo-400">{proportions.hipWidth.toFixed(2)} m</span>
            </div>
            <input
              type="range"
              min="0.18"
              max="0.42"
              step="0.01"
              value={proportions.hipWidth}
              onChange={(e) => updateProp('hipWidth', parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Leg Length & Arm Length */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Longueur Jambes</span>
                <span className="font-mono text-indigo-400">{proportions.legLength.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.65"
                max="1.10"
                step="0.01"
                value={proportions.legLength}
                onChange={(e) => updateProp('legLength', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Longueur Bras</span>
                <span className="font-mono text-indigo-400">{proportions.armLength.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.45"
                max="0.80"
                step="0.01"
                value={proportions.armLength}
                onChange={(e) => updateProp('armLength', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Arm Pose Angle (A-Pose vs T-Pose) */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Posture des Bras (Pose Repos)</span>
              <span className="font-mono text-indigo-400">
                {proportions.armPoseAngle > 1.2 ? 'T-Pose (90°)' : 'A-Pose (~35°)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => updateProp('armPoseAngle', 0.45)}
                className={`py-1.5 px-2.5 rounded-lg font-semibold border transition-all ${
                  proportions.armPoseAngle <= 0.8
                    ? 'bg-indigo-600/30 border-indigo-400 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Pose en A (Naturelle)
              </button>
              <button
                onClick={() => updateProp('armPoseAngle', Math.PI / 2)}
                className={`py-1.5 px-2.5 rounded-lg font-semibold border transition-all ${
                  proportions.armPoseAngle > 0.8
                    ? 'bg-indigo-600/30 border-indigo-400 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Pose en T (Rigging)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Ghost Calque & Multi-View Overlay */}
      {activeSubTab === 'overlay' && (
        <div className="flex flex-col gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300">Calque Fantôme 2D en Arrière-plan</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showGhostOverlay}
                onChange={(e) => onToggleGhostOverlay(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Superpose directement l'image 2D de face en semi-transparence derrière le mannequin 3D dans le viewport pour vérifier l'alignement anatomique exact des yeux, épaules et pieds.
          </p>

          {showGhostOverlay && (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Opacité du calque</span>
                <span className="font-mono text-indigo-400">{Math.round(ghostOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={ghostOpacity}
                onChange={(e) => onChangeGhostOpacity(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          )}

          {/* Multi-view image thumbnail status */}
          <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-3">
            {frontImageUrl ? (
              <img
                src={frontImageUrl}
                alt="Front Preview"
                className="w-10 h-10 object-contain rounded bg-slate-950 border border-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
                <Camera className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold text-slate-200 block truncate">
                {frontImageUrl ? 'Image de référence chargée' : 'Aucune image de face active'}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                Utilisée pour le calque fantôme et le recalage de proportion
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Style & Appearance */}
      {activeSubTab === 'style' && (
        <div className="flex flex-col gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
          <span className="font-semibold text-slate-300">Style du Mannequin</span>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onChangeMannequinStyle('studio')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                mannequinStyle === 'studio'
                  ? 'bg-indigo-600/30 border-indigo-400 text-white font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-5 h-5 text-indigo-400" />
              <span className="text-[10px]">Studio Mannequin</span>
            </button>

            <button
              onClick={() => onChangeMannequinStyle('skin')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                mannequinStyle === 'skin'
                  ? 'bg-indigo-600/30 border-indigo-400 text-white font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Palette className="w-5 h-5 text-pink-400" />
              <span className="text-[10px]">Peau Organique</span>
            </button>

            <button
              onClick={() => onChangeMannequinStyle('wireframe')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                mannequinStyle === 'wireframe'
                  ? 'bg-indigo-600/30 border-indigo-400 text-white font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px]">Fil de Fer / Cage</span>
            </button>
          </div>

          {/* Texture Projection Toggle */}
          <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-lg mt-1">
            <div className="flex flex-col">
              <span className="font-semibold text-slate-200">Projeter texture 2D sur mannequin</span>
              <span className="text-[10px] text-slate-400">
                Projette l'image de face directement sur le torse et le visage
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={projectTextureOnMannequin}
                onChange={(e) => onToggleProjectTexture(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
