# character-forge

Transforme un modèle 3D de personnage (GLB / FBX / OBJ) en **planches de sprites 2D** : squelette, animations, 8 directions, palette RGB565 pour la console Gamebuino AKA ou n'importe quel moteur (Godot, Unity, Defold, Phaser...). Tout se fait dans le navigateur, sans rien installer. Le site est publié sur GitHub Pages (`docs/`).

**Essayer tout de suite :** ouvre la page *Modèle 3D → sprites* (`modele.html`) et clique sur **Essayer avec un exemple** (petit mannequin libre de droits CC0, déjà équipé d'un squelette et des animations Idle et Walk).

## Ce que fait l'outil

1. **Ouvrir un modèle** : GLB (conseillé), FBX ou OBJ, par exemple rapporté de Meshy, Mixamo, ou généré depuis des photos multi-vues.
2. **Squelette** : pose automatique d'un squelette humanoïde standard, ou reprise de celui d'un autre fichier.
3. **Animations** : celles du fichier, des FBX/GLB Mixamo, des packs .zip, ou des animations calculées (échelle, corde).
4. **Sprites & Palettes** : 8 directions, 48 / 64 / 96 / 128 px, palette commune ou préréglages pixel-art (Game Boy, PICO-8, NES, Gamebuino RGB565), contour sombre automatique, fond transparent ou magenta.
5. **Exporter** : paquet .zip complet, planche PNG, atlas JSON (compatible Aseprite / Godot / Unity), GIF animé, images séparées, `.raw` RGB565, en-tête C (`.h`), et **le modèle animé en GLB** (bouton *Modèle animé (GLB)*).

## Pages du site

Le site est **statique** et sert le dossier `docs/` (GitHub Pages, branche `main`, dossier `/docs`). Aucune page ne nécessite de serveur, sauf quelques fonctions de l'app React (voir « Sans serveur »).

| Page | Nom dans la navigation | Rôle |
|---|---|---|
| `docs/index.html` | **Studio** | App React / Vite / Tailwind : analyse et découpe d'images, mannequin 3D, garde-robe, vues multiples, forge 3D, export |
| `docs/atelier.html` | **Fiche en pied** | Page autonome : détourage, pose T, vues de face / profil / dos, calibration |
| `docs/modele.html` | **Modèle 3D → sprites** | Page autonome : moteur 3D, squelette, animations, sprites 8 directions, exports |
| `docs/3d.html` | **Chaîne 3D** | Documentation de la chaîne complète et commandes `forge …` (`chaine3d.html` redirige vers elle) |
| `docs/exemple/mannequin.glb` | | Mannequin CC0 d'exemple prêt à animer (1 clic dans `modele.html`) |

## Structure du dépôt

```
docs/            site publié (GitHub Pages) : pages autonomes + build de l'app React
  index.html, assets/   ← GÉNÉRÉS par « npm run build » (ne pas éditer à la main)
  atelier.html, modele.html, 3d.html, chaine3d.html, vendor/, exemple/, anims/, bank/, wardrobe/   ← sources, éditées à la main
src/             sources de l'app React (TypeScript) ; index.html (racine) = gabarit Vite
server.ts        serveur Express OPTIONNEL (IA Gemini, export de paquets) ; jamais déployé sur GitHub Pages
forge/, tools/   outils Python en ligne de commande (python -m forge ...)
tests/           tests Python (pytest) et tests d'interface (Playwright)
docs-dev/        documentation de développement (ARCHITECTURE.md : plan de refonte)
.github/workflows/   ci.yml (tests), pages.yml (déploiement par Actions, désactivé par défaut), gpu-3d.yml
```

Il n'y a **plus** de dossier `public/` : `docs/` est l'unique source des pages autonomes (Vite est configuré avec `publicDir: false`).

## Développer et compiler l'app React

Prérequis : Node.js 20 ou plus.

```bash
npm ci                # dépendances exactes (package-lock.json)
npm run lint          # vérification des types (tsc)
npm run build         # app React -> docs/index.html + docs/assets/ ; serveur -> dist/server.js
npm run dev           # serveur local (Express + Vite) sur http://127.0.0.1:3000
```

`npm run build` ne supprime jamais les pages autonomes : seuls `docs/index.html` et `docs/assets/` sont régénérés (build reproductible : deux builds donnent les mêmes fichiers). Après une modification de `src/`, relance-le et commit `docs/index.html` et `docs/assets/`.

Pour le serveur local (fonctions IA) : copie `.env.example` en `.env`, renseigne `GEMINI_API_KEY` (le modèle par défaut est `gemini-3.8-flash`, modifiable par `GEMINI_MODEL`), et si le serveur est accessible à d'autres personnes définis aussi `API_TOKEN`. Le serveur n'écoute qu'en local par défaut (`HOST`), limite la taille des requêtes (8 Mo) et le débit, et ne renvoie jamais la clé.

## Mise en ligne (GitHub Pages)

**Mode actuel (par défaut)** : `Settings > Pages > Source : Deploy from a branch`, branche `main`, dossier **`/docs`**. Le site publié est exactement le contenu committé de `docs/`. Pour le mettre à jour : `npm run build`, commit, push.

**Mode alternatif (Actions)** : le workflow `.github/workflows/pages.yml` (désactivé par défaut, lancement manuel seulement) recompile l'app puis déploie `docs/`. Pour l'activer : `Settings > Pages > Source : GitHub Actions`, puis lancer le workflow depuis l'onglet Actions (ou décommenter le déclencheur `push` dans le fichier). Pour revenir au mode précédent, remettre la source sur « Deploy from a branch ».

## Sans serveur (GitHub Pages) : ce qui marche et ce qui ne marche pas

GitHub Pages ne sert que des fichiers. L'app détecte l'absence de serveur (sonde `./api/health`) et passe en **mode statique** : un bandeau l'indique.

| Fonction | Sans serveur |
|---|---|
| Pages `modele.html`, `atelier.html`, `3d.html` | complètes |
| Studio : découpe heuristique, mannequin 3D, garde-robe, vues multiples, forge procédurale, exports ZIP / PNG / RGB565 | disponibles |
| Studio : analyse d'image par IA (Gemini) | indisponible (bouton désactivé, découpage heuristique à la place) |
| Studio : génération 3D « assistée par IA » | indisponible : repli automatique sur la synthèse procédurale, avec un avertissement |
| Studio : « Publier GitHub » (fabrication d'un paquet .zip) | indisponible : lien vers le dépôt et instructions manuelles seulement |

Ces trois fonctions exigent le serveur local (`npm run dev`) ; la clé Gemini reste côté serveur.

## Stockage « Mes personnages » (facultatif)

Par défaut, les personnages et animations enregistrés restent dans le navigateur. Pour les garder en ligne :

1. Crée un dépôt public `character-forge-bank`.
2. Crée un jeton GitHub *fine-grained* limité à ce dépôt, avec **Contents : Read and write**.
3. Colle-le dans la section « Stockage permanent de la banque » de `modele.html`, puis clique sur **Tester**.

Le jeton reste dans ce navigateur (stockage local). Ne le partage jamais et ne le mets pas dans un commit.

## Licences et droits : à lire avant de publier

- Le **code** de character-forge est sous licence **MIT** (fichier `LICENSE`, copie identique dans `docs/LICENSE`).
- `docs/exemple/mannequin.glb` est un modèle original, publié sous **CC0** (domaine public).
- Les contenus tiers (garde-robe, animations, banque de personnages, dépendances npm) gardent leur propre licence : voir `THIRD_PARTY.md`.
- Les **images d'exemple** de l'app React (`src/assets/images/`) ont une origine non documentée : voir `THIRD_PARTY.md`.
- **Tes modèles et animations ont leurs propres droits.** Un personnage tiré d'une œuvre protégée (jeu, BD, animé) reste du fan-art : garde-le **🔒 privé** et ne le place pas dans la banque publique.
- Les animations Mixamo ont leurs propres conditions d'utilisation : vérifie si tu peux les redistribuer avant de les rendre publiques.
- En cas de doute, laisse le contenu en privé.

## Limites connues & Dépannage

- Si le navigateur bloque l'encodage PNG (message d'alerte sous Exporter) : la planche dépasse la limite de mémoire du canvas. Réduire la taille des cases (ex: 64 px au lieu de 128 px), réduire le nombre de frames, ou choisir l'export *Images (.zip)*.
- FBX en version 6100 illisible : réexporter en GLB ou en FBX récent (Blender).
- Un modèle dont les bras sont collés au corps se riggue mal : privilégier une pose en T ou en A.
- Cheveux et vêtements amples restent rigides sans armature secondaire.

## Contribuer

Tests : `python -m pytest tests` (unitaires), `python -m pytest tests/ui_pages.py tests/ui_smoke_modele.py` (interface, Playwright + Chromium), `npm run lint`. Les retours sont bienvenus : ouvre une *issue* avec le message d'erreur complet (console du navigateur, touche F12) et, si possible, un modèle de test libre de droits.
