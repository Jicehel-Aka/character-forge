import React, { useEffect, useState } from 'react';
import {
  X,
  FolderArchive,
  ExternalLink,
  Copy,
  Check,
  GitBranch,
  Sparkles,
  Code2,
  Rocket,
  AlertCircle,
} from 'lucide-react';

import { useServerStatus } from '../hooks/useServerStatus';
import { apiFetch, readApiError, MSG_STATIC_MODE } from '../utils/serverApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'character_forge_github_target_v1';

export const GitHubPublishModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [owner, setOwner] = useState<string>('Jicehel-Aka');
  const [repo, setRepo] = useState<string>('character-forge');
  const [branch, setBranch] = useState<string>('main');
  const [isDownloading, setIsDownloading] = useState<'pages' | 'source' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedGit, setCopiedGit] = useState<boolean>(false);
  const serverStatus = useServerStatus();
  const noServer = serverStatus.checked && !serverStatus.reachable;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.owner) setOwner(parsed.owner);
        if (parsed.repo) setRepo(parsed.repo);
        if (parsed.branch) setBranch(parsed.branch);
      }
    } catch {
      // ignore storage read error
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, repo, branch }));
    } catch {
      // ignore storage write error
    }
  }, [owner, repo, branch]);

  if (!isOpen) return null;

  const cleanOwner = owner.trim() || 'Jicehel-Aka';
  const cleanRepo = repo.trim() || 'character-forge';
  const cleanBranch = branch.trim() || 'main';

  const repoUrl = `https://github.com/${cleanOwner}/${cleanRepo}`;
  const uploadUrl = `${repoUrl}/upload/${cleanBranch}`;
  const pagesUrl = `https://${cleanOwner}.github.io/${cleanRepo}/`;

  const gitSnippet = `# Dans le dossier de ton dépôt existant ${cleanOwner}/${cleanRepo} :
git clone ${repoUrl}.git
cd ${cleanRepo}
# Pack Pages : décompresse l'archive DANS le dossier docs/ (GitHub Pages sert docs/)
# Pack Sources : décompresse à la racine du dépôt
git add -A
git commit -m "Fusion Studio 3D HD + Sprites 8 directions + Outils GitHub"
git push origin ${cleanBranch}`;

  const handleDownloadPack = async (mode: 'pages' | 'source') => {
    setErrorMsg(null);
    if (noServer) {
      setStatusMsg(null);
      setErrorMsg(MSG_STATIC_MODE + ' Pour fabriquer un pack : lance le serveur local (npm install puis npm run dev), ou télécharge directement le dépôt depuis GitHub (Code > Download ZIP).');
      return;
    }
    setIsDownloading(mode);
    setStatusMsg(
      mode === 'pages'
        ? 'Compilation du Studio complet fusionné (Vite + 3D HD + Sprites) et création du pack GitHub Pages...'
        : 'Préparation de l’archive code source complet + workflow GitHub Actions...'
    );

    try {
      const qs = new URLSearchParams({
        mode,
        owner: cleanOwner,
        repo: cleanRepo,
      });
      const resp = await apiFetch(`api/export/github-pages-pack?${qs.toString()}`);
      if (!resp.ok) {
        throw new Error(await readApiError(resp));
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        mode === 'pages'
          ? `${cleanRepo}-github-pages-ready.zip`
          : `${cleanOwner}-${cleanRepo}-full-source.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setStatusMsg(
        mode === 'pages'
          ? `✅ Pack GitHub Pages prêt ! Glissez son contenu dans ${cleanOwner}/${cleanRepo} (branche ${cleanBranch}).`
          : `✅ Archive source complète + workflow GitHub Actions téléchargée pour ${cleanOwner}/${cleanRepo} !`
      );
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Impossible de générer le pack. Lance le serveur local (npm run dev).'
      );
      setStatusMsg(null);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleCopyGit = async () => {
    await navigator.clipboard.writeText(gitSnippet);
    setCopiedGit(true);
    setTimeout(() => setCopiedGit(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                Publier vers ton dépôt GitHub existant
              </h3>
              <p className="text-xs text-slate-400">
                Exporte l&apos;ensemble des améliorations fusionnées (Studio 3D HD + Sprites + pages HTML) pour{' '}
                <span className="text-amber-300 font-mono">
                  {cleanOwner}/{cleanRepo}
                </span>
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

        {/* Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4 modal-scroll-body text-xs">
          {/* Why notice */}
          <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-100 flex items-start gap-2.5 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <div>
                <strong className="text-amber-300">Pourquoi AI Studio veut créer un nouveau dépôt :</strong> le bouton{' '}
                <em>« Save to GitHub »</em> tout en haut de la fenêtre appartient à l&apos;interface Google AI Studio : aucun code de l&apos;application ne peut le rediriger vers un dépôt non lié au départ.
              </div>
              <div className="text-sky-200">
                <strong className="text-white">Pour mettre à jour {cleanOwner}/{cleanRepo} sans créer de nouveau dépôt (sans terminal) :</strong>
                <ol className="list-decimal list-inside mt-1 space-y-0.5 text-[11px] text-slate-200">
                  <li>Clique sur <strong>« Télécharger Pack Pages (.zip) »</strong> (ou <em>Sources</em>) ci-dessous et décompresse le ZIP sur ton PC.</li>
                  <li>Clique sur <strong>« Ouvrir Upload Files sur {cleanRepo} »</strong> (ouvre directement ton dépôt existant).</li>
                  <li>Glisse les fichiers décompressés sur la page GitHub puis clique <strong>Commit changes</strong> sur <code className="text-amber-300">{cleanBranch}</code> : ton site <span className="font-mono text-sky-300">{pagesUrl}</span> se met à jour tout seul !</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Target Existing Repo Configuration */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                <span>Dépôt GitHub cible (existant)</span>
              </span>
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
              >
                <span>Ouvrir sur GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-slate-400">
                <span>Compte / Organisation</span>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 text-slate-400">
                <span>Nom du dépôt existant</span>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 text-slate-400">
                <span>Branche</span>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                />
              </label>
            </div>
          </div>

          {noServer && (
            <div
              role="status"
              data-testid="github-static-notice"
              className="p-3 rounded-xl bg-amber-950/50 border border-amber-700/50 text-amber-100 leading-relaxed"
            >
              {MSG_STATIC_MODE} Les boutons de téléchargement ci-dessous sont donc désactivés ; les liens GitHub fonctionnent normalement.
            </div>
          )}
          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* Two Ready-to-Publish Packages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Pack 1: Compiled GitHub Pages Ready */}
            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Pack GitHub Pages Prêt</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                    Recommandé
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Archive le site déjà compilé (<code className="text-slate-200">docs/</code>) avec <code className="text-slate-200">modele.html</code>,{' '}
                  <code className="text-slate-200">atelier.html</code>, <code className="text-slate-200">3d.html</code>,{' '}
                  <code className="text-slate-200">exemple/mannequin.glb</code>, <code className="text-slate-200">.nojekyll</code> et <code className="text-slate-200">README.md</code>. Fonctionne immédiatement sur GitHub Pages.
                </p>
              </div>
              <button
                onClick={() => handleDownloadPack('pages')}
                disabled={isDownloading !== null || noServer}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <FolderArchive className="w-4 h-4" />
                <span>
                  {isDownloading === 'pages' ? 'Compilation en cours...' : 'Télécharger Pack Pages (.zip)'}
                </span>
              </button>
            </div>

            {/* Pack 2: Full React Source + CI */}
            <div className="bg-slate-950 border border-slate-700 rounded-xl p-3.5 flex flex-col justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-300 flex items-center gap-1.5">
                    <Code2 className="w-4 h-4" />
                    <span>Code Source + Actions CI</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono">
                    Dev / Git
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Contient tout le code TypeScript/React (<code className="text-slate-200">src/</code>,{' '}
                  <code className="text-slate-200">server.ts</code>, <code className="text-slate-200">docs/</code>) + workflows{' '}
                  <code className="text-slate-200">.github/workflows/</code> (dont <code className="text-slate-200">pages.yml</code>, désactivé par défaut : le site est servi depuis <code className="text-slate-200">docs/</code> sur <code className="text-slate-200">{cleanBranch}</code>).
                </p>
              </div>
              <button
                onClick={() => handleDownloadPack('source')}
                disabled={isDownloading !== null || noServer}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <FolderArchive className="w-4 h-4 text-sky-400" />
                <span>
                  {isDownloading === 'source' ? 'Création archive...' : 'Télécharger Sources (.zip)'}
                </span>
              </button>
            </div>
          </div>

          {/* Step-by-step publish instructions */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-200">
                Envoyer dans ton dépôt existant ({cleanOwner}/{cleanRepo})
              </span>
              <a
                href={uploadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
              >
                <span>Ouvrir Upload Files sur {cleanRepo}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="relative">
              <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                {gitSnippet}
              </pre>
              <button
                onClick={handleCopyGit}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] cursor-pointer"
              >
                {copiedGit ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedGit ? 'Copié' : 'Copier Git'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
