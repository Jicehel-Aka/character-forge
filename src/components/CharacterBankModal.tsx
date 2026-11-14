import React, { useState } from 'react';
import {
  Users,
  X,
  Sparkles,
  Check,
  Sword,
} from 'lucide-react';
import { BankCharacter, BankPropObject, CharacterArchetype } from '../types/characterBank';
import { BANK_CHARACTERS, BANK_PROP_OBJECTS } from '../data/characterBank';
import { CharacterWardrobeState } from '../types/wardrobe';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeCharacterId?: string;
  onSelectCharacter: (character: BankCharacter) => void;
  onEquipObject: (object: BankPropObject) => void;
  currentWardrobeState?: CharacterWardrobeState;
}

export const CharacterBankModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeCharacterId,
  onSelectCharacter,
  onEquipObject,
  currentWardrobeState,
}) => {
  const [activeTab, setActiveTab] = useState<'characters' | 'objects'>('characters');
  const [selectedArchetypeFilter, setSelectedArchetypeFilter] = useState<'all' | CharacterArchetype>('all');
  const [selectedPropCategory, setSelectedPropCategory] = useState<'all' | 'weapon' | 'armor' | 'clothing' | 'footwear' | 'eyewear' | 'accessory'>('all');
  const [equippedFeedback, setEquippedFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const archetypesList: Array<{ id: 'all' | CharacterArchetype; label: string }> = [
    { id: 'all', label: 'Tous les Styles' },
    { id: 'martial_arts', label: '🥋 Arts Martiaux' },
    { id: 'fantasy_warrior', label: '🛡️ Fantasy & Viking' },
    { id: 'cyberpunk', label: '⚡ Cyberpunk Sci-Fi' },
    { id: 'mage', label: '🔮 Haute Magie' },
    { id: 'retro_mecha', label: '🚀 Rétro Arcade' },
    { id: 'ninja', label: '🥷 Shinobi' },
  ];

  const propCategories: Array<{ id: 'all' | 'weapon' | 'armor' | 'clothing' | 'footwear' | 'eyewear' | 'accessory'; label: string }> = [
    { id: 'all', label: 'Tous les Objets' },
    { id: 'weapon', label: '🗡️ Armes' },
    { id: 'armor', label: '🛡️ Armures' },
    { id: 'clothing', label: '👘 Kimonos & Tenues' },
    { id: 'footwear', label: '👟 Chaussures & Geta' },
    { id: 'eyewear', label: '🕶️ Optiques & Visières' },
    { id: 'accessory', label: '🎗️ Ceintures & Capes' },
  ];

  const filteredCharacters = BANK_CHARACTERS.filter((c) => {
    if (selectedArchetypeFilter === 'all') return true;
    return c.archetype === selectedArchetypeFilter;
  });

  const filteredProps = BANK_PROP_OBJECTS.filter((p) => {
    if (selectedPropCategory === 'all') return true;
    return p.category === selectedPropCategory;
  });

  const handleEquip = (prop: BankPropObject) => {
    onEquipObject(prop);
    setEquippedFeedback(`Objet "${prop.name}" équipé avec succès !`);
    setTimeout(() => setEquippedFeedback(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-slate-200 my-auto overflow-hidden">
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white shadow-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>Banque de Personnages & d’Objets 3D</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {BANK_CHARACTERS.length} héros · {BANK_PROP_OBJECTS.length} objets
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Sélectionnez un personnage pré-calibré ou équipez des armes et pièces de garde-robe sur votre personnage actif.
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

        {/* Tab Switcher & Filter Pills - Fixed */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('characters')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'characters'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Personnages Complets ({BANK_CHARACTERS.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('objects')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'objects'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sword className="w-3.5 h-3.5" />
              <span>Banque d'Objets & Armes ({BANK_PROP_OBJECTS.length})</span>
            </button>
          </div>

          {/* Filters */}
          {activeTab === 'characters' ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {archetypesList.map((arch) => (
                <button
                  key={arch.id}
                  onClick={() => setSelectedArchetypeFilter(arch.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    selectedArchetypeFilter === arch.id
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {arch.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {propCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedPropCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    selectedPropCategory === cat.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Feedback Alert */}
        {equippedFeedback && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/90 border border-emerald-600/70 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-fade-in shrink-0">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{equippedFeedback}</span>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 modal-scroll-body">
          {activeTab === 'characters' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCharacters.map((char) => {
                const isCurrent = activeCharacterId === char.id;
                return (
                  <div
                    key={char.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between gap-3.5 transition-all ${
                      isCurrent
                        ? 'bg-slate-950 border-sky-500 shadow-xl ring-2 ring-sky-500/40'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-20 h-24 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center p-1">
                        <img
                          src={char.imageUrl}
                          alt={char.name}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            {char.archetypeLabel}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1 font-bold">
                              <Check className="w-2.5 h-2.5" />
                              Actif
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-sm text-slate-100 mt-1 truncate">
                          {char.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {char.tagline}
                        </p>

                        {/* Palette dots */}
                        <div className="flex items-center gap-1 mt-2">
                          {char.palette.slice(0, 6).map((color, i) => (
                            <div
                              key={i}
                              className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-850">
                      {char.description}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-850">
                      <button
                        onClick={() => {
                          onSelectCharacter(char);
                          onClose();
                        }}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${
                          isCurrent
                            ? 'bg-slate-800 text-sky-300 border border-sky-500/50'
                            : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isCurrent ? 'Personnage Déjà Actif' : '⚡ Charger ce Personnage'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredProps.map((prop) => {
                const isEquipped =
                  currentWardrobeState &&
                  currentWardrobeState[prop.slot] === prop.wardrobeItemId;

                return (
                  <div
                    key={prop.id}
                    className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-all ${
                      isEquipped
                        ? 'bg-slate-950 border-amber-500 ring-1 ring-amber-500/40 shadow-lg'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-850">
                        <span className="text-xl">{prop.icon}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-400 capitalize">
                            Slot : {prop.slot}
                          </span>
                          {isEquipped && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold">
                              Équipé
                            </span>
                          )}
                        </div>
                      </div>

                      <h4 className="font-bold text-xs text-slate-200 mt-2">
                        {prop.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                        {prop.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleEquip(prop)}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                        isEquipped
                          ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                          : 'bg-amber-600 hover:bg-amber-500 text-white'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isEquipped ? '✓ Déjà Équipé' : 'Équiper sur Personnage Actif'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="p-4 px-6 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0 text-xs text-slate-400">
          <span>
            💡 Astuce : Vous pouvez modifier, déshabiller ou re-texturer chaque personnage dans l'onglet Garde-Robe et 3D Studio.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
