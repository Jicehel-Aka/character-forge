import React, { useState } from 'react';
import { X, Check, Sparkles, Scissors, Plus } from 'lucide-react';
import { WardrobeSlot, WardrobeItem } from '../types/wardrobe';
import { DetectedElement } from '../types/assets';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  element: DetectedElement | null;
  onSaveToWardrobe: (item: WardrobeItem) => void;
}

export const AddCropToWardrobeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  element,
  onSaveToWardrobe,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<WardrobeSlot>('clothing');
  const [itemName, setItemName] = useState<string>('');
  const [itemDescription, setItemDescription] = useState<string>('');
  const [itemColor, setItemColor] = useState<string>('#38bdf8');

  // Auto-fill when element changes
  React.useEffect(() => {
    if (element) {
      setItemName(element.label || 'Nouvel Objet Extrait');
      setItemDescription(element.description || 'Élément extrait directement de l’illustration du personnage.');
      setItemColor(element.dominantColor || '#38bdf8');

      // Auto-guess slot based on label
      const lower = (element.label || '').toLowerCase();
      if (lower.includes('cheveux') || lower.includes('tresses') || lower.includes('hair')) {
        setSelectedSlot('hair');
      } else if (lower.includes('lunette') || lower.includes('visi') || lower.includes('monocle')) {
        setSelectedSlot('eyewear');
      } else if (lower.includes('kimono') || lower.includes('tunique') || lower.includes('robe') || lower.includes('pantalon') || lower.includes('chemise')) {
        setSelectedSlot('clothing');
      } else if (lower.includes('ceinture') || lower.includes('obi') || lower.includes('belt')) {
        setSelectedSlot('belt');
      } else if (lower.includes('gant') || lower.includes('mitaine') || lower.includes('glove')) {
        setSelectedSlot('gloves');
      } else if (lower.includes('armur') || lower.includes('plastron') || lower.includes('cuirasse') || lower.includes('spalière')) {
        setSelectedSlot('armor');
      } else if (lower.includes('botte') || lower.includes('sandale') || lower.includes('chaussure') || lower.includes('geta')) {
        setSelectedSlot('footwear');
      } else if (lower.includes('épée') || lower.includes('dague') || lower.includes('arme') || lower.includes('bouclier') || lower.includes('katana')) {
        setSelectedSlot('weapon');
      } else if (lower.includes('cape') || lower.includes('manteau')) {
        setSelectedSlot('cloak');
      }
    }
  }, [element]);

  if (!isOpen || !element) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: WardrobeItem = {
      id: `custom_${Date.now()}`,
      slot: selectedSlot,
      name: itemName.trim() || 'Élément Personnalisé',
      categoryName:
        selectedSlot === 'hair'
          ? 'Cheveux'
          : selectedSlot === 'eyewear'
          ? 'Lunettes'
          : selectedSlot === 'clothing'
          ? 'Kimono & Vêtements'
          : selectedSlot === 'belt'
          ? 'Ceinture Obi'
          : selectedSlot === 'gloves'
          ? 'Gants'
          : selectedSlot === 'armor'
          ? 'Armure'
          : selectedSlot === 'footwear'
          ? 'Bottes & Sandales'
          : selectedSlot === 'weapon'
          ? 'Armes'
          : 'Accessoires',
      description: itemDescription.trim(),
      color: itemColor,
      isCustomUserItem: true,
      customImageCropUrl: element.croppedDataUrl,
    };

    onSaveToWardrobe(newItem);
    onClose();
  };

  const slotsList: Array<{ id: WardrobeSlot; label: string; icon: string }> = [
    { id: 'hair', label: 'Cheveux', icon: '💇' },
    { id: 'eyewear', label: 'Lunettes & Visière', icon: '🕶️' },
    { id: 'clothing', label: 'Kimono & Vêtements', icon: '👘' },
    { id: 'belt', label: 'Ceinture Obi', icon: '🎗️' },
    { id: 'gloves', label: 'Gants & Poignets', icon: '🧤' },
    { id: 'armor', label: 'Armure & Plastron', icon: '🛡️' },
    { id: 'footwear', label: 'Bottes, Sandales & Geta', icon: '👡' },
    { id: 'weapon', label: 'Armes & Mains', icon: '🗡️' },
    { id: 'cloak', label: 'Cape & Dos', icon: '🧣' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200 my-auto">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pink-400" />
            <h3 className="font-bold text-base text-slate-100">
              Ajouter à ma Garde-Robe 3D
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 text-xs overflow-y-auto flex-1 min-h-0 modal-scroll-body">
          {/* Element preview */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-1 overflow-hidden shrink-0">
              {element.croppedDataUrl ? (
                <img
                  src={element.croppedDataUrl}
                  alt={element.label}
                  className="max-h-full max-w-full object-contain pixelated"
                />
              ) : (
                <div className="w-full h-full bg-slate-800" />
              )}
            </div>
            <div>
              <span className="font-bold text-slate-200 text-sm block">{element.label}</span>
              <span className="text-[11px] text-slate-400 block">
                {element.category} · Découpe extraite de l'image
              </span>
            </div>
          </div>

          {/* Slot selector */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-slate-300">Emplacement anatomique (Slot) :</label>
            <div className="grid grid-cols-3 gap-2">
              {slotsList.map((slot) => {
                const isSelected = selectedSlot === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlot(slot.id)}
                    className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-sky-500/20 text-sky-200 border-sky-500 ring-1 ring-sky-500/50'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{slot.icon}</span>
                    <span className="truncate font-medium">{slot.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-slate-300">Nom de la pièce dans la garde-robe :</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="ex: Kimono de soie bleue, Ceinture Obi..."
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
              required
            />
          </div>

          {/* Color picker */}
          <div className="flex items-center gap-3">
            <label className="font-semibold text-slate-300">Couleur dominante :</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={itemColor}
                onChange={(e) => setItemColor(e.target.value)}
                className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
              />
              <span className="font-mono text-slate-400">{itemColor}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Enregistrer dans ma Garde-Robe</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
