import React, { useState } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Download,
  Sword,
  Compass,
  Terminal,
  FileCode,
  UserCheck,
} from 'lucide-react';
import { CharacterProfile } from '../types/assets';

interface Props {
  profile?: CharacterProfile;
  characterImage?: string;
  palette?: string[];
  onOpen3DView: () => void;
}

export const CharacterAIDeck: React.FC<Props> = ({
  profile,
  characterImage,
  palette = [],
  onOpen3DView,
}) => {
  const [activeStage, setActiveStage] = useState<'stage1_2d' | 'stage2_3d' | 'vrm_spec' | 'scripts'>('stage1_2d');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fallbackProfile: CharacterProfile = {
    name: 'Gruumshka the Untamed',
    hair: 'Tresses argentées nordiques avec perles de combat',
    eyes: 'Vert émeraude perçant',
    outfit: 'Cuir bouilli renforcé, spalière forgée tête d’ours, cape forestière',
    weapons: ['Épée runique à deux mains gravée', 'Dague de combat au fourreau'],
    dominantStyle: 'Bande Dessinée Fantasy héroïque européenne (ligne claire & ombrage hachuré)',
    turnaroundPrompts: {
      front: 'Canonical orthographic front view of fantasy warrior heroine Gruumshka in neutral A-pose, arms angled 45 degrees, silver braided hair, detailed leather armor, bear shoulder pauldron, green cloak, white clean background.',
      left_profile: 'Canonical orthographic left side profile view of fantasy warrior Gruumshka, silver hair braids draped, leather armor side straps, long sword scabbard at hip, orthographic projection.',
      right_profile: 'Canonical orthographic right side profile view of fantasy warrior Gruumshka, bear pauldron profile, leather bracer, neutral canonical posture, orthographic.',
      three_quarter: 'Canonical three-quarter dynamic angle view of Gruumshka in A-pose, showcasing layered leather cuirass depth, green cape drape, and runic blade hilt.',
      back: 'Canonical orthographic rear back view of warrior Gruumshka, green cloak folds, hair braids down the spine, scabbard belt harness, boots back heel.',
    },
  };

  const activeProfile = profile || fallbackProfile;
  const turnarounds = activeProfile.turnaroundPrompts || fallbackProfile.turnaroundPrompts!;

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const views: Array<{ key: keyof typeof turnarounds; title: string; angle: string; badge: string }> = [
    { key: 'front', title: '01. Vue de Face (Front)', angle: 'Angle 0° · A-Pose', badge: 'Canonical Front' },
    { key: 'left_profile', title: '02. Profil Gauche (Left)', angle: 'Angle -90° · Orthographique', badge: 'Silhouette' },
    { key: 'right_profile', title: '03. Profil Droit (Right)', angle: 'Angle +90° · Orthographique', badge: 'Équipements' },
    { key: 'three_quarter', title: '04. Perspective 3/4', angle: 'Angle +45° · Volume', badge: 'Profondeur' },
    { key: 'back', title: '05. Vue Arrière (Back)', angle: 'Angle 180° · Orthographique', badge: 'Cape & Dos' },
  ];

  // Download VRM Metadata JSON
  const handleDownloadVRMMeta = () => {
    const vrmJson = {
      specVersion: '1.0',
      meta: {
        name: activeProfile.name || 'Hero Avatar',
        version: '1.0.0',
        authors: ['Asset Recovery Agent & CharacterGen Studio'],
        licenseUrl: 'https://vrm.dev/licenses/1.0/',
      },
      humanoid: {
        humanBones: {
          hips: { node: 0 },
          spine: { node: 1 },
          chest: { node: 2 },
          neck: { node: 3 },
          head: { node: 4 },
          leftUpperArm: { node: 5 },
          leftLowerArm: { node: 6 },
          leftHand: { node: 7 },
          rightUpperArm: { node: 8 },
          rightLowerArm: { node: 9 },
          rightHand: { node: 10 },
          leftUpperLeg: { node: 11 },
          leftLowerLeg: { node: 12 },
          leftFoot: { node: 13 },
          rightUpperLeg: { node: 14 },
          rightLowerLeg: { node: 15 },
          rightFoot: { node: 16 },
        },
      },
      expressions: {
        preset: {
          neutral: { isBinary: false },
          happy: { isBinary: false },
          angry: { isBinary: false },
          blink: { isBinary: true },
        },
      },
      characterGen: {
        canonicalPose: 'A-Pose (MV-PC)',
        views: Object.keys(turnarounds),
        palette,
        attributes: activeProfile,
      },
    };

    const blob = new Blob([JSON.stringify(vrmJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeProfile.name || 'avatar').replace(/[^a-zA-Z0-9_-]/g, '_')}_vrm_spec.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Compass className="w-5 h-5 text-sky-400" />
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">
              Architecture CharacterGen (SIGGRAPH 2024 / GitHub)
            </h3>
            <p className="text-xs text-slate-400">
              Pipeline 2-Stage : Canonicalisation de Pose 2D & Maillage 3D VRM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Pipeline 3D VRM Connecté</span>
        </div>
      </div>

      {/* Stage Navigation Pills */}
      <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveStage('stage1_2d')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeStage === 'stage1_2d' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Stage 1 : 5 Vues Canoniques 2D</span>
        </button>
        <button
          onClick={() => setActiveStage('stage2_3d')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeStage === 'stage2_3d' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Stage 2 : Reconstruction 3D & Rig</span>
        </button>
        <button
          onClick={() => setActiveStage('vrm_spec')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeStage === 'vrm_spec' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Spécification VRM 1.0</span>
        </button>
        <button
          onClick={() => setActiveStage('scripts')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeStage === 'scripts' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Scripts Blender & Three.js</span>
        </button>
      </div>

      {/* Tab 1: Stage 1 - 2D Multi-View Pose Canonicalization */}
      {activeStage === 'stage1_2d' && (
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/50 text-xs text-sky-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Pose Canonicalization (MV-PC)</strong> : Les poses complexes ou asymétriques sont
                standardisées en A-Pose canonique (bras à 45°, pieds écartés) pour garantir la reconstruction 3D sans distorsion.
              </span>
            </div>
            <span className="font-mono text-[10px] text-sky-400 px-2 py-0.5 rounded bg-sky-900/60 shrink-0">
              5 Angles Normalisés
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {views.map((v) => {
              const promptText = turnarounds[v.key] || '';
              const isCopied = copiedKey === v.key;

              return (
                <div
                  key={v.key}
                  className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-100">{v.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{v.angle}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(v.key, promptText)}
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                        title="Copier le prompt canonique"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 italic line-clamp-3 leading-relaxed">
                      "{promptText}"
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[10px]">
                    <span className="text-sky-400 font-mono">{v.badge}</span>
                    <span className="text-slate-500">CharacterGen Ready</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Stage 2 - 3D Reconstruction & Rig */}
      {activeStage === 'stage2_3d' && (
        <div className="flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Visual Portrait */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                Asset Source & Palette
              </span>
              {characterImage && (
                <div className="w-full h-44 rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                  <img
                    src={characterImage}
                    alt={activeProfile.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-bold text-slate-100 text-sm">{activeProfile.name || 'Hero'}</span>
                <span className="text-slate-400 text-[11px]">{activeProfile.dominantStyle}</span>
              </div>
            </div>

            {/* Anatomical Rig Specifications */}
            <div className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
              <span className="font-bold text-slate-200">
                Hiérarchie Squelettique & Maillage Humanoïde Reconstruit :
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-300">
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Tête & Cheveux</span>
                  <span className="font-medium text-slate-100">{activeProfile.hair || 'N/A'}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Yeux & Regard</span>
                  <span className="font-medium text-emerald-400">{activeProfile.eyes || 'N/A'}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800 sm:col-span-2">
                  <span className="text-slate-500 block text-[10px]">Armure & Tenue</span>
                  <span className="font-medium text-slate-100">{activeProfile.outfit || 'N/A'}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px] mb-1">
                    <Sword className="w-3 h-3 text-amber-400" />
                    <span>Équipements & Armes Attachés au Rig</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeProfile.weapons || ['Épée', 'Dague']).map((w, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-[11px]"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-400 text-[11px]">
                  Bones détectés : Hips, Spine, Chest, Shoulders, Arms, Hands, Legs, Feet
                </span>
                <button
                  onClick={onOpen3DView}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium text-xs transition-colors"
                >
                  Tester les animations dans le Viewport →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: VRM 1.0 Specification */}
      {activeStage === 'vrm_spec' && (
        <div className="flex flex-col gap-3 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
            <div>
              <span className="font-bold text-slate-200 block mb-0.5">
                Spécification VRM Humanoid 1.0 (VRM / Vroid Standard)
              </span>
              <p className="text-slate-400 text-[11px]">
                Fichier de configuration de mapping osseux et morph targets conforme à la norme VRM pour Unity, Godot et Blender.
              </p>
            </div>
            <button
              onClick={handleDownloadVRMMeta}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Télécharger vrm_spec.json</span>
            </button>
          </div>

          <pre className="font-mono text-[11px] text-sky-300 bg-slate-950 p-3.5 rounded-xl border border-slate-800 overflow-x-auto max-h-60 leading-relaxed">
            <code>{`{
  "specVersion": "1.0",
  "meta": { "name": "${activeProfile.name}", "authors": ["CharacterGen Pipeline"] },
  "humanoid": {
    "humanBones": {
      "hips": { "node": "root_hips" },
      "spine": { "node": "spine_01" },
      "chest": { "node": "chest_02" },
      "head": { "node": "head" },
      "leftUpperArm": { "node": "shoulder_L" },
      "rightUpperArm": { "node": "shoulder_R" }
    }
  },
  "expressions": { "preset": { "neutral": {}, "joy": {}, "angry": {}, "blink": {} } }
}`}</code>
          </pre>
        </div>
      )}

      {/* Tab 4: Blender & Three.js CLI Scripts */}
      {activeStage === 'scripts' && (
        <div className="flex flex-col gap-3 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="font-bold text-slate-200 block mb-1">
              Commandes d'Exécution & Scripts Automatisés CharacterGen (GitHub)
            </span>
            <p className="text-slate-400 text-[11px]">
              Commandes pour exécuter le pipeline complet, le rendu Blender sans interface ou le visualiseur Three.js.
            </p>
          </div>

          <div className="space-y-3 font-mono text-[11px]">
            {/* Command 1: Full pipeline */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">1. Lancement du serveur WebUI :</span>
                <span className="text-sky-300">pip install -r requirements.txt && python webui.py</span>
              </div>
              <button
                onClick={() => handleCopy('cmd1', 'pip install -r requirements.txt && python webui.py')}
                className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              >
                {copiedKey === 'cmd1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Command 2: Blender automated render */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">2. Rendu automatique VRM via Blender :</span>
                <span className="text-amber-300">blender -b --python render_script/blender/render.py -- --vrm character.vrm</span>
              </div>
              <button
                onClick={() =>
                  handleCopy('cmd2', 'blender -b --python render_script/blender/render.py -- --vrm character.vrm')
                }
                className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              >
                {copiedKey === 'cmd2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Command 3: Three.js web preview */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">3. Rendu Web ultra-rapide Three.js (@pixiv/three-vrm) :</span>
                <span className="text-emerald-300">node render_script/three/render.js --input ./character.vrm --views 5</span>
              </div>
              <button
                onClick={() =>
                  handleCopy('cmd3', 'node render_script/three/render.js --input ./character.vrm --views 5')
                }
                className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              >
                {copiedKey === 'cmd3' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
