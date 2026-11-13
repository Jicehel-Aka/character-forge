import React, { useState } from 'react';
import {
  Sparkles,
  User,
  Shield,
  Sword,
  Eye,
  Scissors,
  RotateCcw,
  Check,
  X,
  Layers,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { WardrobeSlot, WardrobeItem, CharacterWardrobeState } from '../types/wardrobe';
import { WARDROBE_LIBRARY, INITIAL_WARDROBE_STATE, NUDE_BASE_WARDROBE_STATE } from '../data/wardrobeLibrary';

interface Props {
  wardrobeState: CharacterWardrobeState;
  onChangeWardrobe: (newState: CharacterWardrobeState) => void;
  characterName?: string;
  onOpen3DView: () => void;
  customWardrobeItems?: WardrobeItem[];
  onOpenMultiView?: () => void;
}

export const WardrobeManager: React.FC<Props> = ({
  wardrobeState,
  onChangeWardrobe,
  characterName = 'Personnage',
  onOpen3DView,
  customWardrobeItems = [],
  onOpenMultiView,
}) => {
  const [activeSlot, setActiveSlot] = useState<WardrobeSlot>('clothing');
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // Combine default library with custom user-extracted wardrobe items
  const allItems = [...WARDROBE_LIBRARY, ...customWardrobeItems];

  // Strip all clothes to reveal base nude/anatomical mesh
  const handleStripToBase = () => {
    onChangeWardrobe(NUDE_BASE_WARDROBE_STATE);
  };

  // Restore initial import outfit
  const handleRestoreInitial = () => {
    onChangeWardrobe(INITIAL_WARDROBE_STATE);
  };

  // Equip or unequip an item
  const handleToggleItem = (item: WardrobeItem) => {
    const currentEquipped = wardrobeState[item.slot];
    if (currentEquipped === item.id) {
      // Unequip
      onChangeWardrobe({
        ...wardrobeState,
        [item.slot]: null,
      });
    } else {
      // Equip
      onChangeWardrobe({
        ...wardrobeState,
        [item.slot]: item.id,
      });
    }
  };

  const slotTabs: Array<{ id: WardrobeSlot; label: string; icon: string; count: number }> = [
    {
      id: 'hair',
      label: 'Cheveux',
      icon: '💇',
      count: allItems.filter((i) => i.slot === 'hair').length,
    },
    {
      id: 'eyewear',
      label: 'Lunettes & Visières',
      icon: '🕶️',
      count: allItems.filter((i) => i.slot === 'eyewear').length,
    },
    {
      id: 'clothing',
      label: 'Vêtements & Kimonos',
      icon: '👘',
      count: allItems.filter((i) => i.slot === 'clothing').length,
    },
    {
      id: 'belt',
      label: 'Ceintures & Obi',
      icon: '🎗️',
      count: allItems.filter((i) => i.slot === 'belt').length,
    },
    {
      id: 'gloves',
      label: 'Gants & Gantelets',
      icon: '🧤',
      count: allItems.filter((i) => i.slot === 'gloves').length,
    },
    {
      id: 'armor',
      label: 'Armure',
      icon: '🛡️',
      count: allItems.filter((i) => i.slot === 'armor').length,
    },
    {
      id: 'footwear',
      label: 'Bottes, Sandales & Geta',
      icon: '🥾',
      count: allItems.filter((i) => i.slot === 'footwear').length,
    },
    {
      id: 'weapon',
      label: 'Armes & Katana',
      icon: '🗡️',
      count: allItems.filter((i) => i.slot === 'weapon').length,
    },
    {
      id: 'cloak',
      label: 'Cape & Dos',
      icon: '🧣',
      count: allItems.filter((i) => i.slot === 'cloak').length,
    },
  ];

  const currentItems = allItems.filter((i) => i.slot === activeSlot);
  const equippedCount = Object.values(wardrobeState).filter(Boolean).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-100 text-sm">
              Garde-Robe 3D & Personnalisation Adaptative
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {equippedCount} équipés / 7 slots
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Équipez ou retirez cheveux, lunettes, vêtements, armures, bottes et sandales qui s’adaptent au modèle 3D.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
            <span>Procédure d’Habillage</span>
          </button>
          <button
            onClick={onOpen3DView}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span>Voir en 3D</span>
          </button>
        </div>
      </div>

      {/* Guide Banner: Procedure for removing base imported items */}
      {showGuide && (
        <div className="p-4 bg-sky-950/60 border border-sky-800/60 rounded-xl text-xs text-sky-200 flex flex-col gap-2 animate-fade-in">
          <div className="flex items-center justify-between font-bold text-sky-100">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Procédure : Retirer les objets initiaux pour rhabiller le personnage
            </span>
            <button onClick={() => setShowGuide(false)} className="text-sky-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Lors de l’import initial d'une illustration BD ou d'un concept art, les personnages arrivent déjà habillés. Pour modifier leur tenue :
          </p>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 ml-1">
            <li>
              <strong>1. Déshabiller le modèle de base :</strong> Cliquez sur le bouton rouge ci-dessous pour isoler le corps anatomique nu (sans armure, cape ni bottes).
            </li>
            <li>
              <strong>2. Choisir les nouvelles pièces :</strong> Parcourez les catégories (Cheveux, Lunettes, Vêtements, Sandales, etc.) et cliquez sur <em>Équiper</em>.
            </li>
            <li>
              <strong>3. Adaptation automatique au squelette :</strong> Chaque pièce s'attache automatiquement au bone correspondant (tête, colonne, pieds, bras) et s'anime avec le modèle dans le studio 3D.
            </li>
          </ol>
        </div>
      )}

      {/* Strip to Base / Restore Initial Action Strip */}
      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-amber-400" />
          <span className="text-slate-300">
            <strong>Gestion du modèle de base :</strong> Retirer les vêtements importés pour créer une nouvelle tenue.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStripToBase}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded-lg font-medium transition-colors"
            title="Retirer armure, bottes, cape et cheveux pour révéler le corps de base nu"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Déshabiller (Modèle Nu)</span>
          </button>

          <button
            onClick={handleRestoreInitial}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg font-medium transition-colors"
            title="Restaurer la tenue par défaut de l'importation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tenue Initiale</span>
          </button>
        </div>
      </div>

      {/* Slots Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {slotTabs.map((slot) => {
          const isSelected = activeSlot === slot.id;
          const isSlotEquipped = !!wardrobeState[slot.id];

          return (
            <button
              key={slot.id}
              onClick={() => setActiveSlot(slot.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                isSelected
                  ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-400/40'
                  : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
              }`}
            >
              <span>{slot.icon}</span>
              <span>{slot.label}</span>
              {isSlotEquipped && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Items Grid for Active Slot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Unequip / Slot Empty option card */}
        <div
          onClick={() => onChangeWardrobe({ ...wardrobeState, [activeSlot]: null })}
          className={`p-3.5 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col justify-between gap-3 text-xs ${
            wardrobeState[activeSlot] === null
              ? 'bg-slate-950 border-amber-500/80 ring-1 ring-amber-500/40'
              : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-850 mb-1.5">
              <span className="font-bold text-slate-300">Emplacement Vide (Nu / Retiré)</span>
              {wardrobeState[activeSlot] === null && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                  Actif
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 italic">
              Retire cet objet du personnage pour laisser apparaître la peau ou l’anatomie de base nue.
            </p>
          </div>
          <button className="w-full py-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-white">
            {wardrobeState[activeSlot] === null ? 'Actuellement vide' : 'Retirer cet élément'}
          </button>
        </div>

        {/* Available Items */}
        {currentItems.map((item) => {
          const isEquipped = wardrobeState[item.slot] === item.id;

          return (
            <div
              key={item.id}
              onClick={() => handleToggleItem(item)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 text-xs ${
                isEquipped
                  ? 'bg-slate-950 border-emerald-500 ring-1 ring-emerald-500/50 shadow-md'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-850 mb-1.5">
                  <div className="flex items-center gap-2">
                    {item.customImageCropUrl ? (
                      <img
                        src={item.customImageCropUrl}
                        alt={item.name}
                        className="w-6 h-6 rounded object-cover border border-amber-400/40 bg-slate-900 shrink-0"
                      />
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                    )}
                    <span className="font-bold text-slate-100 truncate">{item.name}</span>
                  </div>
                  {isEquipped && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Équipé
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px]">
                <span className="text-slate-500 font-mono">
                  {item.isCustomUserItem ? (
                    <span className="text-amber-400">★ Élément Extrait</span>
                  ) : item.isInitialDefault ? (
                    'Tenue importée'
                  ) : (
                    'Garde-robe adaptative'
                  )}
                </span>
                <span
                  className={`font-semibold ${
                    isEquipped ? 'text-emerald-400' : 'text-sky-400 hover:underline'
                  }`}
                >
                  {isEquipped ? 'Déséquiper' : 'Équiper sur le modèle →'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
