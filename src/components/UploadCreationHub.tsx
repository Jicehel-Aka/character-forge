import React, { useState, useRef } from 'react';
import {
  Upload,
  User,
  Sword,
  Trees,
  Film,
  X,
  FileImage,
} from 'lucide-react';
import { AssetCreationIntent, SamplePreset } from '../types/assets';
import { SAMPLE_PRESETS } from '../data/samples';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImageLoaded: (dataUrl: string, intent: AssetCreationIntent, label?: string) => void;
  onSelectSamplePreset: (preset: SamplePreset) => void;
}

export const UploadCreationHub: React.FC<Props> = ({
  isOpen,
  onClose,
  onImageLoaded,
  onSelectSamplePreset,
}) => {
  const [activeIntent, setActiveIntent] = useState<AssetCreationIntent>('character');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onImageLoaded(result, activeIntent, file.name.replace(/\.[^/.]+$/, ''));
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const intentSpecs = {
    character: {
      title: 'Personnage (Avatar 3D & VRM)',
      description:
        'Chargez une illustration de personnage (portrait, dessin BD, manga ou concept art). Le pipeline CharacterGen génère la pose canonique A-Pose / T-Pose, les 5 vues multi-angles et le maillage 3D animé.',
      icon: User,
      badgeColor: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
      sampleId: 'character_gruumshka',
      deliverables: ['Pose canonique (A-Pose / T-Pose)', '5 Vues CharacterGen', 'Maillage 3D & Rigging', 'Export VRM & OBJ'],
    },
    object: {
      title: 'Objet & Arme (3D Prop & Sprite)',
      description:
        'Chargez une arme (épée, hache, pistolet), un bouclier, une potion, un véhicule ou un objet de quête. L’agent génère le modèle 3D sur piédestal, le sprite transparent détouré et le code C RGB565 pour ESPBoy/AKA.',
      icon: Sword,
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      sampleId: 'retro_f1',
      deliverables: ['Prop 3D orientable PBR', 'Détourage fond transparent', 'Header C PROGMEM (.h)', 'Binaire RGB565_LE (.bin)'],
    },
    scenery: {
      title: 'Décor & Environnement (Diorama & Scène)',
      description:
        'Chargez un arrière-plan, une capture d’écran de niveau, un décor BD ou une planche de tuiles (tileset). L’agent extrait la palette de couleurs, segmente le premier plan/arrière-plan et compose un diorama 3D.',
      icon: Trees,
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      sampleId: 'retro_f1',
      deliverables: ['Diorama 3D multi-plans', 'Segmentation décor / UI', 'Palette de couleurs hex', 'Tileset prêt pour moteur'],
    },
    spritesheet: {
      title: 'Spritesheet & Planche Rétro',
      description:
        'Chargez une capture de jeu vidéo rétro, un GIF d’animation ou une planche de sprites découpée en grille. Idéal pour découper les frames de course/saut et exporter vers ESPBoy, AKA, Arduboy ou Godot.',
      icon: Film,
      badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
      sampleId: 'spritesheet_scifi',
      deliverables: ['Découpe matricielle automatique', 'Lecteur d’animation en boucle', 'JSON d’animation Godot/Unity', 'Pack C pour consoles rétro'],
    },
  };

  const currentSpec = intentSpecs[activeIntent];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200 my-auto">
        {/* Modal Top Bar - Fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                Portail de Chargement & Création d'Assets
              </h3>
              <p className="text-xs text-slate-400">
                Sélectionnez le type d'asset à générer et glissez votre image
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Category Selector Tabs - Fixed */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-slate-950 border-b border-slate-800/80 shrink-0">
          {(['character', 'object', 'scenery', 'spritesheet'] as const).map((intent) => {
            const spec = intentSpecs[intent];
            const TabIcon = spec.icon;
            const isSelected = activeIntent === intent;
            return (
              <button
                key={intent}
                onClick={() => setActiveIntent(intent)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-slate-900 border-sky-500 ring-2 ring-sky-500/30 text-white'
                    : 'bg-slate-900/50 border-slate-800/90 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isSelected ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <TabIcon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-xs whitespace-nowrap">
                  {intent === 'character'
                    ? 'Personnage'
                    : intent === 'object'
                    ? 'Objet / Arme'
                    : intent === 'scenery'
                    ? 'Décor / Scène'
                    : 'Spritesheet'}
                </span>
                <span className="text-[10px] text-slate-500 hidden sm:block">
                  {intent === 'character'
                    ? '3D VRM & Multi-Vues'
                    : intent === 'object'
                    ? 'Prop 3D & RGB565'
                    : intent === 'scenery'
                    ? 'Diorama & Tuiles'
                    : 'Animation & Grille'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category Description & Deliverables */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-slate-200 block mb-0.5">{currentSpec.title}</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">{currentSpec.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {currentSpec.deliverables.map((item, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-sky-300 font-mono"
              >
                ✓ {item}
              </span>
            ))}
          </div>
        </div>

        {/* Drag-and-Drop Area & Form - Scrollable */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto min-h-0 flex-1 modal-scroll-body">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />

          {/* Big Drop Target */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
              isDragging
                ? 'border-sky-400 bg-sky-500/15 scale-[1.01]'
                : 'border-slate-700 bg-slate-950/80 hover:border-slate-500 hover:bg-slate-950'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400 shadow-md">
              <Upload className="w-6 h-6" />
            </div>

            <div className="text-center">
              <p className="font-semibold text-sm text-slate-200">
                Glissez votre image de {currentSpec.title.toLowerCase()} ici
              </p>
              <p className="text-xs text-slate-400 mt-1">
                ou <span className="text-sky-400 underline">cliquez pour parcourir</span> (PNG, JPG, WebP)
              </p>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Collage direct (Ctrl+V / Cmd+V) supporté
            </div>
          </div>

          {/* Quick Pre-loaded Samples Shortcuts */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-slate-400">Ou charger un asset de test calibré :</span>
            <div className="flex flex-wrap items-center gap-2">
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelectSamplePreset(preset);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-800 transition-colors"
                >
                  <FileImage className="w-3.5 h-3.5 text-sky-400" />
                  <span>{preset.title.split('(')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
