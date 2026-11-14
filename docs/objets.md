# Monstres et objets animés par code (`docs/objets.js`)

Pour un jeu de plateforme il faut plus que le héros : monstres qui ne sont pas humanoïdes, coffres, leviers, portes, pièges,
pièces, flèches, explosions. `objets.js` fabrique tout cela **par code** (maillages three.js à couleurs unies, pièces nommées,
aucun fichier, aucun squelette humain, aucune licence : CC0). Chaque objet a des **états** (« fermé », « ouverture », « ouvert »,
« fermeture »…), chacun avec une animation procédurale, une durée, une boucle ou non, une ancre et des boîtes de collision.

Dans `modele.html`, carte repliée **« Monstres & objets »** : choisir le type, régler les paramètres, **Charger dans la scène**
(l'objet se comporte comme un modèle sans os ; ses animations sont dans la liste « Animation »), puis **Générer tous les états**
(un état = une ligne de la planche, bibliothèque commune avec le héros). Tous les exports existants (paquet ZIP, atlas, `.h`, `.raw`,
GIF) marchent tels quels ; l'atlas, le `meta.json` et le paquet reçoivent en plus les **données de jeu** décrites plus bas.

## Catalogue

| famille | type | états (→ suivant) | paramètres |
|---|---|---|---|
| objet | `coffre` | `ferme` · `ouverture`→`ouvert` (boucle d'éclats si butin) · `fermeture`→`ferme` | bois, métal, butin |
| objet | `levier` | `off` · `on` · `activation`→`on` · `desactivation`→`off` | poignée |
| objet | `bouton` (plaque ou bouton) | `relache` · `enfonce` · `enfoncement`→`enfonce` · `relachement`→`relache` | forme, dessus |
| objet | `porte` (coulissante ou à charnière) | `ferme` · `ouvert` · `ouverture`→`ouvert` · `fermeture`→`ferme` | type, battant, mur |
| objet | `plateforme` mobile | `arret` · `deplacement` (boucle ; `trajet` > 0 dessine l'aller-retour) | dessus, trajet |
| objet | `piege` à pointes | `rentre` · `sorti` · `avertissement`→`sortie`→`sorti` · `rentree`→`rentre` | plaque |
| objet | `checkpoint` | `inactif` · `activation`→`actif` (drapeau qui se lève, boucle ondulée) | drapeaux |
| collectible | `piece`, `coeur`, `cle` | `tourne`/`bat` (boucle) · `prise`/`pris` | couleur |
| projectile | `boule`, `fleche` | `vol` (boucle) · `impact`/`fiche` | couleur |
| effet | `eclat` (explosion), `poussiere` | une seule animation, non bouclée | couleur |
| monstre | `slime` (squash & stretch, rebond) | `idle` `deplacement` `attaque` `degat` `mort` | couleur, largeur |
| monstre | `volant` (chauve-souris : battement, vol sur place, plongeon ; ou oiseau) | idem | type, couleur, longueur d'aile |
| monstre | `quadrupede` (marche à 4 pattes en diagonale, ou 6 pattes en trépied) | idem | pelage, ventre, paires de pattes, longueur |
| monstre | `crabe` (pinces, pattes) | idem | carapace, taille des pinces |
| monstre | `plante` carnivore (gueule qui claque) | `idle` `attaque` `degat` `mort` (pas de déplacement) | gueule, feuillage, hauteur |

Tous : `taille` (1 = hauteur du héros). Les monstres ont `degat` (flash blanc) et `mort` (la dernière image est tenue).

## Échelle, vues, miroir

* **Unité** : le héros mesure 1. La cellule d'un sprite est un carré de `1,45 × cadre` unités ; les pieds (origine) sont à
  3,5 % du bas. Avec `cadre = 1` (défaut des objets et monstres) l'échelle en pixels est **la même que celle du héros du préréglage
  plateforme** pour une même taille de cellule (`px_par_unite` dans les données). Les collectibles et projectiles ont `cadre = 0,5` ou
  `0,6` : à générer dans une cellule **plus petite** (taille héros × cadre, par ex. 24 px pour un héros de 48) pour garder la même densité de pixels.
  Champ « Cadre » de la carte : à changer pour grossir un petit objet.
* **Vues** : décor et chauve-souris `s` (face), créatures `e` (profil, regard vers la droite), slime et oiseau `se` (trois quarts).
  « Gauche » = retourner à l'exécution (`miroir_gauche` dans les données) ou choisir « deux vues » (génère aussi `w`/`sw`).
* Les images d'un état ne sont **pas** réduites par « supprimer les images identiques » (désactivé pendant la génération) : N images
  demandées = N images obtenues ; les animations non bouclées couvrent exactement `début → pose finale`.

## Données de jeu : `meta.gameData`

Ajoutées à `*_atlas.json` (sous `meta.gameData`), `*_meta.json` (`gameData`) et écrites dans le paquet : `*_gamedata.json` (identique) et
`*_gamedata.h` (C, voir plus bas). Les durées par image sont aussi copiées dans `frames[...].duration` de l'atlas.
Coordonnées en **pixels de cellule, origine en haut à gauche, y vers le bas**.

```jsonc
"gameData": {
  "format": "character-forge/gamedata@1",
  "objets": {
    "coffre": {
      "type": "coffre", "famille": "objet", "params": {"couleur": "#9a6431", "butin": true, "taille": 1},
      "direction": "s",                    // vue rendue ; "miroir_gauche": texte si les créatures se retournent à l'exécution
      "cellule": {"w": 48, "h": 48}, "cadre": 1, "px_par_unite": 33.1, "unite": "hauteur du héros = 1",
      "ancre": {"x": 24, "y": 45.5},       // pieds (centre pour projectiles, collectibles, effets) : point posé sur le sol
      "points": {"butin": {"x": 24, "y": 35.3}, "interaction": {"x": 24, "y": 43.4}},   // points utiles (bouche, pointe, poignée…)
      "etat_initial": "ferme",
      "etats": {
        "ouverture": {
          "animation": "coffre_ouverture",   // nom de la ligne de la planche et des fichiers .h/.raw
          "tag": "coffre_ouverture_s",       // étiquette de l'atlas (animation_direction)
          "images": 6, "boucle": false, "statique": false,
          "duree_ms": [83, 83, 83, 83, 83, 83], "duree_totale_ms": 498,    // statique : [0] (image fixe)
          "collision": "solide",             // solide | traversable | dangereux | declencheur | aucune
          "hurtbox": {"x": 15, "y": 22, "w": 18, "h": 25},                 // union des pixels opaques de l'état
          "hitbox": {"images": [3, 4], "x": 0, "y": 0, "w": 0, "h": 0},    // attaques seulement : ce qui dépasse du repos, images actives
          "suivant": "ouvert"                // état pris à la fin d'une animation non bouclée (null : on y reste)
        }
      },
      "transitions": [{"de": "ferme", "evenement": "interagir", "vers": "ouverture"}]   // événements du jeu -> état
    }
  }
}
```

Mêmes champs pour tous les types. Les événements (`interagir`, `ouvrir`, `fermer`, `activer`, `declencher`, `poids_dessus`,
`toucher`, `ramasser`, `bouger`, `attaquer`, `blesse`, `tue`…) sont des noms conseillés ; le jeu fait ce qu'il veut. La hurtbox est
mesurée sur les pixels rendus (tous les pixels opaques y sont inclus, vérifié par les tests) ; l'ancre est calculée par projection,
vérifiée contre le bas réel du sprite à ±3 px.

**Pour harmoniser avec l'atlas « sprites »** : les héros n'ont pas encore ce bloc ; une section `gameData.objets.<nom_du_héros>` de même
forme (états = actions, `ancre`, `hurtbox`, `duree_ms`, `boucle`) suffit pour que le jeu traite tout de la même manière.

### En-tête C : `*_gamedata.h`

Pour chaque objet : `#include` des `.h` d'animation, `enum {OBJET_ETAT…, OBJET_NB_ETATS}`, `OBJET_ANCRE_X/Y`, `OBJET_INITIAL` et
`static const ObjetEtat objet_etats[]` (`pixels`, `images`, `boucle`, `duree_ms`, `suivant` (-1 : aucun), `collision`, hurtbox). Les pixels
sont en RGB565, ordre « direction, puis image », `0xF81F` = transparent. Exemple complet et compilé :
`docs/exemples/plateforme_aka/exemple_aka.cpp`.

## Exemple de bout en bout

`docs/exemples/plateforme_aka/` : héros (mannequin CC0), slime, coffre, levier, porte dans **une planche et un atlas communs**
(`python3 tests/generer_exemple_plateforme.py` le régénère), `exemple_aka.cpp` (animateur d'états + collisions ; compile et tourne sur PC,
la partie console est du pseudo-code marqué), `objet_etats.gd` et `coffre_levier_porte.gd` (Godot 4 : machine à états lisant l'atlas ;
**non exécutés**). Captures de contrôle : `docs/exemples/previews/`.

## API (`window.ObjetsForge`, ou `import` du module)

`catalogue()` · `valeursDefaut(id)` · `creer(id, params, nom)` → `{nom, racine, clips[], etats[], transitions[], points, cadre, vue, cadreMesh}` ·
`donneesDeJeu(reg, bibliotheque)` · `projeter(point3d, {T,cadre,dir,pitch})` · `enteteC(base, objets, nomAnim)`.
Ajouter un type : `def({...})` dans `objets.js` (`construire` crée des pièces nommées, `etats` renvoie les poses `fn(u)` en deltas
`{p, r, s}` par pièce). Banque GLB animée (sans squelette, CC0) : `docs/bank/objets/` (`python3 tests/generer_banque_objets.py`) ;
modele.html ne garde, à l'import d'un fichier, que position et rotation (pas l'échelle) : préférer la carte « Monstres & objets ».

## Tests

`python3 tests/ui_objets.py` (serveur local intégré, Chromium swiftshader) : pour chaque type et variantes, charge, génère, et vérifie
absence d'erreur JS, images non vides, images distinctes, transitions cohérentes, ancre, hurtbox, atlas, paquet, `gamedata.h` compilé
avec gcc, GLB de la banque. Écrit les captures dans `docs/exemples/previews/`.

## Limites connues

* Couleurs unies et formes simples : lisibles de 32 à 64 px ; en dessous, les détails (voyants, éclats, yeux) disparaissent.
* La carte ne fait pas encore partie des préréglages de l'assistant sprites ; la planche garde la colonne d'étiquettes.
* Les animations des GLB exportés ne sont pas retouchées pour Unity/Godot (non testé).
