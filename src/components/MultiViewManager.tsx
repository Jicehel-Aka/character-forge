import React, { useRef, useState } from 'react';
import {
  Upload,
  Camera,
  Sparkles,
  Check,
  RefreshCw,
  Grid,
  Info,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  CheckCircle2,
  Wand2,
  RotateCw,
  Scissors,
  ShieldAlert,
  Download,
} from 'lucide-react';
import JSZip from 'jszip';
import { MultiViewAngle } from '../types/wardrobe';
import {
  autoPrepareAllViews,
  BackgroundRemovalMode,
  cleanAndNormalizeSingleView,
  loadImageElement,
  rotateImageDataUrl,
} from '../utils/viewSegmentation';

interface Props {
  views: Record<MultiViewAngle, string | null>;
  activeViewAngle: MultiViewAngle;
  onSelectView: (angle: MultiViewAngle) => void;
  onUploadView: (angle: MultiViewAngle, dataUrl: string) => void;
  onBatchUpdateViews?: (nextViews: Record<MultiViewAngle, string | null>) => void;
  onSliceViewOnCanvas: (angle: MultiViewAngle) => void;
  onEstimateViewWithAi?: (angle: MultiViewAngle) => void;
  onTriggerReconstruction?: () => void;
  onOpenErrorCorrection?: () => void;
}

export const MultiViewManager: React.FC<Props> = ({
  views,
  activeViewAngle,
  onSelectView,
  onUploadView,
  onBatchUpdateViews,
  onSliceViewOnCanvas,
  onEstimateViewWithAi,
  onTriggerReconstruction,
  onOpenErrorCorrection,
}) => {
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const batchInputRef = useRef<HTMLInputElement>(null);

  const [showGuideLines, setShowGuideLines] = useState<boolean>(true);
  const [showGuideInfo, setShowGuideInfo] = useState<boolean>(true);
  const [isAligningViews, setIsAligningViews] = useState<boolean>(false);
  const [bgRemovalMode, setBgRemovalMode] = useState<BackgroundRemovalMode>('auto');
  const [autoCutoutOnUpload, setAutoCutoutOnUpload] = useState<boolean>(true);
  const [alignmentStatus, setAlignmentStatus] = useState<string | null>(null);

  const viewDefinitions: Array<{
    angle: MultiViewAngle;
    title: string;
    subtitle: string;
    description: string;
    silhouetteTip: string;
  }> = [
    {
      angle: 'front',
      title: '01. Vue de Face (Front)',
      subtitle: 'Angle 0° · Pose A',
      description: 'Symétrie faciale, torse, revers du kimono et ceinture nouée.',
      silhouetteTip: 'Aligner la tête au repère haut, la ceinture au milieu et les pieds sur le sol.',
    },
    {
      angle: 'left',
      title: '02. Profil Gauche (Left)',
      subtitle: 'Angle -90° · Ortho',
      description: 'Silhouette latérale, ruban du bandeau, profil du visage et gants.',
      silhouetteTip: 'Même hauteur que la face. Profil tourné vers la gauche.',
    },
    {
      angle: 'right',
      title: '03. Profil Droit (Right)',
      subtitle: 'Angle +90° · Ortho',
      description: 'Accessoires du bras droit, posture et découpe de profil.',
      silhouetteTip: 'Même hauteur que la face. Profil tourné vers la droite.',
    },
    {
      angle: 'back',
      title: '04. Vue Arrière (Dos)',
      subtitle: 'Angle 180° · Dos',
      description: 'Nœud du bandeau, dos du kimono, ceinture noire et talons.',
      silhouetteTip: 'Cheveux arrière, nœud de bandeau et dos du kimono.',
    },
    {
      angle: 'top',
      title: '05. Vue du Dessus (Top)',
      subtitle: 'Plongée +90° · Haut',
      description: 'Cheveux vus d’en haut, épaules, nœud bleu et gants.',
      silhouetteTip: 'Vue plongeante sur le sommet du crâne et la largeur des épaules.',
    },
    {
      angle: 'bottom',
      title: '06. Vue du Dessous (Bottom)',
      subtitle: 'Contre-plongée · Bas',
      description: 'Semelles de chaussures texturées, bas du pantalon et assise.',
      silhouetteTip: 'Vue en contre-plongée sur les semelles et pieds.',
    },
    {
      angle: 'three_quarter',
      title: '07. Perspective 3/4',
      subtitle: 'Angle +45° · Volume',
      description: 'Profondeur dynamique, volume des manches et du kimono.',
      silhouetteTip: 'Angle 3/4 semi-dynamique pour enrichir les volumes intermédiaires.',
    },
  ];

  const processAndUploadView = async (angle: MultiViewAngle, rawDataUrl: string) => {
    if (!autoCutoutOnUpload) {
      onUploadView(angle, rawDataUrl);
      return;
    }
    setAlignmentStatus(`✂️ Suppression automatique du fond Meshy/Studio sur "${angle}"...`);
    try {
      const res = await cleanAndNormalizeSingleView(rawDataUrl, angle, {
        removeBg: true,
        autoContrast: true,
        mode: bgRemovalMode,
      });
      onUploadView(angle, res.dataUrl);
      setAlignmentStatus(
        res.hadOpaqueBg
          ? `✅ Fond retiré et vue "${angle}" centrée automatiquement.`
          : `✅ Vue "${angle}" calibrée sur la ligne de sol.`
      );
      setTimeout(() => setAlignmentStatus(null), 3500);
    } catch {
      onUploadView(angle, rawDataUrl);
      setAlignmentStatus(null);
    }
  };

  const handleFileChange = (angle: MultiViewAngle, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        processAndUploadView(angle, result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBatchFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const name = file.name.toLowerCase();
      let angle: MultiViewAngle = 'front';

      if (name.includes('b192') || name.includes('top') || name.includes('dessus') || name.includes('haut')) {
        angle = 'top';
      } else if (name.includes('cbd2') || name.includes('bottom') || name.includes('dessous') || name.includes('bas')) {
        angle = 'bottom';
      } else if (name.includes('dos') || name.includes('back') || name.includes('rear') || name.includes('(7)')) {
        angle = 'back';
      } else if (name.includes('gauche') || name.includes('left') || name.includes('87eb')) {
        angle = 'left';
      } else if (name.includes('droit') || name.includes('right')) {
        angle = 'right';
      } else if (name.includes('3/4') || name.includes('quarter') || name.includes('perspective')) {
        angle = 'three_quarter';
      } else if (name.includes('face') || name.includes('front') || name.includes('(6)')) {
        angle = 'front';
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          processAndUploadView(angle, result);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Automated Background Removal, Calibration & Alignment function
  const handleAutoAlignAll = async (forcedMode?: BackgroundRemovalMode) => {
    const modeToUse = forcedMode || bgRemovalMode;
    setIsAligningViews(true);
    setAlignmentStatus(
      `Détourage ${
        modeToUse === 'strong'
          ? 'Studio Fort (Meshy)'
          : modeToUse === 'soft'
          ? 'Doux (Noirs protégés)'
          : 'automatique'
      } du fond, recalage au sol et orientation Dessus/Dessous...`
    );
    try {
      const { preparedViews, actions } = await autoPrepareAllViews(views, {
        removeBg: true,
        autoContrast: true,
        autoRotateTopBottom: true,
        mode: modeToUse,
      });
      if (onBatchUpdateViews) {
        onBatchUpdateViews(preparedViews);
      } else {
        (Object.keys(preparedViews) as MultiViewAngle[]).forEach((angle) => {
          const url = preparedViews[angle];
          if (url && url !== views[angle]) {
            onUploadView(angle, url);
          }
        });
      }
      setAlignmentStatus(
        actions.length > 0
          ? `✅ ${actions.join(' · ')}`
          : '✅ Toutes les vues sont détourées et calibrées !'
      );
      setTimeout(() => setAlignmentStatus(null), 6000);
    } catch (err) {
      console.error('Error during auto-align:', err);
      setAlignmentStatus('Erreur lors du détourage et calibrage automatique.');
      setTimeout(() => setAlignmentStatus(null), 3500);
    } finally {
      setIsAligningViews(false);
    }
  };

  // Cutout + Align a single view
  const handleAlignSingleView = async (angle: MultiViewAngle) => {
    const url = views[angle];
    if (!url) return;
    try {
      const res = await cleanAndNormalizeSingleView(url, angle, {
        removeBg: true,
        autoContrast: true,
        mode: bgRemovalMode,
      });
      onUploadView(angle, res.dataUrl);
      setAlignmentStatus(
        res.hadOpaqueBg
          ? `✨ Fond retiré et vue "${angle}" recentrée automatiquement.`
          : `🎯 Vue "${angle}" recentrée sur la ligne de sol.`
      );
      setTimeout(() => setAlignmentStatus(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  // Rotate a single view 90 degrees clockwise
  const handleRotateSingleView = async (angle: MultiViewAngle) => {
    const url = views[angle];
    if (!url) return;
    try {
      const rotated = await rotateImageDataUrl(url, 90);
      onUploadView(angle, rotated);
    } catch (e) {
      console.error(e);
    }
  };

  // Export clean 1024x1024 grey-studio turnaround PNGs + Meshy prompt (from atelier.html)
  const handleExportMeshySheet = async () => {
    const entries = Object.entries(views).filter(([, u]) => Boolean(u)) as Array<[MultiViewAngle, string]>;
    if (entries.length === 0) return;

    setAlignmentStatus('📦 Génération de la Fiche Meshy 1024×1024 (.zip)...');
    try {
      const zip = new JSZip();
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      for (const [angle, url] of entries) {
        const img = await loadImageElement(url);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);
        const pad = 64;
        const scale = Math.min((size - pad * 2) / img.width, (size - pad * 2) / img.height);
        const dw = Math.round(img.width * scale);
        const dh = Math.round(img.height * scale);
        ctx.drawImage(img, Math.round((size - dw) / 2), size - pad - dh, dw, dh);
        const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (pngBlob) {
          zip.file(`meshy_${angle}_1024.png`, pngBlob);
        }
      }

      zip.file(
        'prompt_meshy.txt',
        `A-pose full-body game character turnaround, neutral flat lighting, solid #808080 studio background, symmetric proportions, clean silhouette, no ground shadow, ready for 3D auto-rigging and game engine export (.GLB).`
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiche_meshy_1024_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setAlignmentStatus('✅ Fiche Meshy 1024×1024 + prompt_meshy.txt téléchargée !');
      setTimeout(() => setAlignmentStatus(null), 4000);
    } catch (err) {
      console.error('Meshy sheet export failed:', err);
      setAlignmentStatus('Erreur lors de la création de la Fiche Meshy.');
      setTimeout(() => setAlignmentStatus(null), 3500);
    }
  };

  const loadedCount = Object.values(views).filter(Boolean).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
      {/* Hidden batch file input */}
      <input
        ref={batchInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={handleBatchFiles}
        className="hidden"
      />

      {/* Main Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-slate-100 text-sm">
              Galerie Multi-Vues & Calibrage 3D Photogrammétrique
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {loadedCount} / 7 vues prêtes
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Aucune préparation manuelle requise : déposez vos images brutes (même avec fond ou cadrage décalé), l'outil retire le fond, aligne le Dos/Face/Profils au sol et oriente la vue du Dessus automatiquement.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Calibration Grid */}
          <button
            onClick={() => setShowGuideLines(!showGuideLines)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              showGuideLines
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Afficher/masquer les repères horizontaux (Tête, Ceinture, Sol) sur les photos"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>{showGuideLines ? 'Repères Actifs' : 'Afficher Repères'}</span>
          </button>

          {/* Auto Cutout on Upload Toggle */}
          <button
            onClick={() => setAutoCutoutOnUpload(!autoCutoutOnUpload)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              autoCutoutOnUpload
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Retirer automatiquement le fond Meshy dès l'import d'un fichier image"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>{autoCutoutOnUpload ? 'Détourage à l’import : ON' : 'Détourage à l’import : OFF'}</span>
          </button>

          {/* 3-Way Cutout Mode Toggle (Auto / Doux Noirs / Studio Fort) */}
          <button
            onClick={() =>
              setBgRemovalMode(
                bgRemovalMode === 'auto' ? 'soft' : bgRemovalMode === 'soft' ? 'strong' : 'auto'
              )
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              bgRemovalMode === 'strong'
                ? 'bg-rose-600/30 border-rose-400 text-rose-200 shadow-sm'
                : bgRemovalMode === 'soft'
                ? 'bg-sky-600/30 border-sky-400 text-sky-200 shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Changer la force du détourage : Auto (équilibré), Doux (protège cheveux/semelles noirs sur fond noir), ou Studio Fort (sols très brillants)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
            <span>
              {bgRemovalMode === 'strong'
                ? 'Mode Studio Fort (Meshy)'
                : bgRemovalMode === 'soft'
                ? 'Mode Doux (Noirs protégés)'
                : 'Mode Auto'}
            </span>
          </button>

          {/* Auto Cutout & Align Button */}
          <button
            onClick={() => handleAutoAlignAll()}
            disabled={isAligningViews || loadedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/35 disabled:opacity-50 text-sky-200 border border-sky-400/50 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
            title="Retire le fond automatiquement, aligne Face/Dos/Profils au sol et pivote Dessus/Dessous si besoin"
          >
            {isAligningViews ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>{isAligningViews ? 'Détourage & Alignement...' : '✨ Détourer & Aligner Auto'}</span>
          </button>

          {/* Batch Upload */}
          <button
            onClick={() => batchInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            title="Sélectionner plusieurs fichiers images simultanément sur votre ordinateur"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Charger Fichiers</span>
          </button>

          {/* Error Correction Diagnostics Shortcut */}
          {onOpenErrorCorrection && (
            <button
              onClick={onOpenErrorCorrection}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Analyser les défauts de cadrage, fond ou échelle et réparer automatiquement"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Correction d'Erreurs</span>
            </button>
          )}

          {/* Master 3D Generation Button */}
          {onTriggerReconstruction && (
            <button
              onClick={onTriggerReconstruction}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg ring-1 ring-emerald-400/40 transition-all cursor-pointer"
              title="Générer un vrai modèle 3D humanoïde propre avec membres séparés et téléchargeable en .GLB"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ Synthétiser en 3D (.GLB)</span>
            </button>
          )}

          {/* Export Clean 1024x1024 Meshy Sheet ZIP (from atelier.html) */}
          <button
            onClick={handleExportMeshySheet}
            disabled={loadedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-600/70 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            title="Exporter les vues centrées 1024×1024 sur fond gris + prompt_meshy.txt pour Meshy / Tripo"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Fiche Meshy (.zip)</span>
          </button>
        </div>
      </div>

      {/* Alignment Status Feedback Banner */}
      {alignmentStatus && (
        <div className="bg-sky-950/80 border border-sky-500/50 p-2.5 px-3.5 rounded-lg text-xs text-sky-200 flex items-center gap-2 animate-fade-in shadow-md">
          <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{alignmentStatus}</span>
        </div>
      )}

      {/* Visual Framing Guide Accordion */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowGuideInfo(!showGuideInfo)}
          className="w-full p-2.5 px-3.5 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-200">
              Guide Visuel de Cadrage : Comment obtenir un modèle 3D parfait et sans déformation ?
            </span>
          </div>
          {showGuideInfo ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showGuideInfo && (
          <div className="p-3.5 pt-1 text-xs text-slate-300 border-t border-slate-850 flex flex-col gap-2.5 bg-slate-950/40">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1">
                <div className="font-bold text-sky-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px]">1</span>
                  Échelle & Hauteur constante
                </div>
                <p className="text-[11px] text-slate-400">
                  La tête et les pieds doivent se trouver à la <strong>même hauteur</strong> sur la vue de face, de dos et les profils. Utilisez le bouton <em>« 🎯 Auto-Aligner & Centrer »</em> pour normaliser automatiquement toutes vos images.
                </p>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">2</span>
                  Pose Neutre A-Pose (Bras écartés)
                </div>
                <p className="text-[11px] text-slate-400">
                  Pour que le moteur 3D sépare nettement les bras, les avant-bras, le torse et les jambes sans fusion bizarre, préférez une silhouette où les bras ne sont pas collés au corps.
                </p>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">3</span>
                  Projection Caméra Directionnelle
                </div>
                <p className="text-[11px] text-slate-400">
                  Chaque face 3D reçoit la photo de sa direction : la face pour le visage/kimono, le dos pour les cheveux/ceinture arrière, les profils pour les manches, et le dessous pour les semelles.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 7 Turnaround View Slots Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {viewDefinitions.map((v) => {
          const imgUrl = views[v.angle];
          const isSelected = activeViewAngle === v.angle;

          return (
            <div
              key={v.angle}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const res = event.target?.result as string;
                    if (res) processAndUploadView(v.angle, res);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className={`rounded-xl border p-3 flex flex-col justify-between gap-2.5 transition-all ${
                isSelected
                  ? 'bg-slate-950 border-sky-500 ring-2 ring-sky-500/40 shadow-xl'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <input
                ref={(el) => {
                  fileInputs.current[v.angle] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleFileChange(v.angle, e)}
                className="hidden"
              />

              {/* View Header */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-850">
                <span className="font-bold text-xs text-slate-100 truncate">{v.title}</span>
                {imgUrl ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1 font-semibold">
                    <Check className="w-2.5 h-2.5" />
                    Prête
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 font-mono">
                    À charger
                  </span>
                )}
              </div>

              {/* Thumbnail / Upload Box with Checkerboard Alpha & Calibration Lines */}
              <div
                onClick={() => {
                  fileInputs.current[v.angle]?.click();
                }}
                className={`relative w-full h-48 rounded-lg overflow-hidden border flex items-center justify-center cursor-pointer transition-all group ${
                  imgUrl
                    ? 'bg-slate-900 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] border-slate-700 hover:border-sky-400'
                    : 'bg-slate-900/60 border-dashed border-sky-500/40 hover:border-sky-400 hover:bg-slate-900'
                }`}
                title="Cliquez pour sélectionner un fichier image sur votre ordinateur"
              >
                {imgUrl ? (
                  <>
                    <img
                      src={imgUrl}
                      alt={v.title}
                      className="w-full h-full object-contain p-1 relative z-0"
                    />

                    {/* Anatomical Calibration Guide Lines Overlay */}
                    {showGuideLines && v.angle !== 'top' && v.angle !== 'bottom' && (
                      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between">
                        {/* Head Level Line (7%) */}
                        <div className="absolute top-[7%] left-0 right-0 border-b border-rose-500/60 flex items-center justify-between px-1.5 text-[8px] font-mono text-rose-300 select-none">
                          <span className="bg-slate-900/75 px-1 rounded">Sommet Tête</span>
                          <span className="bg-slate-900/75 px-1 rounded">7%</span>
                        </div>

                        {/* Midline / Belt Level Line (50%) */}
                        <div className="absolute top-[50%] left-0 right-0 border-b border-amber-400/60 flex items-center justify-between px-1.5 text-[8px] font-mono text-amber-200 select-none">
                          <span className="bg-slate-900/75 px-1 rounded">Ceinture</span>
                          <span className="bg-slate-900/75 px-1 rounded">50%</span>
                        </div>

                        {/* Ground / Feet Level Line (93%) */}
                        <div className="absolute top-[93%] left-0 right-0 border-b border-emerald-400/60 flex items-center justify-between px-1.5 text-[8px] font-mono text-emerald-200 select-none">
                          <span className="bg-slate-900/75 px-1 rounded">Pieds / Sol</span>
                          <span className="bg-slate-900/75 px-1 rounded">93%</span>
                        </div>

                        {/* Vertical Center Axis Line (50%) */}
                        <div className="absolute top-0 bottom-0 left-1/2 border-r border-sky-400/30 border-dashed" />
                      </div>
                    )}
                    {showGuideLines && (v.angle === 'top' || v.angle === 'bottom') && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        <div className="absolute top-1/2 left-0 right-0 border-b border-sky-400/40 border-dashed flex justify-between px-1.5 text-[8px] font-mono text-sky-300">
                          <span className="bg-slate-900/80 px-1 rounded">← Épaule G</span>
                          <span className="bg-slate-900/80 px-1 rounded">Épaule D →</span>
                        </div>
                        <div className="absolute top-0 bottom-0 left-1/2 border-r border-amber-400/40 border-dashed" />
                      </div>
                    )}

                    {/* Hover replacement overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[11px] text-white font-medium z-20">
                      <Upload className="w-4 h-4 text-sky-400" />
                      <span>Cliquer pour remplacer</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1.5 text-center p-3 text-slate-300">
                    <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
                      <Upload className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-sky-300">
                      Charger {v.title.split('(')[1]?.replace(')', '') || 'cette vue'}
                    </span>
                    <span className="text-[10px] text-slate-400">Cliquez ou glissez l’image</span>
                    <span className="text-[9px] text-slate-500 italic mt-0.5">{v.silhouetteTip}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-1.5 text-xs pt-1">
                <button
                  onClick={() => fileInputs.current[v.angle]?.click()}
                  className="w-full py-2 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Ouvre l'explorateur de fichiers pour choisir votre image"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{imgUrl ? 'Remplacer cette vue' : 'Charger cette vue'}</span>
                </button>

                {imgUrl && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <button
                      onClick={() => onSelectView(v.angle)}
                      className={`flex-1 py-1 rounded text-center text-[11px] font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800 text-sky-300 border border-sky-500/50'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {isSelected ? '✓ Active' : 'Voir 3D'}
                    </button>
                    <button
                      onClick={() => handleRotateSingleView(v.angle)}
                      className="px-2 py-1 rounded text-[11px] bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 cursor-pointer flex items-center gap-0.5"
                      title="Pivoter cette vue de 90° (utile pour la vue du Dessus ou Dessous)"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>90°</span>
                    </button>
                    <button
                      onClick={() => handleAlignSingleView(v.angle)}
                      className="px-2 py-1 rounded text-[11px] bg-sky-900/50 hover:bg-sky-800 text-sky-200 border border-sky-500/40 cursor-pointer flex items-center gap-1"
                      title="Retirer le fond Meshy et recentrer automatiquement cette image"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>Fond</span>
                    </button>
                    <button
                      onClick={() => onSliceViewOnCanvas(v.angle)}
                      className="px-2 py-1 rounded text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 cursor-pointer"
                      title="Découper des assets sur cette vue dans le Canvas"
                    >
                      Découper
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
