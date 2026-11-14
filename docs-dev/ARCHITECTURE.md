# Architecture et plan de refonte modulaire

État au 14 novembre 2026 (branche `fix/depot`). Source : audit technique du dépôt, plan en 8 étapes (0 à 7).
Principe : ne rien réécrire d'un bloc ; extraire, tester, puis partager. Effort : S < 1 j, M 1-3 j, L > 3 j.

## 1. Ce qui existe

| Zone | Contenu | Rôle |
|---|---|---|
| `docs/` | pages autonomes (`modele.html`, `atelier.html`, `3d.html`, `chaine3d.html` = redirection), `vendor/` (three r160), `exemple/`, `anims/`, `bank/`, `wardrobe/` | **site publié** par GitHub Pages (branche `main`, `/docs`) |
| `docs/index.html`, `docs/assets/` | build Vite de l'app React | **générés** par `npm run build`, jamais édités à la main |
| `src/` | app React 19 / TypeScript / Tailwind | « Studio » (`index.html`) |
| `server.ts` | Express + Gemini, optionnel | IA et export de paquets ; absent de GitHub Pages |
| `forge/`, `tools/` | Python | chaîne en ligne de commande |
| `tests/` | pytest + Playwright | filet de sécurité (branché dans `.github/workflows/ci.yml`) |

Flux de build : `index.html` (gabarit Vite, racine) + `src/` -> `vite build` -> `docs/index.html` + `docs/assets/` ; `server.ts` -> `dist/server.js` (esbuild). `vite.config.ts` : `base: './'`, `publicDir: false`, `outDir: docs`, `emptyOutDir: false` ; un petit plugin ne supprime avant chaque build que `docs/index.html` et `docs/assets/`.

Duplication connue (non résolue) : `modele.html` (JS monolithique) et `src/utils` (TypeScript) réimplémentent chacun le rendu de sprites, la quantification RGB565, le zip, la banque de personnages, la garde-robe et les animations.

## 2. Plan en 8 étapes et avancement

| # | Étape | Effort | Statut |
|---|---|---|---|
| 0 | **Filet de sécurité** : pytest + test Playwright de fumée en CI ; scripts `test_*.py` rendus collectables | M | **Fait** (`tests/test_animrules.py`, `tests/test_formats.py` : fonctions `test_*` + usage CLI conservé ; `tests/ui_pages.py` (pages, liens, mode statique, modal GitHub) ; `tests/ui_smoke_modele.py` (mannequin d'exemple) ; jobs `cpu-checks`, `app`, `ui`, `coherence` dans `ci.yml`). **Reste** : réparer les 13 `tests/ui_modele_*.py` (chemins `/tmp/ext/...` en dur, serveur manuel sur le port 8765) pour les brancher en CI avec le mannequin d'exemple ; test de non-régression par hash d'image de la planche. |
| 1 | **Une seule source des pages** | S | **Fait** : `public/` supprimé ; `docs/` = pages autonomes ; Vite écrit dans `docs/` sans effacer les pages ; `docs/3d.html` unique, `docs/chaine3d.html` = redirection ; navigation harmonisée (Studio / Fiche en pied / Modèle 3D → sprites / Chaîne 3D) ; `docs/README.md` dupliqué supprimé, `LICENSE` identique à `docs/LICENSE` (vérifié en CI). |
| 2 | **Déploiement Pages reproductible** | M | **Fait en grande partie** : `npm install` corrigé (`esbuild ^0.28`, peer de `vite@8`), `package-lock.json` versionné, `npm ci` en CI, deux builds successifs donnent des fichiers identiques ; `.github/workflows/pages.yml` (manuel, désactivé par défaut) ; mode « branche /docs » conservé. **Reste** : décider de bascule vers « GitHub Actions » (alors ne plus versionner `docs/assets/`, ajouter `docs/index.html` et `docs/assets/` au `.gitignore`). |
| 3 | **Extraire `modele.html` en modules ES** (`js/util.js`, `export.js`, `palette.js`, `sprites.js`, `bank.js`, `wardrobe.js`, `anims.js`, `rig.js`, `viewer.js`), un module par PR, test = hash de la planche du mannequin | L | **Non commencé** (hors périmètre de cette branche : `modele.html` est modifié par d'autres chantiers). Ordre de risque croissant conservé : fonctions pures (`to565`, `medianCut`, zip, `crc32`, GIF, atlas, en-têtes C) d'abord. |
| 4 | **Code partagé pages autonomes <-> React** : paquet `shared/` en ES modules sans DOM (`rgb565`, zip, atlas, palettes, quantification, GIF) | M | **Non commencé** (dépend de l'étape 3). |
| 5 | **Isoler l'app React** ; mode « sans serveur » explicite | M | **Fait pour le mode sans serveur** : `src/utils/serverApi.ts` (sonde `./api/health` en chemin relatif, `apiFetch`, messages d'erreur français, jeton optionnel) ; hook `src/hooks/useServerStatus.ts` ; bandeau et boutons désactivés ; modal « Publier GitHub » sans HTML brut ; avertissement visible quand la génération 3D IA se replie sur le procédural. **Reste** : dossier `app/` avec son propre `package.json` (non fait : déplacement risqué sans gain immédiat). |
| 6 | **Conventions** : Prettier + ESLint (+ `tsc`) en CI, `.editorconfig`, `ruff` pour `forge`, découpe de `ThreeCharacterViewport` | M | **Partiel** : `noUnusedLocals` activé dans `tsconfig.json` (imports et code mort retirés, `npm run lint` propre), 0 `any` dans `src/` (9 au départ), `ThreeCharacterViewport.tsx` 2 891 -> 2 043 lignes (constructeurs de scène extraits dans `src/utils/characterBuilders.ts`, type `CharacterRigBones` dans `src/types/rig.ts`), `App.tsx` allégé (`src/utils/sampleAssets.ts`, `src/utils/safeStorage.ts`, `src/hooks/usePersistedEffect.ts`). **Reste** : ESLint, Prettier, ruff ; hooks `useThreeScene` / `useRig` hors de `ThreeCharacterViewport` (2 043 lignes dont l'essentiel est un unique composant à nombreux `useEffect`) ; découper `App.tsx` (1 450 lignes, ~39 `useState`) en contextes / panneaux ; réparer les 2 imports dynamiques inefficaces (`visualHull3D`, `viewSegmentation` importés aussi statiquement) et ajouter `manualChunks` pour le bundle de 1,5 Mo. |
| 7 | **Sécurité** | S-M | **Serveur fait** : `server.ts` (voir §3). **Pages autonomes non faites ici** : échappement `esc()` des `innerHTML` et jeton GitHub en `sessionStorage` dans `modele.html` (confiés à l'agent « io-sécurité »). |

## 3. Serveur optionnel (`server.ts`)

- Jamais déployé par GitHub Pages ; lancé avec `npm run dev` (Vite en middleware) ou `npm run build && npm start` (`dist/server.js` + `docs/`).
- Variables : voir `.env.example`. `API_TOKEN` (optionnel) exige `X-Api-Token` sur `/api/*` sauf `/api/health` ; `GEMINI_MODEL` (défaut `gemini-3.8-flash`, modèle stable de la liste officielle ; l'ancien `gemini-4-hydrogen` n'y figure pas) ; `HOST` (défaut `127.0.0.1`) ; `MAX_BODY_MB` (défaut 8, au lieu de 50) ; `RATE_LIMIT_PER_MIN` / `EXPORT_RATE_LIMIT_PER_MIN` (limiteur en mémoire par IP).
- Entrées validées (type, taille, `mimeType` et `mode` en liste blanche, base64, longueur du prompt) ; erreurs en JSON français, jamais le message brut du SDK ; la clé n'est jamais renvoyée ni journalisée.
- `/api/export/github-pages-pack` ne lance plus `vite build` : il zippe `docs/` déjà compilé (mode « pages ») ou les sources (mode « source »), un export à la fois.

## 4. Tests

| Commande | Contenu |
|---|---|
| `python -m pytest tests` | unitaires Python (animrules, formats, meshclose) |
| `python -m pytest tests/ui_pages.py tests/ui_smoke_modele.py` | interface : Playwright + Chromium (rendu logiciel), `docs/` servi par `http.server` sans API |
| `npm run lint` | `tsc --noEmit` (avec `noUnusedLocals`) |
| `npm run build` | build app + serveur, reproductible |
