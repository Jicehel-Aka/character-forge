# Leçons : reconstituer une planche de sprites (combattante, 23 animations)

Tirées du travail de reconstruction de la planche d'une combattante (6 colonnes × 23 lignes, fond magenta 255,0,255).
Chaque point a coûté un aller-retour ; ils sont ici pour ne pas les refaire. Les outils correspondants sont
`forge animrules`, `forge harmonize`, `forge sheetops split|slice` et `tools/sheet_rebuild/`.

## 1. Une planche juste = trois choses, dans cet ordre
1. **Le mouvement est le bon** (règles par type d'animation : `forge animrules`). C'est le critère n°1 : une planche
   cohérente en couleurs et en échelle mais avec une marche sans alternance des jambes est inutilisable.
2. **Le personnage est le même partout** (taille, tête, palette, contour : `forge harmonize`).
3. **La mise en cellule est propre** (pieds sur la même ligne, fond magenta pur, alpha dur).
Ne pas inverser : on a d'abord optimisé la ressemblance de silhouette (tests « verts ») alors que les mouvements étaient faux.

## 2. Ce qui ne marche pas (essayé, abandonné)
- **Appariement automatique par silhouette / pose YOLO** (Hungarian, Viterbi) : trouve des sprites qui *ressemblent* à la
  cible, pas des sprites qui *font* le mouvement. Bruité en pixel art et en 3/4. Utile seulement pour un premier jet.
- **Rendu 3D maison (enveloppe → rig → animations apprises)** : poses 3/4 bruitées → membres faux. Les vraies poses
  rendues par un modèle 3D fourni par l'utilisateur sont meilleures (voir §4).
- **Corrections d'échelle par sprite ou par torse** : aggravent. Garder **une échelle par planche source**, calée sur les
  sprites debout (cible ≈ 104 px de haut dans une cellule de 152).
- **Sprites couchés générés** : tous avaient la même anomalie (tête au milieu du corps, bottes de part et d'autre). À ne
  jamais accepter : demander/fournir de vraies poses de sol (tête à un bout, jambes à l'autre).
- **Seuils de test qui valident tout** : un test « échelle stable » faisait échouer de vraies poses (chute) ; mesurer les
  *variations* par rapport à l'original (delta d'aire en log), pas des valeurs absolues.

## 3. Règles de mouvement (implémentées dans `forge/animrules.py`)
| Type | Ce qu'il faut voir |
|---|---|
| walk / run | écart des pieds qui s'ouvre et se referme ≥ 2 fois (jambes qui alternent) ; hauteur stable (±12 % / ±20 %). Cycle 6 images : contact, appui, passage, contact (autre jambe), appui, passage |
| crouch | ≥ 3 frames bien plus basses que la garde (< 88 %) |
| crouch_sweep | accroupi **puis** balayage : ≥ 3 frames basses + l'arme/bras avance ≥ 15 % de la hauteur |
| lunge | ≥ 2 frames pieds très écartés |
| kick | ≥ 2 frames plus larges que hautes, **pied et jambe intacts** |
| punch / shot | la main avance ≥ 12 % ; un tir n'est pas un double coup de pied |
| weapon_motion | l'arme change de position/angle à chaque frame (une « attaque » qui ne bouge pas est un échec) |
| spin | silhouette change fortement (recouvrement < 0,90) |
| dodge / low_guard | au moins 1 frame basse / pieds écartés ≥ 4 frames |
| fall | debout recul → à genoux → au sol ; hauteur ↓ ≥ 40 % ; 2 dernières frames couchées |
| ko / getup | ≥ 4 frames couchées / commence couché, finit debout |
Les noms d'animation doivent figurer sur la planche annotée (`tools/sheet_rebuild/annot.py`) : sans nom, on ne peut pas juger
si une animation répond au besoin. Limite : la latéralité (quelle jambe est devant) ne se lit pas sur une silhouette.

## 4. Meilleures sources de poses, par ordre de fiabilité
1. Rendus 3D du **même personnage** dans la bonne pose (capture de visualiseur), détourés puis harmonisés.
2. Planche de **pixel art cohérente** avec le cycle voulu (ex. marche en 6 images libellées) : à prendre telle quelle.
3. Sprites existants réutilisés à la bonne place (catalogue manuel + séquences dans `seq.json`).
4. Génération automatique : seulement en dernier recours, toujours relue image par image.
Quand le style diffère d'une source à l'autre → `forge harmonize` (hauteur, carrure, tête, palette, contour).

## 5. Détourage de rendus 3D sur fond sombre quadrillé
Fond neutre sombre + grille grise : garder les pixels **chromatiques** (vert, peau), **blancs** (bottes) ou **violet sombre**
(cheveux), ouvrir, garder les grandes composantes, fermer et remplir. Érosion de 2 px + retrait du liseré sombre/neutre de
bord (sinon halo gris). Les parties noires très sombres (semelles, jambe lointaine) sont rognées : acceptable, à signaler.
Les poses face à gauche se **retournent** pour la convention « regarde à droite ».

## 6. Harmonisation (`forge harmonize`)
Ordre : tête → taille → couleurs → contour. Valeurs utilisées pour la marche : hauteur 102 px, largeur ×1,10, tête ×1,30 coupée à
30 % de la hauteur (sous le menton, ancrée au cou), palette de 28 couleurs tirée de la combattante, contour 1 px (14,8,22),
sombres (cheveux) préservés. Le facteur de tête est un réglage à l'œil, une fois par source de sprites.

## 7. Façon de travailler (ce qui a le mieux marché)
- Un **catalogue manuel de poses** (indices, contact sheets numérotées) + des **séquences écrites par animation**, plutôt qu'une
  assignation globale. Relire les indices sur la planche rendue (les étiquettes au-dessus d'un sprite trompent facilement).
- **Tester après chaque changement** : règles de mouvement + tests génériques + regarder la planche et le GIF nommé.
- Livrer en **planches de 6 lignes** (`forge sheetops split`) pour que le travail reste lisible ; version annotée + version brute.
- Quand l'utilisateur fournit une meilleure source, **remplacer** la ligne entière, ne pas la mélanger avec d'anciens sprites.

## 8. Appliquer à un autre personnage (essai sur la danseuse, clip « Dance » en 64 px)
- **Ce qui se transfère** : harmonisation taille/contour/palette réduite, contrôles de cadre/échelle/pieds (`forge qa`), règles
  génériques (marche, course, chute, KO, relevé : mêmes mouvements pour tout personnage de profil).
- **Ce qui ne se transfère pas** : le catalogue de mouvements est celui d'un combattant. Une danse n'a pas de type dans `animrules`
  (appliquée telle quelle, elle « échoue » à idle et à la stabilité de hauteur de marche, ce qui n'a pas de sens) : il faut lui écrire
  ses propres règles (danse = hauteur qui varie, rotation du buste, bras qui bougent ; révérence ; tour sur soi).
- **Piège** : `harmonize --ref` transfère les COULEURS de la référence ; la danseuse prend alors la peau et la tenue vertes de la
  combattante. Pour un autre personnage, `--keep-colors` (ses propres couleurs, palette réduite, contour, hauteur).
- Le vrai défaut de la danseuse est en amont : rendu 3D à 64 px, tenue violet sombre quasi noire (texture des cheveux absente),
  membres fins, tête-masse sombre. Les règles de mouvement ne le corrigent pas ; il faut une meilleure texture/pose source.
