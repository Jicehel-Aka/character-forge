import React, { useRef, useState } from 'react';
import {
  Accessibility,
  ArrowLeftRight,
  BookmarkPlus,
  Download,
  Play,
  RotateCcw,
  Sliders,
  Trash2,
  Upload,
} from 'lucide-react';
import { POSE_LIBRARY, mirrorPoseJoints } from '../data/poseLibrary';
import {
  CharacterPosePreset,
  NEUTRAL_POSE_JOINTS,
  PoseCategory,
  PoseJointMap,
} from '../types/poses';

interface Props {
  activePoseId: string | null;
  poseJoints: PoseJointMap;
  isPoseModeActive: boolean;
  onSelectPose: (pose: CharacterPosePreset) => void;
  onUpdateJoints: (joints: PoseJointMap) => void;
  onResumeAnimationMode: () => void;
  customPoses: CharacterPosePreset[];
  onSaveCustomPose: (name: string, joints: PoseJointMap) => void;
  onDeleteCustomPose: (id: string) => void;
  onImportCustomPose: (pose: CharacterPosePreset) => void;
}

const CATEGORIES: Array<{ id: PoseCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'combat', label: 'Combat' },
  { id: 'action', label: 'Action' },
  { id: 'attitude', label: 'Attitude' },
  { id: 'magie', label: 'Magie' },
  { id: 'perso', label: 'Perso' },
];

export const PoseLibraryPanel: React.FC<Props> = ({
  activePoseId,
  poseJoints,
  isPoseModeActive,
  onSelectPose,
  onUpdateJoints,
  onResumeAnimationMode,
  customPoses,
  onSaveCustomPose,
  onDeleteCustomPose,
  onImportCustomPose,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<PoseCategory | 'all'>('all');
  const [showSliders, setShowSliders] = useState<boolean>(true);
  const [customName, setCustomName] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const allPoses = [...POSE_LIBRARY, ...customPoses];
  const filteredPoses =
    categoryFilter === 'all' ? allPoses : allPoses.filter((p) => p.category === categoryFilter);

  const updateJointAxis = (
    joint: Exclude<keyof PoseJointMap, 'torsoYOffset'>,
    axis: 'rx' | 'ry' | 'rz',
    val: number
  ) => {
    onUpdateJoints({
      ...poseJoints,
      [joint]: {
        ...poseJoints[joint],
        [axis]: val,
      },
    });
  };

  const handleMirror = () => {
    onUpdateJoints(mirrorPoseJoints(poseJoints));
    setFeedback('Symétrie Gauche ↔ Droite inversée');
    setTimeout(() => setFeedback(null), 2200);
  };

  const handleReset = () => {
    onUpdateJoints({ ...NEUTRAL_POSE_JOINTS });
    setFeedback('Articulations réinitialisées');
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleSave = () => {
    const cleanName = customName.trim() || `Pose Perso ${customPoses.length + 1}`;
    onSaveCustomPose(cleanName, poseJoints);
    setCustomName('');
    setCategoryFilter('perso');
    setFeedback(`Pose "${cleanName}" enregistrée`);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleExportPoseJSON = () => {
    const activePreset = allPoses.find((p) => p.id === activePoseId);
    const payload = {
      format: 'CharacterGenPose3D',
      version: '1.0.0',
      name: activePreset?.name || 'Pose_Personnalisee',
      exportedAt: new Date().toISOString(),
      joints: poseJoints,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_pose.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPoseJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || '{}'));
        if (data?.joints && data.joints.torso && data.joints.armLeft) {
          const imported: CharacterPosePreset = {
            id: `pose_import_${Date.now()}`,
            name: data.name || file.name.replace(/\.json$/i, ''),
            category: 'perso',
            categoryLabel: 'Perso',
            description: 'Pose importée depuis un fichier JSON.',
            icon: '📥',
            joints: data.joints,
            isCustom: true,
          };
          onImportCustomPose(imported);
          onSelectPose(imported);
          setCategoryFilter('perso');
          setFeedback(`Pose "${imported.name}" importée`);
          setTimeout(() => setFeedback(null), 2500);
        } else {
          setFeedback('Fichier JSON invalide : structure articulaire manquante.');
        }
      } catch {
        setFeedback('Impossible de lire ce fichier JSON de pose.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-3.5 text-xs text-slate-200">
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        onChange={handleImportPoseJSON}
        className="hidden"
      />

      {/* Header */}
      <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Accessibility className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-white">Bibliothèque de Positions 3D</h3>
              <p className="text-[11px] text-slate-400">
                {allPoses.length} positions articulées (coudes, genoux, buste) applicables en 1 clic
              </p>
            </div>
          </div>

          {isPoseModeActive ? (
            <button
              onClick={onResumeAnimationMode}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-semibold text-[11px] transition-colors cursor-pointer"
              title="Revenir aux animations cycliques du viewport"
            >
              <Play className="w-3 h-3" />
              <span>Reprendre Anim</span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded-md">
              Mode Anim actif
            </span>
          )}
        </div>

        {/* Quick Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
          <button
            onClick={handleMirror}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
            title="Inverser symétriquement les bras et jambes Gauche ↔ Droite"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
            <span>Miroir G↔D</span>
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Neutre</span>
          </button>

          <button
            onClick={handleExportPoseJSON}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Importer</span>
          </button>
        </div>

        {feedback && (
          <div className="px-2.5 py-1.5 rounded-lg bg-sky-950/70 border border-sky-500/40 text-sky-200 text-[11px]">
            {feedback}
          </div>
        )}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={`px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              categoryFilter === cat.id
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {cat.label}
            {cat.id === 'perso' && customPoses.length > 0 ? ` (${customPoses.length})` : ''}
          </button>
        ))}
      </div>

      {/* Pose Presets Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filteredPoses.map((pose) => {
          const isSelected = isPoseModeActive && activePoseId === pose.id;
          return (
            <div
              key={pose.id}
              onClick={() => onSelectPose(pose)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                isSelected
                  ? 'bg-sky-950/60 border-sky-400 ring-1 ring-sky-400/40 shadow-md'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
              }`}
              title={pose.description}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base leading-none shrink-0">{pose.icon}</span>
                  <span className="font-bold text-slate-100 truncate">{pose.name}</span>
                </div>
                {pose.isCustom && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCustomPose(pose.id);
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                    title="Supprimer cette pose personnalisée"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug">
                {pose.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Save Current Pose as Custom Preset */}
      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-2">
        <input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Nom de la pose personnalisée..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors shrink-0 cursor-pointer"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
          <span>Sauver</span>
        </button>
      </div>

      {/* Fine Articulation Sliders */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSliders(!showSliders)}
          className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>Réglage Fin des Articulations (Degrés)</span>
          </div>
          <span className="text-[11px] text-slate-400">{showSliders ? 'Masquer' : 'Afficher'}</span>
        </button>

        {showSliders && (
          <div className="p-3 pt-1 border-t border-slate-800 flex flex-col gap-3">
            {/* Torso Height & Tilt */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Hauteur Centre (Y)</span>
                  <span className="font-mono text-sky-400">{poseJoints.torsoYOffset.toFixed(2)}m</span>
                </div>
                <input
                  type="range"
                  min="-0.35"
                  max="0.30"
                  step="0.01"
                  value={poseJoints.torsoYOffset}
                  onChange={(e) =>
                    onUpdateJoints({ ...poseJoints, torsoYOffset: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Inclinaison Torse (X)</span>
                  <span className="font-mono text-sky-400">{poseJoints.torso.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="55"
                  step="1"
                  value={poseJoints.torso.rx}
                  onChange={(e) => updateJointAxis('torso', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Torsion Torse (Y)</span>
                  <span className="font-mono text-sky-400">{poseJoints.torso.ry}°</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  step="1"
                  value={poseJoints.torso.ry}
                  onChange={(e) => updateJointAxis('torso', 'ry', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Orientation Tête (Y)</span>
                  <span className="font-mono text-sky-400">{poseJoints.head.ry}°</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  step="1"
                  value={poseJoints.head.ry}
                  onChange={(e) => updateJointAxis('head', 'ry', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Arms & Elbows */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-900">
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Épaule Gauche (Av/Ar)</span>
                  <span className="font-mono text-sky-400">{poseJoints.armLeft.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-150"
                  max="80"
                  step="1"
                  value={poseJoints.armLeft.rx}
                  onChange={(e) => updateJointAxis('armLeft', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Épaule Droite (Av/Ar)</span>
                  <span className="font-mono text-sky-400">{poseJoints.armRight.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-150"
                  max="80"
                  step="1"
                  value={poseJoints.armRight.rx}
                  onChange={(e) => updateJointAxis('armRight', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Épaule Gauche (Écart)</span>
                  <span className="font-mono text-sky-400">{poseJoints.armLeft.rz}°</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="155"
                  step="1"
                  value={poseJoints.armLeft.rz}
                  onChange={(e) => updateJointAxis('armLeft', 'rz', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Épaule Droite (Écart)</span>
                  <span className="font-mono text-sky-400">{poseJoints.armRight.rz}°</span>
                </div>
                <input
                  type="range"
                  min="-155"
                  max="20"
                  step="1"
                  value={poseJoints.armRight.rz}
                  onChange={(e) => updateJointAxis('armRight', 'rz', parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Flexion Coude Gauche</span>
                  <span className="font-mono text-purple-400">{poseJoints.elbowLeft.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-135"
                  max="10"
                  step="1"
                  value={poseJoints.elbowLeft.rx}
                  onChange={(e) => updateJointAxis('elbowLeft', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Flexion Coude Droit</span>
                  <span className="font-mono text-purple-400">{poseJoints.elbowRight.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-135"
                  max="10"
                  step="1"
                  value={poseJoints.elbowRight.rx}
                  onChange={(e) => updateJointAxis('elbowRight', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Legs & Knees */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-900">
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Hanche Gauche (Av/Ar)</span>
                  <span className="font-mono text-amber-400">{poseJoints.legLeft.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-105"
                  max="70"
                  step="1"
                  value={poseJoints.legLeft.rx}
                  onChange={(e) => updateJointAxis('legLeft', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Hanche Droite (Av/Ar)</span>
                  <span className="font-mono text-amber-400">{poseJoints.legRight.rx}°</span>
                </div>
                <input
                  type="range"
                  min="-105"
                  max="70"
                  step="1"
                  value={poseJoints.legRight.rx}
                  onChange={(e) => updateJointAxis('legRight', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Flexion Genou Gauche</span>
                  <span className="font-mono text-emerald-400">{poseJoints.kneeLeft.rx}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="130"
                  step="1"
                  value={poseJoints.kneeLeft.rx}
                  onChange={(e) => updateJointAxis('kneeLeft', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                  <span>Flexion Genou Droit</span>
                  <span className="font-mono text-emerald-400">{poseJoints.kneeRight.rx}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="130"
                  step="1"
                  value={poseJoints.kneeRight.rx}
                  onChange={(e) => updateJointAxis('kneeRight', 'rx', parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
