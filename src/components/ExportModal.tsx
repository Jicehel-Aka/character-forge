import React, { useState, useEffect } from 'react';
import {
  Download,
  X,
  Archive,
  Cpu,
  FileCode,
  Check,
  Loader2,
  Package,
  Layers,
  Sparkles,
  CheckSquare,
  Square,
  Sliders,
  FolderArchive,
} from 'lucide-react';
import { DetectedElement, CharacterProfile } from '../types/assets';
import { generateAssetZip, ZipExportOptions } from '../utils/zipExport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  elements: DetectedElement[];
  palette: string[];
  characterProfile?: CharacterProfile;
  imageDimensions: { width: number; height: number };
}

export const ExportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  elements,
  palette,
  characterProfile,
  imageDimensions,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<{ current: number; total: number; label: string } | null>(null);

  // Bundle format options
  const [options, setOptions] = useState<ZipExportOptions>({
    includePng: true,
    includeRgb565Le: true,
    includeRgb565Be: false,
    includeCHeaders: true,
    includeMetadataJson: true,
    includePalette: true,
    includeCharacterSpec: true,
  });

  // Default: select all detected elements on open or change
  useEffect(() => {
    if (elements.length > 0) {
      setSelectedIds(elements.map((e) => e.id));
    }
  }, [elements, isOpen]);

  if (!isOpen) return null;

  const handleToggleSelectAll = () => {
    if (selectedIds.length === elements.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(elements.map((e) => e.id));
    }
  };

  const handleToggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Bulk Export Handler
  const handleBulkExportZip = async () => {
    const elementsToExport = elements.filter((e) => selectedIds.includes(e.id));
    if (elementsToExport.length === 0) return;

    setIsExportingZip(true);
    setProgressStatus({ current: 0, total: elementsToExport.length, label: 'Préparation du bundle...' });

    try {
      const blob = await generateAssetZip({
        elements: elementsToExport,
        palette,
        characterProfile,
        imageDimensions,
        options,
        onProgress: (current, total, label) => {
          setProgressStatus({ current, total, label });
        },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = (characterProfile?.name || 'character_forge_assets')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      a.download = `${cleanName}_bulk_export_${elementsToExport.length}_assets_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setDownloadSuccess(
        `📦 Bulk Export réussi ! ${elementsToExport.length} assets et métadonnées groupés dans l'archive ZIP.`
      );
      setTimeout(() => setDownloadSuccess(null), 4500);
    } catch (err) {
      console.error('Failed to generate Bulk ZIP:', err);
    } finally {
      setIsExportingZip(false);
      setProgressStatus(null);
    }
  };

  const handleDownloadJsonMetadata = () => {
    const elementsToExport = elements.filter((e) => selectedIds.includes(e.id));
    const meta = {
      app: 'Asset Recovery Agent & CharacterAI Studio (Character Forge)',
      type: 'Bulk Export Metadata',
      timestamp: new Date().toISOString(),
      dimensions: imageDimensions,
      palette,
      selectedElementsCount: elementsToExport.length,
      elements: elementsToExport.map((e) => ({
        id: e.id,
        label: e.label,
        category: e.category,
        box_2d: e.box_2d,
        dominantColor: e.dominantColor,
      })),
      characterProfile,
    };
    const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_metadata_${elementsToExport.length}_assets_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCount = selectedIds.length;
  const allSelected = elements.length > 0 && selectedCount === elements.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-slate-200 my-auto overflow-hidden">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>Bulk Export Pack (Archive ZIP Groupée)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {selectedCount} / {elements.length} assets
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Regroupez tous vos sprites découpés, binaires RGB565, headers C et métadonnées en une seule archive ZIP prête à l’emploi.
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

        {/* Scrollable Body with smooth scroll */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto flex-1 min-h-0 modal-scroll-body">
          {downloadSuccess && (
            <div className="p-3 bg-emerald-950/90 border border-emerald-600/70 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{downloadSuccess}</span>
            </div>
          )}

          {/* Section 1: Interactive Elements Checklist */}
        <div className="flex flex-col gap-2.5 bg-slate-950/80 border border-slate-800/90 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-slate-200">
                Éléments détectés à inclure dans le lot ({selectedCount}) :
              </span>
            </div>
            <button
              onClick={handleToggleSelectAll}
              className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold transition-colors flex items-center gap-1"
            >
              {allSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Tout désélectionner</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>Tout sélectionner ({elements.length})</span>
                </>
              )}
            </button>
          </div>

          {/* Grid of detected elements */}
          {elements.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Aucun élément découpé pour le moment. Découpez des éléments sur le Canvas ou lancez l'analyse IA.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {elements.map((el) => {
                const isSelected = selectedIds.includes(el.id);
                return (
                  <div
                    key={el.id}
                    onClick={() => handleToggleItem(el.id)}
                    className={`p-2 rounded-lg border flex items-center gap-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-900 border-sky-500/80 text-white shadow-sm ring-1 ring-sky-500/30'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? 'bg-sky-600 border-sky-400 text-white'
                          : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>

                    <div className="w-9 h-9 rounded bg-slate-950 border border-slate-800 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                      {el.croppedDataUrl ? (
                        <img
                          src={el.croppedDataUrl}
                          alt={el.label}
                          className="max-h-full max-w-full object-contain pixelated"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-800" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-200 block truncate">
                        {el.label}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="capitalize">{el.category}</span>
                        {el.dominantColor && (
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block border border-white/20"
                            style={{ backgroundColor: el.dominantColor }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Formats & Files Inclusions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200">
              Formats et fichiers à générer dans l'archive ZIP :
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includePng}
                onChange={(e) => setOptions({ ...options, includePng: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-slate-200 font-medium">📁 PNG transparents</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeRgb565Le}
                onChange={(e) => setOptions({ ...options, includeRgb565Le: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-slate-200 font-medium">🕹️ RGB565 (ESPBoy/AKA)</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeCHeaders}
                onChange={(e) => setOptions({ ...options, includeCHeaders: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-slate-200 font-medium">⚡ C Headers (.h)</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeMetadataJson}
                onChange={(e) => setOptions({ ...options, includeMetadataJson: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-slate-200 font-medium">📄 metadata.json</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includePalette}
                onChange={(e) => setOptions({ ...options, includePalette: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-slate-200 font-medium">🎨 Palette (.hex & .h)</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeCharacterSpec}
                onChange={(e) => setOptions({ ...options, includeCharacterSpec: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-slate-200 font-medium">👤 Profil Personnage</span>
            </label>
          </div>
        </div>

        {/* Live Progress Bar when compressing */}
        {isExportingZip && progressStatus && (
          <div className="flex flex-col gap-1.5 p-3 bg-slate-950 border border-emerald-500/40 rounded-xl text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Compression en cours ({progressStatus.current} / {progressStatus.total})</span>
              </div>
              <span className="text-slate-400 font-mono text-[11px] truncate max-w-[200px]">
                {progressStatus.label}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{
                  width: `${Math.round((progressStatus.current / (progressStatus.total || 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
        </div>

        {/* Fixed Footer Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 px-6 border-t border-slate-800 bg-slate-950/80 shrink-0">
          <button
            onClick={handleDownloadJsonMetadata}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-800 transition-colors"
            title="Télécharger uniquement le fichier JSON des métadonnées"
          >
            <FileCode className="w-4 h-4 text-amber-400" />
            <span>Télécharger Metadata JSON</span>
          </button>

          <button
            onClick={handleBulkExportZip}
            disabled={isExportingZip || selectedCount === 0}
            className="flex items-center justify-center gap-2.5 w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950 transition-all ring-1 ring-emerald-400/40 cursor-pointer"
          >
            {isExportingZip ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Génération du Bulk Export ZIP...</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>📦 Télécharger Bulk Export ZIP ({selectedCount} assets)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
