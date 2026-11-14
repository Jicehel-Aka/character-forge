import { useServerStatus } from '../hooks/useServerStatus';
import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  HelpCircle,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { MultiViewAngle } from '../types/wardrobe';
import {
  DEFAULT_REPAIR_OPTIONS,
  FixedViewDiagnosticReport,
  FixedViewObjectMethod,
  FixedViewRepairOptions,
  analyzeFixedViews,
  reconstructObjectFromFixedViews,
  repairFixedViews,
  smoothGroupGeometry,
  groundAndCenterGroup,
} from '../utils/fixedView3DBuilder';
import {
  TEXT_TO_3D_EXAMPLES,
  TextTo3DResult,
  generate3DFromDescription,
} from '../utils/proceduralTextTo3D';

export interface ActiveForgedModel {
  mesh: THREE.Group;
  title: string;
  sourceLabel: string;
  vertexCount: number;
  triangleCount: number;
  exportObj: (name?: string) => string;
  exportGlbBlob: () => Promise<Blob>;
}

interface Props {
  multiViews: Record<MultiViewAngle, string | null>;
  onUpdateMultiViews: (nextViews: Record<MultiViewAngle, string | null>) => void;
  onDisplayForgedModel: (model: ActiveForgedModel) => void;
  activeForgedModel: ActiveForgedModel | null;
  onClearForgedModel: () => void;
  onTriggerHumanoidGLB: () => void;
  onEquipGeneratedWeapon?: (model: ActiveForgedModel) => void;
  hasCustomEquippedProp?: boolean;
  onUnequipGeneratedWeapon?: () => void;
  onOpenMultiViewGallery: () => void;
}

export const Forge3DCreatorPanel: React.FC<Props> = ({
  multiViews,
  onUpdateMultiViews,
  onDisplayForgedModel,
  activeForgedModel,
  onClearForgedModel,
  onTriggerHumanoidGLB,
  onEquipGeneratedWeapon,
  hasCustomEquippedProp = false,
  onUnequipGeneratedWeapon,
  onOpenMultiViewGallery,
}) => {
  const [subMode, setSubMode] = useState<'description' | 'fixed_views' | 'error_correction'>('description');

  // Text-to-3D states
  const [prompt, setPrompt] = useState<string>(TEXT_TO_3D_EXAMPLES[0].prompt);
  const [preferAI, setPreferAI] = useState<boolean>(true);
  const serverStatus = useServerStatus();
  const [isGeneratingText3D, setIsGeneratingText3D] = useState<boolean>(false);
  const [lastTextResult, setLastTextResult] = useState<TextTo3DResult | null>(null);

  // Fixed-view 3D Object reconstruction states
  const [objectMethod, setObjectMethod] = useState<FixedViewObjectMethod>('voxel_hull');
  const [voxelResolution, setVoxelResolution] = useState<number>(42);
  const [smoothPasses, setSmoothPasses] = useState<number>(3);
  const [isSculptingViews, setIsSculptingViews] = useState<boolean>(false);

  // Error Correction & Diagnostics states
  const [diagnostic, setDiagnostic] = useState<FixedViewDiagnosticReport | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [repairOptions, setRepairOptions] = useState<FixedViewRepairOptions>(DEFAULT_REPAIR_OPTIONS);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  const loadedViewsCount = Object.values(multiViews).filter(Boolean).length;

  const runDiagnostics = async (viewsToCheck = multiViews) => {
    setIsScanning(true);
    try {
      const report = await analyzeFixedViews(viewsToCheck);
      setDiagnostic(report);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (subMode === 'error_correction' || subMode === 'fixed_views') {
      runDiagnostics();
    }
  }, [subMode, multiViews]);

  const handleGenerateFromText = async () => {
    if (!prompt.trim()) return;
    setIsGeneratingText3D(true);
    setStatusMsg(null);
    try {
      const result = await generate3DFromDescription(prompt, preferAI && serverStatus.reachable);
      setLastTextResult(result);
      onDisplayForgedModel({
        mesh: result.mesh,
        title: result.title,
        sourceLabel: result.usedAI ? 'IA Gemini Blueprint + PBR' : 'Synthèse Procédurale PBR',
        vertexCount: result.vertexCount,
        triangleCount: result.triangleCount,
        exportObj: result.exportObj,
        exportGlbBlob: result.exportGlbBlob,
      });
      setStatusMsg(
        `${result.aiWarning ? `⚠ ${result.aiWarning}\n` : ''}Objet "${result.title}" forgé (${result.partCount} sous-ensembles, ${result.triangleCount.toLocaleString()} triangles).`
      );
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error && err.message ? err.message : 'Erreur lors de la création 3D par description.');
    } finally {
      setIsGeneratingText3D(false);
    }
  };

  const handleSculptFromFixedViews = async () => {
    setIsSculptingViews(true);
    setStatusMsg('Détourage du fond, alignement des vues et sculpture 3D en cours...');
    try {
      const { autoPrepareAllViews } = await import('../utils/viewSegmentation');
      const { preparedViews } = await autoPrepareAllViews(multiViews, {
        removeBg: true,
        autoContrast: true,
        autoRotateTopBottom: true,
        mode: repairOptions.strongMeshyBg ? 'strong' : 'auto',
      });
      onUpdateMultiViews(preparedViews);

      const res = await reconstructObjectFromFixedViews({
        views: preparedViews,
        method: objectMethod,
        resolution: voxelResolution,
        smoothPasses,
        objectName: 'Objet_Vues_Fixes',
      });
      onDisplayForgedModel({
        mesh: res.mesh,
        title:
          objectMethod === 'lathe'
            ? 'Objet Révolution 360°'
            : objectMethod === 'extrude_relief'
            ? 'Objet Relief Extrudé'
            : 'Objet 3D Visual Hull',
        sourceLabel: `Vues Fixes (${loadedViewsCount} angle${loadedViewsCount > 1 ? 's' : ''})`,
        vertexCount: res.vertexCount,
        triangleCount: res.triangleCount,
        exportObj: res.exportObj,
        exportGlbBlob: res.exportGlbBlob,
      });
      setStatusMsg(
        `Objet 3D sculpté avec succès (${res.triangleCount.toLocaleString()} triangles). Exportable en .GLB / .OBJ !`
      );
    } catch (err: unknown) {
      setStatusMsg((err instanceof Error && err.message) || 'Impossible de sculpter depuis les vues actuelles.');
    } finally {
      setIsSculptingViews(false);
    }
  };

  const handleAutoRepairViews = async () => {
    setIsRepairing(true);
    setStatusMsg('Correction automatique des erreurs multi-vues en cours...');
    try {
      const { repairedViews, actionsSummary } = await repairFixedViews(multiViews, repairOptions);
      onUpdateMultiViews(repairedViews);
      await runDiagnostics(repairedViews);
      setStatusMsg(
        actionsSummary.length > 0
          ? `Corrections appliquées : ${actionsSummary.join(' · ')}`
          : 'Vues vérifiées et normalisées.'
      );
    } catch (err: unknown) {
      setStatusMsg((err instanceof Error && err.message) || 'Erreur lors de la correction automatique.');
    } finally {
      setIsRepairing(false);
    }
  };

  const handlePostSmoothActiveMesh = () => {
    if (!activeForgedModel) return;
    smoothGroupGeometry(activeForgedModel.mesh, 1);
    groundAndCenterGroup(activeForgedModel.mesh);
    setStatusMsg('Passe de lissage Laplacien appliquée + pivot recentré au sol (Y=0).');
  };

  const handleDownloadGLB = async () => {
    if (!activeForgedModel) return;
    const blob = await activeForgedModel.exportGlbBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeForgedModel.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.glb`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOBJ = () => {
    if (!activeForgedModel) return;
    const objStr = activeForgedModel.exportObj(activeForgedModel.title);
    const blob = new Blob([objStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeForgedModel.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.obj`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3.5 text-xs text-slate-200">
      {/* Sub-mode Switcher */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
        <button
          onClick={() => setSubMode('description')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition-all cursor-pointer ${
            subMode === 'description' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Par Description</span>
        </button>

        <button
          onClick={() => setSubMode('fixed_views')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition-all cursor-pointer ${
            subMode === 'fixed_views' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>Vues Fixes → 3D</span>
        </button>

        <button
          onClick={() => setSubMode('error_correction')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition-all cursor-pointer ${
            subMode === 'error_correction'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Correction Erreurs</span>
        </button>
      </div>

      {/* Contextual Step-by-Step Help Toggle & Accordion */}
      <div className="bg-slate-950/90 border border-indigo-500/35 rounded-xl overflow-hidden">
        <button
          onClick={() => setIsHelpOpen(!isHelpOpen)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-900/80 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-bold text-indigo-200 text-xs">
              Guide pas-à-pas : Réussir sa reconstruction Multi-Vues → 3D
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-300 shrink-0">
            <span>{isHelpOpen ? 'Masquer' : 'Aide'}</span>
            {isHelpOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isHelpOpen && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-800/90 flex flex-col gap-3 text-[11px] text-slate-300 leading-relaxed">
            {/* Step 1: Angles */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1.5">
              <div className="font-bold text-sky-300 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-[10px] font-mono">ÉTAPE 1</span>
                <span>Utilisation optimale des angles (2 à 7 vues)</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-300">
                <li>
                  <strong className="text-white">Face (0°)</strong> : obligatoire — sert de référence d&apos;échelle, de hauteur et de symétrie.
                </li>
                <li>
                  <strong className="text-white">Profils Gauche / Droit (±90°)</strong> : sculptent l&apos;épaisseur du buste, du visage et des membres (évite un rendu plat).
                </li>
                <li>
                  <strong className="text-white">Dos (180°)</strong> : apporte les textures arrière (cheveux, cape, ceinture) et corrige la courbure dorsale.
                </li>
                <li>
                  <strong className="text-white">Dessus &amp; Dessous</strong> : affinent les épaules, le crâne et les semelles (pivotés automatiquement s&apos;ils sont à 90°).
                </li>
                <li>
                  <strong className="text-amber-300">Perspective 3/4 (+45°)</strong> : taille automatiquement les chanfreins diagonaux pour supprimer l&apos;aspect « cube ».
                </li>
              </ul>
            </div>

            {/* Step 2: Alignment & Cutout */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1.5">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono">ÉTAPE 2</span>
                <span>Alignement, Pose &amp; Détourage propre</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-300">
                <li>
                  Utilisez la <strong className="text-white">même pose sur toutes les vues</strong> (A-Pose ou T-Pose conseillée, bras légèrement détachés du buste et jambes non collées).
                </li>
                <li>
                  Activez les <strong className="text-white">Repères</strong> dans <em>Vues Fixes</em> : tête, ceinture et pieds (<code className="text-emerald-300">Y = 0</code>) doivent être alignés horizontalement.
                </li>
                <li>
                  <strong className="text-white">Fonds complexes / Meshy</strong> : en cas de cheveux ou semelles sombres sur fond noir, passez en <strong className="text-sky-300">Mode Doux</strong> ; pour un sol studio brillant tenace, activez <strong className="text-rose-300">Mode Studio Fort</strong>.
                </li>
              </ul>
            </div>

            {/* Step 3: AI Criteria & Method Selection */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono">ÉTAPE 3</span>
                <span>Critères de qualité IA &amp; Choix du moteur</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-300">
                <li>
                  <strong className="text-white">Score de conformité ≥ 85 / 100</strong> : lancez <em>Correction Erreurs → Réparer Tout Automatiquement</em> avant de sculpter pour corriger les écarts d&apos;échelle ou d&apos;axe.
                </li>
                <li>
                  <strong className="text-white">Visual Hull HD (Surface Nets SDF + Atlas UV)</strong> : recommandé pour personnages complets (résolution 40³–48³, lissage 2x pour garder cheveux et plis nets).
                </li>
                <li>
                  <strong className="text-white">Révolution 360° / Relief 3D</strong> : parfaits depuis 1 seule vue pour objets symétriques (fioles, casques) ou plats (épées, boucliers).
                </li>
                <li>
                  <strong className="text-white">Création par Description (IA Gemini)</strong> : décrivez matériaux (métal, cristal, bois) et couleurs précises ; un repli procédural local reste actif même hors-ligne.
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <button
                onClick={onOpenMultiViewGallery}
                className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-indigo-200 font-semibold cursor-pointer"
              >
                Ouvrir la Galerie Vues Fixes →
              </button>
              <button
                onClick={() => setSubMode('error_correction')}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 text-emerald-200 font-semibold cursor-pointer"
              >
                Vérifier mon Score (Diagnostic) →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Notification */}
      {statusMsg && (
        <div className="p-2.5 rounded-xl bg-sky-950/70 border border-sky-500/40 text-sky-200 text-[11px] flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="whitespace-pre-line">{statusMsg}</span>
        </div>
      )}

      {/* MODE 1: CRÉATION 3D PAR DESCRIPTION */}
      {subMode === 'description' && (
        <div className="flex flex-col gap-3">
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">Création 3D par Description</span>
              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
                Multi-Pièces PBR + GLB
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Décrivez librement un objet, une arme, un accessoire ou une créature (matériaux, couleurs, runes, style). Le moteur assemble un modèle 3D multi-pièces avec textures procédurales et matériaux PBR.
            </p>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Ex: Épée runique en acier forgé avec garde en or et cristal cyan lumineux..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-y"
            />

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferAI && serverStatus.reachable}
                  disabled={serverStatus.checked && !serverStatus.reachable}
                  onChange={(e) => setPreferAI(e.target.checked)}
                  className="accent-sky-500 rounded"
                />
                <span>
                  {serverStatus.checked && !serverStatus.reachable
                    ? 'IA Gemini indisponible (mode statique, aucun serveur) : synthèse procédurale seule'
                    : 'Assisté par IA Gemini (repli procédural auto)'}
                </span>
              </label>

              <button
                onClick={handleGenerateFromText}
                disabled={isGeneratingText3D || !prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isGeneratingText3D ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{isGeneratingText3D ? 'Création...' : 'Forger l’Objet 3D'}</span>
              </button>
            </div>
          </div>

          {/* Quick Templates */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col gap-2">
            <span className="font-semibold text-slate-300 text-[11px]">
              Modèles par description en 1 clic :
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {TEXT_TO_3D_EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => setPrompt(ex.prompt)}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-slate-100">{ex.label}</span>
                    <span className="text-[9px] font-mono text-sky-400">{ex.category}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{ex.prompt}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: CRÉATION D'OBJETS & PERSONNAGES 3D À PARTIR DE VUES FIXES */}
      {subMode === 'fixed_views' && (
        <div className="flex flex-col gap-3">
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">Sculpture 3D depuis Vues Fixes</span>
              <button
                onClick={onOpenMultiViewGallery}
                className="text-[11px] text-sky-400 hover:underline font-medium cursor-pointer"
              >
                Gérer les {loadedViewsCount}/7 vues →
              </button>
            </div>

            {diagnostic && diagnostic.issues.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-500/40 flex items-center justify-between gap-2 text-[11px] text-amber-200">
                <span>
                  {diagnostic.issues.length} anomalie(s) détectée(s) sur les vues (score {diagnostic.score}/100)
                </span>
                <button
                  onClick={() => setSubMode('error_correction')}
                  className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold shrink-0 cursor-pointer"
                >
                  Corriger
                </button>
              </div>
            )}

            {/* Method Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-300">
                Algorithme de Reconstruction d’Objet :
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setObjectMethod('voxel_hull')}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    objectMethod === 'voxel_hull'
                      ? 'bg-amber-600/20 border-amber-400 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold block">Visual Hull</span>
                  <span className="text-[10px] text-slate-400">Multi-vues 3D</span>
                </button>
                <button
                  onClick={() => setObjectMethod('lathe')}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    objectMethod === 'lathe'
                      ? 'bg-amber-600/20 border-amber-400 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold block">Révolution 360°</span>
                  <span className="text-[10px] text-slate-400">Vase / Fiole / Casque</span>
                </button>
                <button
                  onClick={() => setObjectMethod('extrude_relief')}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    objectMethod === 'extrude_relief'
                      ? 'bg-amber-600/20 border-amber-400 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold block">Relief 3D</span>
                  <span className="text-[10px] text-slate-400">Épée / Écu / Emblème</span>
                </button>
              </div>
            </div>

            {/* Precision & Smoothing */}
            {objectMethod !== 'lathe' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                    <span>Résolution Voxels</span>
                    <span className="font-mono text-amber-400">{voxelResolution}³</span>
                  </div>
                  <input
                    type="range"
                    min="26"
                    max="54"
                    step="2"
                    value={voxelResolution}
                    onChange={(e) => setVoxelResolution(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                    <span>Lissage Taubin</span>
                    <span className="font-mono text-amber-400">{smoothPasses}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    step="1"
                    value={smoothPasses}
                    onChange={(e) => setSmoothPasses(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={onTriggerHumanoidGLB}
                disabled={loadedViewsCount === 0}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 hover:from-indigo-500 hover:via-sky-500 hover:to-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
                title="Sculpte directement le maillage 3D continu de votre personnage depuis vos vues fixes (Surface Nets SDF + lissage Taubin, sans mannequin)"
              >
                <Sparkles className="w-4 h-4" />
                <span>Sculpter le Vrai Personnage 3D (.GLB)</span>
              </button>

              <button
                onClick={handleSculptFromFixedViews}
                disabled={isSculptingViews || loadedViewsCount === 0}
                className="w-full py-2 px-3 rounded-xl bg-amber-600/25 hover:bg-amber-600/40 border border-amber-500/40 text-amber-200 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSculptingViews ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Box className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>
                  {isSculptingViews
                    ? 'Sculpture en cours...'
                    : `Sculpter avec l’option "${objectMethod === 'lathe' ? 'Révolution 360°' : objectMethod === 'extrude_relief' ? 'Relief 3D' : 'Visual Hull HD'}"`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: SYSTÈME AVANCÉ DE CORRECTION D'ERREURS */}
      {subMode === 'error_correction' && (
        <div className="flex flex-col gap-3">
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">Diagnostic & Correction Multi-Vues</span>
              </div>
              <button
                onClick={() => runDiagnostics()}
                disabled={isScanning}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Analyser</span>
              </button>
            </div>

            {diagnostic && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-300 font-medium">
                  Indice de conformité 3D ({diagnostic.readyCount} vues actives) :
                </span>
                <span
                  className={`font-mono font-bold text-sm ${
                    diagnostic.score >= 85
                      ? 'text-emerald-400'
                      : diagnostic.score >= 60
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {diagnostic.score} / 100
                </span>
              </div>
            )}

            {/* Issues List */}
            {diagnostic && diagnostic.issues.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
                {diagnostic.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-2 rounded-lg border text-[11px] flex items-start gap-2 ${
                      issue.severity === 'error'
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                        : issue.severity === 'warning'
                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                        : 'bg-sky-950/30 border-sky-500/30 text-sky-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block">{issue.title}</span>
                      <span className="text-[10px] opacity-85 block">{issue.description}</span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/30 shrink-0">
                      {issue.autoFixLabel}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 text-[11px]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Toutes les vues chargées sont propres et alignées pour la reconstruction 3D !</span>
              </div>
            )}

            {/* Repair Pipeline Toggles */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairOptions.removeBackground}
                  onChange={(e) =>
                    setRepairOptions({ ...repairOptions, removeBackground: e.target.checked })
                  }
                  className="accent-emerald-500"
                />
                <span>Détourage fond auto</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairOptions.despeckleAndFill}
                  onChange={(e) =>
                    setRepairOptions({ ...repairOptions, despeckleAndFill: e.target.checked })
                  }
                  className="accent-emerald-500"
                />
                <span>Anti-bruit & trous</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairOptions.alignAndCenter}
                  onChange={(e) =>
                    setRepairOptions({ ...repairOptions, alignAndCenter: e.target.checked })
                  }
                  className="accent-emerald-500"
                />
                <span>Recalage & Échelle</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairOptions.synthesizeMissingProfiles}
                  onChange={(e) =>
                    setRepairOptions({
                      ...repairOptions,
                      synthesizeMissingProfiles: e.target.checked,
                    })
                  }
                  className="accent-emerald-500"
                />
                <span>Miroir profil manquant</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairOptions.synthesizeMissingBack}
                  onChange={(e) =>
                    setRepairOptions({
                      ...repairOptions,
                      synthesizeMissingBack: e.target.checked,
                    })
                  }
                  className="accent-emerald-500"
                />
                <span>Estimer dos miroir</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairOptions.autoContrast}
                  onChange={(e) =>
                    setRepairOptions({ ...repairOptions, autoContrast: e.target.checked })
                  }
                  className="accent-emerald-500"
                />
                <span>Équilibrage exposition</span>
              </label>
              <label className="col-span-2 flex items-center gap-2 cursor-pointer text-rose-200 bg-rose-950/30 border border-rose-500/30 px-2.5 py-1.5 rounded-lg">
                <input
                  type="checkbox"
                  checked={Boolean(repairOptions.strongMeshyBg)}
                  onChange={(e) =>
                    setRepairOptions({ ...repairOptions, strongMeshyBg: e.target.checked })
                  }
                  className="accent-rose-500"
                />
                <span className="font-semibold">
                  Mode Studio Fort (Meshy) — efface sols gris réfléchissants & halos de studio
                </span>
              </label>
            </div>

            <button
              onClick={handleAutoRepairViews}
              disabled={isRepairing || loadedViewsCount === 0}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isRepairing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4" />
              )}
              <span>
                {isRepairing ? 'Réparation en cours...' : 'Corriger Automatiquement les Vues'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Banner when an object is still equipped in the fighter's hand even if preview card is closed */}
      {hasCustomEquippedProp && !activeForgedModel && onUnequipGeneratedWeapon && (
        <div className="p-2.5 bg-rose-950/50 border border-rose-500/40 rounded-xl flex items-center justify-between gap-2 text-[11px] text-rose-200">
          <span>Un objet forgé est actuellement équipé dans la main du combattant.</span>
          <button
            onClick={onUnequipGeneratedWeapon}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Retirer de la main</span>
          </button>
        </div>
      )}

      {/* Active Forged Object Card (Summary + Post-Repair + Export + Equip + Dismiss) */}
      {activeForgedModel && (
        <div className="p-3.5 bg-slate-950 border border-sky-500/40 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-bold text-slate-100 block truncate">{activeForgedModel.title}</span>
              <span className="text-[10px] text-sky-400 font-mono block truncate">
                {activeForgedModel.sourceLabel} · {activeForgedModel.triangleCount.toLocaleString()} tris
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {lastTextResult && subMode === 'description' && (
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                  {lastTextResult.partCount} pièces
                </span>
              )}
              <button
                onClick={onClearForgedModel}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                title="Fermer cet objet et revenir au combattant"
              >
                <X className="w-3.5 h-3.5" />
                <span>Fermer / Retour Combattant</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handlePostSmoothActiveMesh}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium cursor-pointer"
              title="Appliquer une passe de lissage Laplacien et recentrer le pivot au sol"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Lisser & Centrer</span>
            </button>

            {onEquipGeneratedWeapon && (
              <button
                onClick={() => onEquipGeneratedWeapon(activeForgedModel)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 font-semibold cursor-pointer"
                title="Attacher cet objet 3D dans la main droite du mannequin"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Équiper sur Mannequin</span>
              </button>
            )}

            {hasCustomEquippedProp && onUnequipGeneratedWeapon && (
              <button
                onClick={onUnequipGeneratedWeapon}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-semibold cursor-pointer"
                title="Retirer l'objet équipé de la main droite du combattant"
              >
                <X className="w-3.5 h-3.5" />
                <span>Retirer de la main</span>
              </button>
            )}

            <button
              onClick={handleDownloadGLB}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer ml-auto"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.GLB</span>
            </button>

            <button
              onClick={handleDownloadOBJ}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.OBJ</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
