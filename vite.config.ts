import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Le build de l'app React écrit DANS docs/ (dossier servi par GitHub Pages, branche main /docs),
 * à côté des pages autonomes (modele.html, atelier.html, 3d.html, chaine3d.html, vendor/, exemple/,
 * anims/, bank/, wardrobe/...) que Vite ne doit jamais effacer ni écraser.
 *
 * Seuls les fichiers que Vite génère lui-même sont nettoyés avant chaque build : docs/index.html
 * et docs/assets/ (bundles JS/CSS hachés + images importées). Rien d'autre n'est touché.
 */
const docsDir = path.resolve(__dirname, 'docs');

function cleanAppOutput(): Plugin {
  return {
    name: 'character-forge:clean-app-output',
    apply: 'build',
    buildStart() {
      fs.rmSync(path.join(docsDir, 'assets'), {recursive: true, force: true});
      fs.rmSync(path.join(docsDir, 'index.html'), {force: true});
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    // docs/ contient déjà les pages autonomes : pas de dossier public/ à recopier.
    publicDir: false as const,
    plugins: [react(), tailwindcss(), cleanAppOutput()],
    build: {
      outDir: docsDir,
      emptyOutDir: false,
      chunkSizeWarningLimit: 1600,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
