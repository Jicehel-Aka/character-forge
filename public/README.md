# character-forge

Transforme un modèle 3D de personnage (GLB / FBX / OBJ) en **planches de sprites 2D** : squelette, animations, 8 directions, palette RGB565 pour la console Gamebuino AKA ou n'importe quel moteur (Godot, Unity, Defold, Phaser...). Tout se fait dans le navigateur, sans rien installer.

**Essayer tout de suite :** ouvre la page *Modèle 3D → sprites* (`modele.html`) et clique sur **Essayer avec un exemple** (petit mannequin libre de droits CC0, déjà équipé d'un squelette et des animations Idle et Walk).

## Ce que fait l'outil

1. **Ouvrir un modèle** : GLB (conseillé), FBX ou OBJ, par exemple rapporté de Meshy, Mixamo, ou généré depuis des photos multi-vues.
2. **Squelette** : pose automatique d'un squelette humanoïde standard, ou reprise de celui d'un autre fichier.
3. **Animations** : celles du fichier, des FBX/GLB Mixamo, des packs .zip, ou des animations calculées (échelle, corde).
4. **Sprites & Palettes** : 8 directions, 48 / 64 / 96 / 128 px, palette commune ou préréglages pixel-art (Game Boy, PICO-8, NES, Gamebuino RGB565), contour sombre automatique, fond transparent ou magenta.
5. **Exporter** : paquet .zip complet, planche PNG, atlas JSON (compatible Aseprite / Godot / Unity), GIF animé, images séparées, `.raw` RGB565, en-tête C (`.h`), et **le modèle animé en GLB** (bouton *Modèle animé (GLB)*).

## Pages & Structure du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | Atelier : fiche en pied, détourage, calibration des vues |
| `modele.html` | Modèle 3D → sprites (moteur 3D, squelette, animations, exports) |
| `3d.html` / `chaine3d.html` | Chaîne 3D complète, documentation et commandes `forge …` |
| `exemple/mannequin.glb` | Mannequin CC0 d'exemple prêt à animer (1-clic) |
| `LICENSE` | Licence libre MIT |

## Mise en ligne (GitHub Pages)

Place les fichiers HTML à la racine du dépôt, avec le dossier `exemple/` (contenant `mannequin.glb`), puis active GitHub Pages sur la branche principale (`Settings > Pages > Branch: main / root`).

## Stockage « Mes personnages » (facultatif)

Par défaut, les personnages et animations enregistrés restent dans le navigateur. Pour les garder en ligne :

1. Crée un dépôt public `character-forge-bank`.
2. Crée un jeton GitHub *fine-grained* limité à ce dépôt, avec **Contents : Read and write**.
3. Colle-le dans la section « Stockage permanent de la banque » de `modele.html`, puis clique sur **Tester**.

Le jeton reste dans ce navigateur (stockage local). Ne le partage jamais et ne le mets pas dans un commit.

## Licences et droits : à lire avant de publier

- Le **code** de character-forge est sous licence MIT (fichier `LICENSE`).
- `exemple/mannequin.glb` est un modèle original, publié sous **CC0** (domaine public).
- **Tes modèles et animations ont leurs propres droits.** Un personnage tiré d'une œuvre protégée (jeu, BD, animé) reste du fan-art : garde-le **🔒 privé** et ne le place pas dans la banque publique.
- Les animations Mixamo ont leurs propres conditions d'utilisation : vérifie si tu peux les redistribuer avant de les rendre publiques.
- En cas de doute, laisse le contenu en privé.

## Limites connues & Dépannage

- Si le navigateur bloque l'encodage PNG (message d'alerte sous Exporter) : la planche dépasse la limite de mémoire du canvas. Réduire la taille des cases (ex: 64 px au lieu de 128 px), réduire le nombre de frames, ou choisir l'export *Images (.zip)*.
- FBX en version 6100 illisible : réexporter en GLB ou en FBX récent (Blender).
- Un modèle dont les bras sont collés au corps se riggue mal : privilégier une pose en T ou en A.
- Cheveux et vêtements amples restent rigides sans armature secondaire.

## Contribuer

Les retours sont bienvenus : ouvre une *issue* avec le message d'erreur complet (console du navigateur, touche F12) et, si possible, un modèle de test libre de droits.
