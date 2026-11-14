/* character-forge — objets.js
   Objets à actionner, collectibles, projectiles, effets et MONSTRES NON HUMANOÏDES, tous générés par code (three.js)
   et animés procéduralement : aucun fichier, aucun squelette humain, aucune licence à vérifier.
   Chaque objet est un maillage de pièces NOMMÉES (couleurs unies stylisées) + des animations (THREE.AnimationClip)
   par ÉTAT (« ferme », « ouverture », « ouvert », « fermeture »...) + des données de jeu (ancre, boîtes, durées).
   modele.html charge cet objet comme un modèle sans os : « Générer » et tous les exports existants marchent dessus.

   Conventions
   - unités : le héros mesure 1 unité de haut ; le « cadre » (cellule du sprite) est un carré de 1,45 × cadre unités,
     pieds (origine) à 3,5 % du bas de la cellule : même échelle que le héros du préréglage plateforme si cadre = 1.
   - les créatures et projectiles regardent +Z ; vue « e » = profil tourné vers la droite (comme le héros), « w » = gauche
     (ou miroir à l'exécution). Les objets de décor regardent la caméra (vue « s »). La vue par défaut est dans spec.vue.
   - une pose est une fonction fn(u) -> { nomDePiece: { p:[dx,dy,dz], r:[rx,ry,rz], s:nombre|[sx,sy,sz] } } : deltas par rapport
     à la position de repos (p), rotation composée au repos (r, radians), multiplicateur d'échelle (s). */
import * as THREE from 'three';

/* ------------------------------------------------------------------ utilitaires */
const R = Math.PI / 180, TAU = Math.PI * 2;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const lisse = t => { t = cl(t); return t * t * (3 - 2 * t); };
const surtir = t => { t = cl(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }; // dépasse puis se pose
const hold = (u, a, b) => lisse((u - a) / (b - a));                    // 0 avant a, 1 après b, lissé entre
/* interpolation lissée par clés : kf(u,[[0,1],[.3,.7],[1,1]]) */
const kf = (u, K) => {
  if (u <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (u <= K[i][0]) return lerp(K[i - 1][1], K[i][1], lisse((u - K[i - 1][0]) / (K[i][0] - K[i - 1][0])));
  return K[K.length - 1][1];
};
const sin = (u, ph = 0, k = 1) => Math.sin(TAU * (u * k + ph));
const vol = sy => 1 / Math.sqrt(Math.max(.05, sy));                    // conservation approchée du volume (squash & stretch)
const fonce = (c, k) => new THREE.Color(c).multiplyScalar(k);
const clair = (c, k) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k);

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 14, r2 = null) => new THREE.CylinderGeometry(r2 == null ? r : r2, r, h, seg);   // r en bas, r2 en haut
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const sph = (rx, ry = rx, rz = rx, seg = 16) => new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * .7))).scale(rx, ry, rz);
const demi = (rx, ry, rz, haut, seg = 16) => new THREE.SphereGeometry(1, seg, 8, 0, TAU, haut ? 0 : Math.PI / 2, Math.PI / 2).scale(rx, ry, rz);
const octa = r => new THREE.OctahedronGeometry(r, 0);
const tore = (r, t) => new THREE.TorusGeometry(r, t, 8, 18);
/* éclats ponctuels / voyants : sphère minuscule */
const CACHE = .001;

/* Constructeur : crée des groupes et des pièces NOMMÉES (noms uniques : les animations les retrouvent par leur nom) */
class Constructeur {
  constructor(nom, taille) {
    this.racine = new THREE.Group(); this.racine.name = 'racine';   // nom réservé : un clip dont la piste porte le nom de la racine s'y appliquerait
    this.modele = new THREE.Group(); this.modele.name = 'modele'; this.modele.scale.setScalar(taille || 1); this.racine.add(this.modele);
    this.n = { modele: this.modele }; this.mats = new Map();
  }
  mat(c, o = {}) {
    const col = new THREE.Color(c), k = col.getHexString() + (o.double ? 'd' : '') + (o.lum || '') + (o.devant ? 'v' : '');
    if (!this.mats.has(k)) this.mats.set(k, new THREE.MeshStandardMaterial({ color: col, roughness: .85, metalness: 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide,
      emissive: o.lum ? col : 0x000000, emissiveIntensity: o.lum || 0, depthTest: !o.devant }));   // devant : toujours dessiné par-dessus (cœur lumineux)    // lum : matière « qui brille » (flammes, voyants, étincelles)
    return this.mats.get(k);
  }
  g(nom, parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
    if (this.n[nom]) throw new Error('pièce en double : ' + nom);
    const o = new THREE.Group(); o.name = nom; o.position.set(...pos); o.rotation.set(...rot); (parent || this.modele).add(o); this.n[nom] = o; return o;
  }
  m(nom, parent, geo, couleur, pos = [0, 0, 0], rot = [0, 0, 0], ech = 1, o = {}) {
    if (this.n[nom]) throw new Error('pièce en double : ' + nom);
    const me = new THREE.Mesh(geo, o.basic ? new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur) }) : this.mat(couleur, o));
    me.name = nom; me.position.set(...pos); me.rotation.set(...rot); me.scale.set(...(Array.isArray(ech) ? ech : [ech, ech, ech]));
    if (o.devant) me.renderOrder = 5;
    (parent || this.modele).add(me); this.n[nom] = me; return me;
  }
}
/* mémorise la pose de repos de chaque pièce (les clips sont exprimés en écarts par rapport à elle) */
function figer(racine) {
  racine.traverse(o => { o.userData.rest = { p: o.position.toArray(), q: o.quaternion.clone(), s: o.scale.toArray() }; });
}

/* Clip procédural : on échantillonne fn(u) à 30 i/s. Boucle : u va de 0 à 1 (fn périodique). Sinon : u va de 0 à 1 puis la pose finale
   est TENUE jusqu'à 2,5 × dur (ainsi « Générer » avec tmax = dur·N/(N-1) tombe exactement sur la pose finale à la dernière image). */
function fabriquerClip(B, nom, dur, fn, o = {}) {
  const fps = 30, K = Math.max(2, Math.round(dur * fps)), cache = o.cache || [], ech = [];
  const hide = Object.fromEntries(cache.map(k => [k, { s: CACHE }]));
  for (let k = 0; k <= K; k++) ech.push({ t: k / K * dur, pose: Object.assign({}, hide, fn(k / K, k / K * dur)) });
  const total = o.boucle ? dur : dur * 2.5;
  if (!o.boucle) ech.push({ t: total, pose: ech[ech.length - 1].pose });
  const noms = new Set(); ech.forEach(e => Object.keys(e.pose).forEach(k => noms.add(k)));
  const tracks = [], times = ech.map(e => e.t);
  for (const k of noms) {
    const nd = B.n[k]; if (!nd) throw new Error(`clip « ${nom} » : pièce inconnue « ${k} »`);
    const rest = nd.userData.rest, has = c => ech.some(e => e.pose[k] && e.pose[k][c]);
    if (has('p')) tracks.push(new THREE.VectorKeyframeTrack(k + '.position', times, ech.flatMap(e => { const d = (e.pose[k] && e.pose[k].p) || [0, 0, 0]; return [rest.p[0] + d[0], rest.p[1] + d[1], rest.p[2] + d[2]]; })));
    if (has('r')) {
      let prev = null; const v = [];
      for (const e of ech) {
        const d = (e.pose[k] && e.pose[k].r) || [0, 0, 0], q = rest.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d[0], d[1], d[2], 'XYZ')));
        if (prev && prev.dot(q) < 0) { q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1; } prev = q; v.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(k + '.quaternion', times, v));
    }
    if (has('s')) tracks.push(new THREE.VectorKeyframeTrack(k + '.scale', times, ech.flatMap(e => { const s = e.pose[k] && e.pose[k].s; const m = s == null ? [1, 1, 1] : Array.isArray(s) ? s : [s, s, s]; return [rest.s[0] * m[0], rest.s[1] * m[1], rest.s[2] * m[2]]; })));
  }
  return new THREE.AnimationClip(nom, total, tracks);
}

/* ------------------------------------------------------------------ catalogue */
const CAT = new Map();
const def = s => { CAT.set(s.id, s); return s; };
const pCoul = (k, label, d) => ({ k, label, type: 'couleur', def: d });
const pNb = (k, label, d, min, max, pas) => ({ k, label, type: 'nombre', def: d, min, max, pas });
const pCh = (k, label, d, choix) => ({ k, label, type: 'choix', def: d, choix });
const pBo = (k, label, d) => ({ k, label, type: 'bool', def: d });
const pTaille = pNb('taille', 'Taille (1 = héros)', 1, .4, 1.6, .05);
/* état : { id, dur, N, boucle, fn, collision, suivant, fenetre } ; statique : N = 1 */
const fixe = (id, fn, collision = 'solide', plus = {}) => ({ id, dur: 1, N: 1, boucle: false, statique: true, fn, collision, ...plus });
const T = (de, evenement, vers) => ({ de, evenement, vers });

/* ===== OBJETS À ACTIONNER ===== */
def({
  id: 'coffre', famille: 'objet', label: 'Coffre', vue: { dir: 's', pitch: 16 }, cadre: 1, initial: 'ferme',
  params: [pCoul('couleur', 'Bois', '#9a6431'), pCoul('metal', 'Métal', '#d2a82a'), pBo('butin', 'Butin et éclats à l\'ouverture', true), pTaille],
  cache: P => P.butin ? ['butin', 'eclat_1', 'eclat_2', 'eclat_3', 'eclat_4'] : [],
  construire(P, B) {
    B.m('base', null, box(.56, .26, .38), P.couleur, [0, .13, 0]);
    B.m('bande_g', null, box(.07, .27, .40), P.metal, [-.19, .135, 0]); B.m('bande_d', null, box(.07, .27, .40), P.metal, [.19, .135, 0]);
    B.m('interieur', null, box(.48, .012, .30), '#24140c', [0, .262, 0]);
    B.m('serrure', null, box(.08, .1, .03), P.metal, [0, .2, .2]); B.m('trou_serrure', null, box(.02, .04, .012), '#1c1208', [0, .2, .22]);
    const lid = B.g('couvercle', null, [0, .26, -.19]);
    B.m('couvercle_bas', lid, box(.56, .09, .38), P.couleur, [0, .045, .19]);
    B.m('couvercle_arc', lid, cyl(.19, .56, 18), P.couleur, [0, .09, .19], [0, 0, Math.PI / 2], [.62, 1, 1]);
    for (const [k, x] of [['g', -.19], ['d', .19]]) B.m('couvercle_bande_' + k, lid, cyl(.195, .07, 18), P.metal, [x, .09, .19], [0, 0, Math.PI / 2], [.63, 1, 1.005]);
    B.m('verrou', lid, box(.07, .07, .03), P.metal, [0, .05, .385]);
    if (P.butin) {
      const b = B.g('butin', null, [0, .262, 0]), pieces = [[-.12, .02, -.03], [-.02, .03, .05], [.1, .02, .0], [-.04, .05, -.04], [.05, .05, .04], [.13, .04, .06]];
      pieces.forEach((q, i) => B.m('piece_' + i, b, cyl(.05, .014, 10), i % 2 ? P.metal : clair(P.metal, .25), q, [1.2 + i * .1, 0, .3 * i]));
      B.m('gemme_r', b, octa(.05), '#e04a4a', [-.07, .075, .07]); B.m('gemme_b', b, octa(.05), '#4aa3e0', [.08, .08, -.02]);
      [[-.22, .5, .12], [.02, .6, .04], [.22, .48, .1], [.12, .68, -.04]].forEach((q, i) => B.m('eclat_' + (i + 1), null, octa(.03), '#fff3a0', q, [0, 0, 0], 1, { lum: .9 }));
    }
  },
  etats(P) {
    const ouv = a => ({ couvercle: { r: [-a * R, 0, 0] } }), loot = (s, y = 0) => P.butin ? { butin: { s: Math.max(CACHE, s), p: [0, y, 0] } } : {};
    const E = [
      fixe('ferme', () => ({ ...ouv(0) }), 'solide'),
      { id: 'ouverture', dur: .5, N: 6, boucle: false, collision: 'solide', suivant: 'ouvert', fn: u => ({ ...ouv(115 * surtir(u)), ...loot(hold(u, .3, .8), .06 * Math.sin(Math.PI * hold(u, .3, .9))) }) },
      { id: 'fermeture', dur: .4, N: 5, boucle: false, collision: 'solide', suivant: 'ferme', fn: u => ({ ...ouv(115 * (1 - lisse(u))), ...loot(1 - hold(u, 0, .35)) }) },
    ];
    E.splice(2, 0, P.butin
      ? { id: 'ouvert', dur: .8, N: 4, boucle: true, collision: 'solide', fn: u => ({ ...ouv(115), ...loot(1), ...Object.fromEntries([1, 2, 3, 4].map(i => ['eclat_' + i, { s: .4 + .9 * Math.max(0, sin(u, i * .27)), p: [0, .04 * sin(u, i * .27), 0], r: [0, 0, TAU * u * .5] }])) }) }
      : fixe('ouvert', () => ({ ...ouv(115) }), 'solide'));
    return E;
  },
  transitions: () => [T('ferme', 'interagir', 'ouverture'), T('ouvert', 'interagir', 'fermeture')],
  points: () => ({ butin: [0, .32, 0], interaction: [0, .15, .3] }),
});

def({
  id: 'levier', famille: 'objet', label: 'Levier', vue: { dir: 's', pitch: 14 }, cadre: 1, initial: 'off',
  params: [pCoul('couleur', 'Poignée', '#d83a3a'), pNb('taille', 'Taille (1 = héros)', 1.3, .4, 1.6, .05)],
  cache: () => [],
  construire(P, B) {
    B.m('socle', null, box(.5, .1, .3), '#6b6f78', [0, .05, 0]); B.m('cadre', null, box(.3, .08, .2), '#3d4047', [0, .13, 0]);
    B.m('fente', null, box(.22, .02, .06), '#15161a', [0, .175, .02]);
    const mn = B.g('manche', null, [0, .15, .02]);
    B.m('tige', mn, cyl(.022, .3, 10), '#c3c7d1', [0, .15, 0]); B.m('poignee', mn, sph(.065), P.couleur, [0, .32, 0]);
    B.m('voyant_off', null, sph(.04), '#e23b3b', [.18, .115, .12], [0, 0, 0], 1, { lum: .6 }); B.m('voyant_on', null, sph(.04), '#3bf25a', [.18, .115, .12], [0, 0, 0], 1, { lum: .6 });
  },
  etats(P) {
    const pose = a => ({ manche: { r: [0, 0, a * R] }, voyant_off: { s: a > 0 ? 1 : CACHE }, voyant_on: { s: a > 0 ? CACHE : 1 } });
    const bas = u => 38 - 76 * lisse(u), haut = u => -38 + 76 * lisse(u);
    return [
      fixe('off', () => pose(38), 'solide'), fixe('on', () => pose(-38), 'solide'),
      { id: 'activation', dur: .25, N: 4, boucle: false, collision: 'solide', suivant: 'on', fn: u => ({ manche: { r: [0, 0, bas(u) * R] }, voyant_off: { s: u < .5 ? 1 : CACHE }, voyant_on: { s: u < .5 ? CACHE : 1 } }) },
      { id: 'desactivation', dur: .25, N: 4, boucle: false, collision: 'solide', suivant: 'off', fn: u => ({ manche: { r: [0, 0, haut(u) * R] }, voyant_off: { s: u < .5 ? CACHE : 1 }, voyant_on: { s: u < .5 ? 1 : CACHE } }) },
    ];
  },
  transitions: () => [T('off', 'interagir', 'activation'), T('on', 'interagir', 'desactivation')],
  points: () => ({ interaction: [0, .3, .1] }),
});

def({
  id: 'bouton', famille: 'objet', label: 'Bouton / plaque de pression', vue: { dir: 's', pitch: 18 }, cadre: 1, initial: 'relache',
  params: [pCh('forme', 'Forme', 'plaque', ['plaque', 'bouton']), pCoul('couleur', 'Dessus', '#d6a22a'), pTaille],
  cache: () => [],
  construire(P, B) {
    const pl = P.forme === 'plaque';
    B.m('base', null, pl ? box(.84, .05, .36) : cyl(.24, .07, 20), '#575c66', pl ? [0, .025, 0] : [0, .035, 0]);
    B.m('tete', null, pl ? box(.68, .05, .28) : cyl(.16, .08, 20), P.couleur, pl ? [0, .075, 0] : [0, .11, 0]);
    B.m('voyant_off', null, sph(.035), '#e23b3b', [0, .035, pl ? .19 : .25], [0, 0, 0], 1, { lum: .6 }); B.m('voyant_on', null, sph(.035), '#3bf25a', [0, .035, pl ? .19 : .25], [0, 0, 0], 1, { lum: .6 });
  },
  etats(P) {
    const dy = P.forme === 'plaque' ? -.038 : -.055, pose = (k, on) => ({ tete: { p: [0, dy * k, 0] }, voyant_off: { s: on ? CACHE : 1 }, voyant_on: { s: on ? 1 : CACHE } });
    return [
      fixe('relache', () => pose(0, false), 'declencheur'), fixe('enfonce', () => pose(1, true), 'declencheur'),
      { id: 'enfoncement', dur: .15, N: 3, boucle: false, collision: 'declencheur', suivant: 'enfonce', fn: u => pose(lisse(u), u > .5) },
      { id: 'relachement', dur: .2, N: 3, boucle: false, collision: 'declencheur', suivant: 'relache', fn: u => pose(1 - lisse(u), u < .5) },
    ];
  },
  transitions: () => [T('relache', 'poids_dessus', 'enfoncement'), T('enfonce', 'poids_parti', 'relachement')],
  points: () => ({ dessus: [0, .13, 0] }),
});

def({
  id: 'porte', famille: 'objet', label: 'Porte', vue: { dir: 's', pitch: 8 }, cadre: 1, initial: 'ferme',
  params: [pCh('type', 'Type', 'coulissante', ['coulissante', 'charniere']), pCoul('couleur', 'Battant', '#8a6a48'), pCoul('pierre', 'Mur', '#8e919c'), pTaille],
  cache: () => [],
  construire(P, B) {
    const co = P.type === 'coulissante', cx = -.12, hp = 1.1;     // centre du passage, hauteur du passage
    B.m('pilier_g', null, box(.14, 1.2, .26), P.pierre, [cx - .32, .6, 0]);
    B.m('linteau', null, box(co ? .98 : .78, .15, .26), clair(P.pierre, .1), [co ? .045 : -.02, 1.175, 0]);
    B.m('seuil', null, box(.5, .03, .26), fonce(P.pierre, .8), [cx, .015, 0]);
    if (co) {
      B.m('mur_coulisse', null, box(.47, 1.2, .3), P.pierre, [cx + .495, .6, .01]); B.m('ouverture_sombre', null, box(.5, hp, .06), '#17120f', [cx, hp / 2, -.1]);
      const p = B.g('battant', null, [cx, 0, -.02]);
      B.m('panneau', p, box(.5, hp, .07), P.couleur, [0, hp / 2, 0]);
      for (const y of [.25, .55, .85]) B.m('barre_' + y * 100, p, box(.5, .05, .08), fonce(P.couleur, .6), [0, y, 0]);
      B.m('voyant_porte', p, box(.07, .07, .09), '#6be0ff', [.16, .55, 0]);
    } else {
      B.m('pilier_d', null, box(.14, 1.2, .26), P.pierre, [cx + .32, .6, 0]);
      B.m('ouverture_sombre', null, box(.5, hp, .06), '#17120f', [cx, hp / 2, -.1]);
      const p = B.g('battant', null, [cx - .25, 0, .0]);
      B.m('panneau', p, box(.5, hp, .07), P.couleur, [.25, hp / 2, 0]);
      for (const y of [.25, .85]) B.m('barre_' + y * 100, p, box(.5, .06, .08), fonce(P.couleur, .6), [.25, y, 0]);
      B.m('poignee', p, sph(.035), '#d9c15a', [.43, .52, .06]);
    }
  },
  etats(P) {
    const co = P.type === 'coulissante', ouv = k => co ? { battant: { p: [.48 * k, 0, 0] } } : { battant: { r: [0, 97 * k * R, 0] } };
    return [
      fixe('ferme', () => ouv(0), 'solide'), fixe('ouvert', () => ouv(1), 'traversable'),
      { id: 'ouverture', dur: co ? .5 : .6, N: 6, boucle: false, collision: 'solide', suivant: 'ouvert', fn: u => ouv(co ? lisse(u) : surtir(u) * .98) },
      { id: 'fermeture', dur: co ? .5 : .6, N: 6, boucle: false, collision: 'solide', suivant: 'ferme', fn: u => ouv(1 - lisse(u)) },
    ];
  },
  transitions: () => [T('ferme', 'ouvrir', 'ouverture'), T('ouvert', 'fermer', 'fermeture')],
  points: () => ({ passage: [-.12, .1, 0] }),
});

def({
  id: 'plateforme', famille: 'objet', label: 'Plateforme mobile', vue: { dir: 's', pitch: 12 }, cadre: 1, initial: 'arret',
  params: [pCoul('couleur', 'Dessus', '#6fae4c'), pNb('trajet', 'Aller-retour dessiné (0 = sur place, jeu = déplace)', 0, 0, .2, .02), pTaille],
  cache: () => [],
  construire(P, B) {
    const pf = B.g('plateforme', null, [0, 0, 0]);
    B.m('dalle', pf, box(1, .13, .36), '#8b6b4a', [0, .27, 0]); B.m('dessus', pf, box(1.02, .035, .38), P.couleur, [0, .345, 0]);
    B.m('dessous', pf, box(.84, .08, .3), '#4c4f58', [0, .19, 0]);
    for (const [k, x] of [['g', -.34], ['d', .34]]) {
      const r = B.g('roue_' + k, pf, [x, .13, .0]);
      B.m('jante_' + k, r, cyl(.075, .05, 12), '#c9ccd4', [0, 0, 0], [Math.PI / 2, 0, 0]); B.m('rayon_' + k, r, box(.15, .03, .06), '#4c4f58', [0, 0, 0]);
      B.m('flamme_' + k, pf, cone(.06, .18), '#ffb02e', [x * .55, .07, 0], [Math.PI, 0, 0], 1, { lum: .7 });
    }
    for (const x of [-.4, -.13, .13, .4]) B.m('rivet_' + Math.round(x * 100), pf, sph(.017), '#d8d1c4', [x, .27, .185]);
  },
  etats(P) {
    const x = u => P.trajet * sin(u), roule = (u, k) => ({ plateforme: { p: [x(u), .012 * sin(u, 0, 2), 0] }, roue_g: { r: [0, 0, -TAU * u * k] }, roue_d: { r: [0, 0, -TAU * u * k] },
      flamme_g: { s: [1, .75 + .35 * sin(u, 0, 3), 1] }, flamme_d: { s: [1, .75 + .35 * sin(u, .3, 3), 1] } });
    return [fixe('arret', () => ({ roue_g: {}, flamme_g: { s: [1, .5, 1] }, flamme_d: { s: [1, .5, 1] } }), 'solide'),
      { id: 'deplacement', dur: 1, N: 8, boucle: true, collision: 'solide', fn: u => roule(u, 1) }];
  },
  transitions: () => [T('arret', 'demarrer', 'deplacement'), T('deplacement', 'arreter', 'arret')],
  points: () => ({ dessus: [0, .365, 0] }),
});

def({
  id: 'piege', famille: 'objet', label: 'Piège à pointes', vue: { dir: 's', pitch: 20 }, cadre: 1, initial: 'rentre',
  params: [pCoul('couleur', 'Plaque', '#5b606b'), pTaille],
  cache: () => [],
  construire(P, B) {
    B.m('plaque', null, box(.74, .06, .36), P.couleur, [0, .03, 0]); B.m('trous', null, box(.64, .012, .26), '#16171b', [0, .062, 0]);
    for (let i = 0; i < 5; i++) { const g = B.g('pointe_' + i, null, [(i - 2) * .13, .065, 0]); B.m('pointe_m_' + i, g, cone(.05, .3, 10), '#dfe3ea', [0, .15, 0]); }
  },
  etats(P) {
    const pts = (h, tr = 0) => Object.fromEntries([0, 1, 2, 3, 4].map(i => ['pointe_' + i, { s: [1, Math.max(.05, h), 1], p: [tr ? .006 * (i % 2 ? 1 : -1) * Math.sin(tr * 40) : 0, 0, 0] }]));
    return [
      fixe('rentre', () => pts(.05), 'traversable'), fixe('sorti', () => pts(1), 'dangereux'),
      { id: 'avertissement', dur: .4, N: 4, boucle: false, collision: 'traversable', suivant: 'sortie', fn: u => pts(.05 + .22 * hold(u, .2, .5), u) },
      { id: 'sortie', dur: .15, N: 4, boucle: false, collision: 'dangereux', suivant: 'sorti', fn: u => pts(.27 + .73 * surtir(u)) },
      { id: 'rentree', dur: .3, N: 4, boucle: false, collision: 'dangereux', suivant: 'rentre', fn: u => pts(1 - .95 * lisse(u)) },
    ];
  },
  transitions: () => [T('rentre', 'declencher', 'avertissement'), T('sorti', 'temps_ecoule', 'rentree')],
  points: () => ({ pointes: [0, .3, 0] }),
});

def({
  id: 'checkpoint', famille: 'objet', label: 'Checkpoint (drapeau)', vue: { dir: 's', pitch: 8 }, cadre: 1, initial: 'inactif',
  params: [pCoul('couleur', 'Drapeau actif', '#3fbf5a'), pCoul('inactif', 'Drapeau inactif', '#8a8d96'), pTaille],
  cache: () => [],
  construire(P, B) {
    B.m('socle', null, box(.3, .07, .2), '#7b7f89', [0, .035, 0]); B.m('mat', null, cyl(.032, 1.02, 10), '#d8d4c8', [0, .56, 0]); B.m('boule', null, sph(.05), '#e6c444', [0, 1.1, 0]);
    for (const [pre, col, y] of [['off', P.inactif, .3], ['on', P.couleur, .88]]) {
      const f = B.g('drapeau_' + pre, null, [.02, y, 0]);
      let par = f;
      for (let i = 1; i <= 3; i++) {
        const s = B.g(`seg_${pre}${i}`, par, [i === 1 ? 0 : .15, 0, 0]);
        B.m(`toile_${pre}${i}`, s, box(.15, .26, .016), i === 3 ? fonce(col, .85) : col, [.075, 0, 0]); par = s;
      }
    }
  },
  etats(P) {
    const onde = (u, k = 1) => ({ seg_on1: { r: [0, k * .3 * sin(u), 0] }, seg_on2: { r: [0, k * .4 * sin(u, -.15), 0] }, seg_on3: { r: [0, k * .45 * sin(u, -.3), 0] } });
    const ondeOff = u => ({ seg_off1: { r: [0, .06 * sin(u), 0] }, seg_off2: { r: [0, .1 * sin(u, -.15), 0] } });
    return [
      { id: 'inactif', dur: 1.2, N: 4, boucle: true, collision: 'declencheur', fn: u => ({ ...ondeOff(u), drapeau_on: { s: CACHE } }) },
      { id: 'activation', dur: .7, N: 7, boucle: false, collision: 'declencheur', suivant: 'actif',
        fn: u => ({ drapeau_off: { s: u < .15 ? 1 : CACHE }, drapeau_on: { s: .4 + .6 * hold(u, 0, .4), p: [0, -.58 * (1 - surtir(u)), 0] }, ...onde(u, hold(u, .5, 1)) }) },
      { id: 'actif', dur: .8, N: 4, boucle: true, collision: 'declencheur', fn: u => ({ drapeau_off: { s: CACHE }, ...onde(u) }) },
    ];
  },
  transitions: () => [T('inactif', 'toucher', 'activation')],
  points: () => ({ sommet: [0, 1.15, 0] }),
});

/* ===== COLLECTIBLES ===== */
def({
  id: 'piece', famille: 'collectible', label: 'Pièce', vue: { dir: 's', pitch: 0 }, cadre: .5, ancre: [0, .25, 0], initial: 'tourne',
  params: [pCoul('couleur', 'Or', '#f2c230'), pTaille],
  cache: () => ['etincelle_1', 'etincelle_2', 'etincelle_3', 'etincelle_4'],
  construire(P, B) {
    const g = B.g('piece', null, [0, .25, 0]), r = B.g('rotation', g);
    B.m('disque', r, cyl(.15, .04, 22), fonce(P.couleur, .85), [0, 0, 0], [Math.PI / 2, 0, 0]);
    B.m('face_av', r, cyl(.115, .046, 22), clair(P.couleur, .15), [0, 0, 0], [Math.PI / 2, 0, 0]);
    B.m('emblème', r, box(.04, .12, .054), fonce(P.couleur, .8), [0, 0, 0]);
    [[-.12, .12, 0], [.14, .08, 0], [0, -.14, 0], [.1, -.1, 0]].forEach((q, i) => B.m('etincelle_' + (i + 1), null, octa(.025), '#ffffff', [q[0], .25 + q[1], .06], [0, 0, 0], 1, { lum: 1 }));
  },
  etats() {
    return [
      { id: 'tourne', dur: .8, N: 8, boucle: true, collision: 'declencheur', fn: u => ({ rotation: { r: [0, TAU * u, 0] }, piece: { p: [0, .015 * sin(u), 0] } }) },
      { id: 'prise', dur: .3, N: 4, boucle: false, collision: 'aucune', fn: u => ({ rotation: { r: [0, TAU * u * 2, 0] }, piece: { p: [0, .16 * lisse(u), 0], s: Math.max(CACHE, (1 + .3 * Math.sin(Math.PI * u)) * (1 - hold(u, .6, 1) * .7)) },
        ...Object.fromEntries([1, 2, 3, 4].map(i => ['etincelle_' + i, { s: Math.max(CACHE, Math.sin(Math.PI * hold(u, .1, 1)) * 1.4) }])) }) },
    ];
  },
  transitions: () => [T('tourne', 'ramasser', 'prise')],
  points: () => ({ centre: [0, .25, 0] }),
});

def({
  id: 'coeur', famille: 'collectible', label: 'Cœur (vie)', vue: { dir: 's', pitch: 0 }, cadre: .5, ancre: [0, .22, 0], initial: 'bat',
  params: [pCoul('couleur', 'Couleur', '#e0344a'), pTaille],
  cache: () => ['etincelle_1', 'etincelle_2', 'etincelle_3'],
  construire(P, B) {
    const s = new THREE.Shape(); s.moveTo(0, -.5); s.bezierCurveTo(-1.1, .15, -.5, .85, 0, .38); s.bezierCurveTo(.5, .85, 1.1, .15, 0, -.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 2, curveSegments: 14 }); geo.scale(.2, .2, .2); geo.translate(0, 0, -.03);
    const g = B.g('coeur', null, [0, .22, 0]), r = B.g('rotation', g);
    B.m('forme', r, geo, P.couleur); B.m('reflet', r, sph(.03, .045, .012), '#ffd0d6', [-.07, .08, .045]);
    [[-.14, .1], [.15, .13], [0, -.17]].forEach((q, i) => B.m('etincelle_' + (i + 1), null, octa(.022), '#ffffff', [q[0], .22 + q[1], .08], [0, 0, 0], 1, { lum: 1 }));
  },
  etats() {
    return [
      { id: 'bat', dur: .8, N: 6, boucle: true, collision: 'declencheur', fn: u => { const b = Math.max(0, sin(u, 0, 2)) ** 2; return { coeur: { s: 1 + .13 * b, p: [0, .01 * sin(u), 0] }, rotation: { r: [0, .35 * sin(u), 0] } }; } },
      { id: 'pris', dur: .3, N: 4, boucle: false, collision: 'aucune', fn: u => ({ coeur: { p: [0, .12 * lisse(u), 0], s: Math.max(CACHE, (1 + .3 * Math.sin(Math.PI * u)) * (1 - hold(u, .6, 1) * .7)) },
        ...Object.fromEntries([1, 2, 3].map(i => ['etincelle_' + i, { s: Math.max(CACHE, Math.sin(Math.PI * hold(u, .1, 1)) * 1.5) }])) }) },
    ];
  },
  transitions: () => [T('bat', 'ramasser', 'pris')],
  points: () => ({ centre: [0, .22, 0] }),
});

def({
  id: 'cle', famille: 'collectible', label: 'Clé', vue: { dir: 's', pitch: 0 }, cadre: .5, ancre: [0, .25, 0], initial: 'tourne',
  params: [pCoul('couleur', 'Métal', '#f0c93c'), pTaille],
  cache: () => ['etincelle_1', 'etincelle_2', 'etincelle_3'],
  construire(P, B) {
    const g = B.g('cle', null, [0, .25, 0]), r = B.g('rotation', g);
    B.m('anneau', r, tore(.07, .026), P.couleur, [0, .13, 0]);
    B.m('tige', r, box(.04, .27, .04), P.couleur, [0, -.03, 0]); B.m('dent_1', r, box(.09, .04, .04), P.couleur, [.065, -.14, 0]); B.m('dent_2', r, box(.065, .04, .04), P.couleur, [.05, -.07, 0]);
    [[-.12, .15], [.13, .05], [-.02, -.16]].forEach((q, i) => B.m('etincelle_' + (i + 1), null, octa(.022), '#ffffff', [q[0], .25 + q[1], .06], [0, 0, 0], 1, { lum: 1 }));
  },
  etats() {
    return [
      { id: 'tourne', dur: 1, N: 8, boucle: true, collision: 'declencheur', fn: u => ({ rotation: { r: [0, TAU * u, 0] }, cle: { p: [0, .015 * sin(u, 0, 2), 0] } }) },
      { id: 'prise', dur: .3, N: 4, boucle: false, collision: 'aucune', fn: u => ({ rotation: { r: [0, TAU * u, 0] }, cle: { p: [0, .16 * lisse(u), 0], s: Math.max(CACHE, (1 + .25 * Math.sin(Math.PI * u)) * (1 - hold(u, .6, 1) * .7)) },
        ...Object.fromEntries([1, 2, 3].map(i => ['etincelle_' + i, { s: Math.max(CACHE, Math.sin(Math.PI * hold(u, .1, 1)) * 1.5) }])) }) },
    ];
  },
  transitions: () => [T('tourne', 'ramasser', 'prise')],
  points: () => ({ centre: [0, .25, 0] }),
});

/* ===== PROJECTILES (pointent vers +Z, vue « e » = vers la droite) ===== */
def({
  id: 'boule', famille: 'projectile', label: 'Boule d\'énergie', vue: { dir: 'e', pitch: 0 }, cadre: .6, ancre: [0, .3, 0], initial: 'vol',
  params: [pCoul('couleur', 'Flamme', '#ff9a2f'), pTaille],
  cache: () => ['choc_noyau', 'choc_flamme', 'choc_1', 'choc_2', 'choc_3', 'choc_4', 'choc_5', 'choc_6'],
  construire(P, B) {
    const g = B.g('boule', null, [0, .3, 0]);
    B.m('halo', g, sph(.115), fonce(P.couleur, .85), [0, 0, 0], [0, 0, 0], 1, { lum: .45 }); B.m('coeur', g, sph(.085), clair(P.couleur, .3), [0, 0, .03], [0, 0, 0], 1, { lum: .5, devant: true }); B.m('noyau', g, sph(.05), '#fff3b0', [0, 0, .03], [0, 0, 0], 1, { lum: .8, devant: true });
    for (let i = 1; i <= 3; i++) B.m('queue_' + i, g, cone(.075 - i * .014, .13 + i * .02, 10), i === 3 ? '#e04a2a' : P.couleur, [0, 0, -.085 - i * .055], [-Math.PI / 2, 0, 0], 1, { lum: .5 });
    B.m('choc_flamme', g, sph(.17), P.couleur, [0, 0, 0], [0, 0, 0], 1, { lum: .5 }); B.m('choc_noyau', g, sph(.11), '#fff3b0', [0, 0, .05], [0, 0, 0], 1, { lum: .8, devant: true });
    for (let i = 1; i <= 6; i++) B.m('choc_' + i, g, octa(.03), '#ffd24a', [0, 0, 0], [0, 0, 0], 1, { lum: .8 });
  },
  etats() {
    const base = {};
    return [
      { id: 'vol', dur: .3, N: 4, boucle: true, collision: 'dangereux', fn: u => ({ halo: { s: 1 + .08 * sin(u) }, noyau: { s: 1 + .2 * sin(u, .25) },
        queue_1: { s: [1, 1, 1 + .25 * sin(u)] }, queue_2: { s: [1, 1, 1 + .3 * sin(u, .2)] }, queue_3: { s: [1, 1, 1 + .35 * sin(u, .4)] }, ...base }) },
      { id: 'impact', dur: .35, N: 5, boucle: false, collision: 'aucune', fn: u => { const av = u < .12;   // 1re image : la boule touche encore, puis l'éclatement
        return ({ halo: { s: av ? 1 : CACHE }, coeur: { s: av ? 1 : CACHE }, noyau: { s: av ? 1 : CACHE }, queue_1: { s: av ? 1 : CACHE }, queue_2: { s: av ? 1 : CACHE }, queue_3: { s: av ? 1 : CACHE },
        choc_flamme: { s: av ? CACHE : kf(u, [[.12, .5], [.45, 1.4], [1, .3]]) }, choc_noyau: { s: av ? CACHE : Math.max(CACHE, kf(u, [[.12, .5], [.35, 1.2], [.75, .15], [1, CACHE]])) },
        ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => { const a = i / 6 * TAU, r = .22 * hold(u, 0, 1); return ['choc_' + i, { p: [0, Math.sin(a) * r, Math.cos(a) * r], s: av ? CACHE : Math.max(CACHE, 1.2 * (1 - hold(u, .5, 1))) }]; })) }); } },
    ];
  },
  transitions: () => [T('vol', 'toucher', 'impact')],
  points: () => ({ pointe: [0, .3, .12], queue: [0, .3, -.25] }),
});

def({
  id: 'fleche', famille: 'projectile', label: 'Flèche', vue: { dir: 'e', pitch: 0 }, cadre: .5, ancre: [0, .25, 0], initial: 'vol',
  params: [pCoul('couleur', 'Plumes', '#d4524a'), pTaille],
  cache: () => [],
  construire(P, B) {
    const g = B.g('fleche', null, [0, .25, 0]), t = B.g('tige_grp', g);
    B.m('hampe', t, cyl(.013, .5, 8), '#9a7448', [0, 0, 0], [Math.PI / 2, 0, 0]); B.m('pointe', t, cone(.035, .11, 10), '#d7dbe3', [0, 0, .3], [Math.PI / 2, 0, 0]);
    for (const [k, a] of [['h', 0], ['b', Math.PI / 2]]) B.m('plume_' + k, t, box(k === 'h' ? .006 : .09, k === 'h' ? .09 : .006, .12), P.couleur, [0, 0, -.2], [0, 0, a * 0]);
    B.m('encoche', t, cyl(.018, .02, 8), '#4a3a28', [0, 0, -.255], [Math.PI / 2, 0, 0]);
  },
  etats() {
    return [
      { id: 'vol', dur: .3, N: 4, boucle: true, collision: 'dangereux', fn: u => ({ tige_grp: { r: [.02 * sin(u), 0, 0] }, plume_h: { s: [1, 1 + .08 * sin(u, .25), 1] } }) },
      { id: 'fiche', dur: .4, N: 5, boucle: false, collision: 'aucune', fn: u => ({ tige_grp: { r: [.22 * Math.sin(u * 14) * (1 - u) ** 1.5, 0, 0] } }) },
    ];
  },
  transitions: () => [T('vol', 'toucher', 'fiche')],
  points: () => ({ pointe: [0, .25, .35], queue: [0, .25, -.26] }),
});

/* ===== EFFETS ===== */
def({
  id: 'eclat', famille: 'effet', label: 'Explosion / éclat', vue: { dir: 's', pitch: 0 }, cadre: 1, ancre: [0, .4, 0], initial: 'explosion',
  params: [pCoul('couleur', 'Flamme', '#ff9a1f'), pTaille],
  cache: () => [],
  construire(P, B) {
    const c = [0, .4, 0], g = B.g('explosion', null, c);
    B.m('fumee', g, sph(.28), '#8d807b', [0, 0, -.06]); B.m('braise', g, sph(.24), '#e4452b', [0, 0, 0], [0, 0, 0], 1, { lum: .5 }); B.m('flamme', g, sph(.19), P.couleur, [0, 0, .05], [0, 0, 0], 1, { lum: .6 }); B.m('noyau', g, sph(.11), '#fff3b0', [0, 0, .1], [0, 0, 0], 1, { lum: .8 });
    for (let i = 1; i <= 8; i++) B.m('eclat_' + i, g, octa(.045), i % 2 ? '#ffd24a' : '#ff7a1f', [0, 0, .02], [0, 0, 0], 1, { lum: .8 });
  },
  etats() {
    return [{ id: 'explosion', dur: .45, N: 7, boucle: false, collision: 'aucune', fn: u => ({
      noyau: { s: Math.max(CACHE, kf(u, [[0, .3], [.2, 1.1], [.55, .5], [.8, CACHE]])) }, flamme: { s: kf(u, [[0, .3], [.3, 1.2], [.7, .8], [1, .35]]) }, braise: { s: kf(u, [[0, .2], [.45, 1.1], [1, .6]]) },
      fumee: { s: kf(u, [[0, CACHE], [.4, .6], [1, .75]]) },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => { const a = (i - .5) / 8 * TAU, r = .75 * hold(u, 0, 1) ** .7; return ['eclat_' + i, { p: [Math.cos(a) * r, Math.sin(a) * r * .9 + (u * u) * -.1, 0], s: Math.max(CACHE, 1.6 * (1 - hold(u, .45, 1))), r: [0, 0, u * 6] }]; })) }) }];
  },
  transitions: () => [],
  points: () => ({ centre: [0, .4, 0] }),
});

def({
  id: 'poussiere', famille: 'effet', label: 'Poussière (atterrissage, dérapage)', vue: { dir: 's', pitch: 0 }, cadre: 1, ancre: [0, 0, 0], initial: 'poussiere',
  params: [pCoul('couleur', 'Teinte', '#cfc3aa'), pTaille],
  cache: () => [],
  construire(P, B) {
    [[-.1, .05], [.1, .05], [-.2, .03], [.2, .03], [0, .08]].forEach((q, i) => B.m('bouffee_' + (i + 1), null, sph(.085 - Math.abs(q[0]) * .15), i % 2 ? clair(P.couleur, .15) : P.couleur, [q[0], q[1], .02 * i]));
  },
  etats() {
    const dir = [-1, 1, -1.8, 1.8, 0];
    return [{ id: 'poussiere', dur: .4, N: 5, boucle: false, collision: 'aucune', fn: u => Object.fromEntries(dir.map((d, i) => ['bouffee_' + (i + 1),
      { p: [d * .22 * lisse(u), .22 * lisse(u) * (i === 4 ? 1.3 : .6), 0], s: Math.max(CACHE, (.4 + 1.5 * hold(u, 0, .6)) * (1 - .55 * hold(u, .55, 1))) }])) }];
  },
  transitions: () => [],
  points: () => ({ sol: [0, 0, 0] }),
});

/* ===== MONSTRES NON HUMANOÏDES ===== */
const ETATS_MONSTRE = ['idle', 'deplacement', 'attaque', 'degat', 'mort'];
const TR_MONSTRE = (mobile = true) => [...(mobile ? [T('idle', 'bouger', 'deplacement'), T('deplacement', 'arreter', 'idle')] : []),
  T('idle', 'attaquer', 'attaque'), T('idle', 'blesse', 'degat'), ...(mobile ? [T('deplacement', 'blesse', 'degat')] : []), T('attaque', 'blesse', 'degat'), T('idle', 'tue', 'mort'), ...(mobile ? [T('deplacement', 'tue', 'mort')] : []), T('degat', 'tue', 'mort')];
/* œil rond avec pupille, tourné vers +Z */
function oeil(B, nom, parent, pos, r, pupille = '#111') { B.m(nom, parent, sph(r), '#ffffff', pos); B.m(nom + '_p', parent, sph(r * .55), pupille, [pos[0] * 1.0, pos[1], pos[2] + r * .62]); }

def({
  id: 'slime', famille: 'monstre', label: 'Slime (blob)', vue: { dir: 'se', pitch: 8 }, cadre: 1, initial: 'idle', miroir: true,
  params: [pCoul('couleur', 'Corps', '#4fd16a'), pNb('largeur', 'Largeur', 1, .6, 1.6, .05), pTaille],
  cache: () => ['flash'],
  construire(P, B) {
    const w = .3 * P.largeur, c = B.g('corps', null, [0, 0, 0]);
    const dome = new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, Math.PI * .56).scale(w, .27, w * .95);
    B.m('masse', c, dome, P.couleur, [0, .02, 0]); B.m('reflet', c, sph(.05, .035, .02), clair(P.couleur, .7), [-.09, .21, .14]);
    B.m('flash', c, new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, Math.PI * .56).scale(w * 1.06, .29, w * 1.0), '#ffffff', [0, .015, 0], [0, 0, 0], 1, { basic: true });
    oeil(B, 'oeil_g', c, [-.085 * P.largeur, .14, .235 * P.largeur], .06); oeil(B, 'oeil_d', c, [.085 * P.largeur, .14, .235 * P.largeur], .06);
    B.m('bouche', c, box(.08, .016, .02), fonce(P.couleur, .35), [0, .07, .27 * P.largeur]);
  },
  etats() {
    const hop = u => { const sy = kf(u, [[0, 1], [.18, .72], [.32, 1.28], [.5, 1.12], [.68, .95], [.78, .68], [.9, 1.06], [1, 1]]), h = kf(u, [[0, 0], [.18, 0], [.32, .06], [.5, .3], [.68, .06], [.78, 0], [1, 0]]);
      return { corps: { s: [vol(sy), sy, vol(sy)], p: [0, h, 0], r: [.12 * kf(u, [[0, 0], [.3, 1], [.7, -.5], [1, 0]]), 0, 0] } }; };
    const lunge = u => { const sz = kf(u, [[0, 1], [.3, .78], [.55, 1.6], [.8, 1.1], [1, 1]]), sy = kf(u, [[0, 1], [.3, .85], [.55, .78], [.8, 1.0], [1, 1]]);
      return { corps: { s: [vol(sz * sy) , sy, sz], p: [0, 0, kf(u, [[0, 0], [.3, -.05], [.55, .2], [.85, .03], [1, 0]])] } }; };
    return [
      { id: 'idle', dur: 1, N: 4, boucle: true, collision: 'solide', fn: u => { const s = 1 + .06 * sin(u); return { corps: { s: [vol(s), s, vol(s)] }, }; } },
      { id: 'deplacement', dur: .8, N: 8, boucle: true, collision: 'solide', fn: hop },
      { id: 'attaque', dur: .5, N: 6, boucle: false, collision: 'solide', suivant: 'idle', fenetre: [.45, .75], fn: lunge },
      { id: 'degat', dur: .4, N: 4, boucle: false, collision: 'solide', suivant: 'idle', fn: u => { const sy = kf(u, [[0, 1], [.3, .7], [.7, 1.1], [1, 1]]); return { corps: { s: [1 / Math.sqrt(sy) * 1.1, sy, 1 / Math.sqrt(sy)], p: [0, 0, -.07 * Math.sin(Math.PI * u)] }, flash: { s: u > .1 && u < .7 ? 1 : CACHE } }; } },
      { id: 'mort', dur: .7, N: 6, boucle: false, collision: 'aucune', fn: u => { const sy = kf(u, [[0, 1], [.25, 1.15], [.7, .3], [1, .22]]); return { corps: { s: [1 + .7 * hold(u, .2, 1), sy, 1 + .45 * hold(u, .2, 1)] },
        oeil_g: { s: 1 - hold(u, .3, .9) * .5, p: [0, -.04 * hold(u, .3, 1), 0] }, oeil_d: { s: 1 - hold(u, .3, .9) * .5, p: [0, -.04 * hold(u, .3, 1), 0] } }; } },
    ];
  },
  transitions: () => TR_MONSTRE(true),
  points: () => ({ bouche: [0, .06, .25], dessus: [0, .3, 0] }),
});

/* aile : pivot à l'épaule ; deux segments pour que le bout retarde sur le battement */
function aile(B, k, s, parent, L, couleur, oiseau) {
  const h = B.g('aile_' + k, parent, [s * .1, .05, -.01]), h2 = B.g('aile2_' + k, h, [s * L * .55, 0, 0]);
  const sh1 = new THREE.Shape(); sh1.moveTo(0, .1); sh1.lineTo(s * L * .55, .07); sh1.lineTo(s * L * .55, -.17); sh1.lineTo(0, -.14);
  const sh2 = new THREE.Shape(); if (oiseau) { sh2.moveTo(0, .07); sh2.lineTo(s * L * .5, .0); sh2.lineTo(s * L * .38, -.14); sh2.lineTo(0, -.17); }
  else { sh2.moveTo(0, .07); sh2.lineTo(s * L * .5, .05); sh2.lineTo(s * L * .4, -.03); sh2.lineTo(s * L * .32, -.2); sh2.lineTo(s * L * .14, -.07); sh2.lineTo(0, -.17); }
  const plat = sh => new THREE.ExtrudeGeometry(sh, { depth: .012, bevelEnabled: false });   // membrane dans le plan XY (face à la caméra)
  B.m('membrane_' + k, h, plat(sh1), clair(couleur, .12), [0, .005, 0], [0, 0, 0], 1, { double: true });
  B.m('membrane2_' + k, h2, plat(sh2), clair(couleur, .22), [0, .005, 0], [0, 0, 0], 1, { double: true });
  B.m('bras_' + k, h, cyl(.014, L * .58, 6), fonce(couleur, .6), [s * L * .27, .0, .0], [0, 0, Math.PI / 2]);
}
def({
  id: 'volant', famille: 'monstre', label: 'Volant (chauve-souris / oiseau)', vue: { dir: 's', pitch: 8 }, vueP: P => P.type === 'oiseau' ? { dir: 'se', pitch: 8 } : { dir: 's', pitch: 8 }, cadre: 1, ancre: [0, .55, 0], initial: 'idle', miroir: true,
  params: [pCh('type', 'Type', 'chauve-souris', ['chauve-souris', 'oiseau']), pCoul('couleur', 'Couleur', '#6a4a9a'), pNb('envergure', 'Longueur d\'aile', .32, .18, .5, .02), pTaille],
  cache: () => ['flash'],
  construire(P, B) {
    const oi = P.type === 'oiseau', c = B.g('corps_v', null, [0, .55, 0]), L = P.envergure, cl2 = P.couleur;
    B.m('torse', c, sph(.12, .11, .16), cl2); B.m('ventre', c, sph(.09, .08, .1), oi ? '#f4e6c8' : clair(cl2, .35), [0, -.035, .05]);
    B.m('flash', c, sph(.128, .118, .172), '#ffffff', [0, 0, 0], [0, 0, 0], 1, { basic: true });
    const t = B.g('tete', c, [0, .05, .15]);
    B.m('crane', t, sph(.085), cl2, [0, .02, .03]);
    oeil(B, 'oeil_g', t, [-.04, .045, .09], .026, oi ? '#111' : '#c01818'); oeil(B, 'oeil_d', t, [.04, .045, .09], .026, oi ? '#111' : '#c01818');
    if (oi) { B.m('bec', t, cone(.03, .09, 8), '#f0a030', [0, .0, .13], [Math.PI / 2, 0, 0]); B.m('huppe', t, cone(.025, .08, 6), fonce(cl2, .8), [0, .1, .0], [-.4, 0, 0]); }
    else { B.m('oreille_g', t, cone(.03, .09, 6), fonce(cl2, .7), [-.045, .12, .0], [0, 0, .25]); B.m('oreille_d', t, cone(.03, .09, 6), fonce(cl2, .7), [.045, .12, .0], [0, 0, -.25]);
      B.m('croc_g', t, cone(.008, .03, 5), '#fff', [-.02, -.04, .1], [Math.PI, 0, 0]); B.m('croc_d', t, cone(.008, .03, 5), '#fff', [.02, -.04, .1], [Math.PI, 0, 0]); }
    B.m('patte_vg', c, cyl(.012, .07, 6), '#2a2030', [-.04, -.12, .02]); B.m('patte_vd', c, cyl(.012, .07, 6), '#2a2030', [.04, -.12, .02]);
    if (oi) B.m('queue_v', c, box(.1, .012, .13), fonce(cl2, .8), [0, 0, -.2], [.25, 0, 0]);
    aile(B, 'g', -1, c, L, cl2, oi); aile(B, 'd', 1, c, L, cl2, oi);
  },
  etats() {
    const bat = (u, amp = 1, k = 1, v = {}) => { const a = sin(u, 0, k); return { corps_v: { p: [0, -.035 * a * amp, 0], ...v.corps }, aile_g: { r: [0, 0, -(.2 + .75 * a) * amp - .0] }, aile_d: { r: [0, 0, (.2 + .75 * a) * amp] },
      aile2_g: { r: [0, 0, -.6 * sin(u, -.12, k) * amp] }, aile2_d: { r: [0, 0, .6 * sin(u, -.12, k) * amp] } }; };
    const plong = u => { const pitch = kf(u, [[0, 0], [.3, -.5], [.55, .7], [.8, .3], [1, 0]]), z = kf(u, [[0, 0], [.3, -.08], [.55, .22], [.8, .1], [1, 0]]), y = kf(u, [[0, 0], [.3, .1], [.55, -.22], [.8, -.08], [1, 0]]),
      f = kf(u, [[0, 0], [.3, -.5], [.55, 1], [1, 0]]);
      return { corps_v: { r: [pitch, 0, 0], p: [0, y, z], s: 1 + .25 * f }, aile_g: { r: [0, 0, -(.3 + 1.0 * f + .25 * sin(u, 0, 2))] }, aile_d: { r: [0, 0, .3 + 1.0 * f + .25 * sin(u, 0, 2)] }, aile2_g: { r: [0, 0, -.5 * f] }, aile2_d: { r: [0, 0, .5 * f] },
        patte_vg: { r: [-.9 * hold(u, .4, .6), 0, 0] }, patte_vd: { r: [-.9 * hold(u, .4, .6), 0, 0] } }; };
    return [
      { id: 'idle', dur: .6, N: 6, boucle: true, collision: 'solide', fn: u => bat(u, .8, 1) },
      { id: 'deplacement', dur: .4, N: 6, boucle: true, collision: 'solide', fn: u => bat(u, 1, 1, { corps: { r: [.22, 0, 0] } }) },
      { id: 'attaque', dur: .7, N: 6, boucle: false, collision: 'solide', suivant: 'idle', fenetre: [.45, .7], fn: plong },
      { id: 'degat', dur: .4, N: 4, boucle: false, collision: 'solide', suivant: 'idle', fn: u => ({ ...bat(u, .5, 2), corps_v: { r: [-.5 * Math.sin(Math.PI * u), 0, .3 * Math.sin(Math.PI * u * 2)], p: [0, 0, -.08 * Math.sin(Math.PI * u)] }, flash: { s: u > .1 && u < .7 ? 1 : CACHE } }) },
      { id: 'mort', dur: .8, N: 6, boucle: false, collision: 'aucune', fn: u => ({ corps_v: { p: [0, -.45 * hold(u, .1, 1) ** 1.5, 0], r: [0, 0, Math.PI * hold(u, 0, .9)] },
        aile_g: { r: [0, 0, -.9 * (1 - hold(u, 0, .6))] }, aile_d: { r: [0, 0, .9 * (1 - hold(u, 0, .6))] }, aile2_g: { r: [0, 0, .25 * hold(u, 0, .6)] }, aile2_d: { r: [0, 0, -.25 * hold(u, 0, .6)] } }) },
    ];
  },
  transitions: () => TR_MONSTRE(true),
  points: () => ({ bec: [0, .62, .3], centre: [0, .55, 0] }),
});

/* pattes à deux segments : paires = 2 (quadrupède) ou 3 (six pattes) ; marche en diagonale / en trépied */
def({
  id: 'quadrupede', famille: 'monstre', label: 'Quadrupède (loup, bête, insecte à 6 pattes)', vue: { dir: 'e', pitch: 8 }, cadre: 1, initial: 'idle', miroir: true,
  params: [pCoul('couleur', 'Pelage', '#8a6a46'), pCoul('ventre', 'Ventre', '#e8d5ad'), pNb('paires', 'Paires de pattes (2 = quadrupède, 3 = insecte)', 2, 2, 3, 1), pNb('longueur', 'Longueur du corps', 1, .7, 1.5, .05), pTaille],
  cache: () => ['flash'],
  construire(P, B) {
    const Lg = P.longueur, np = Math.round(P.paires), H = .3, tout = B.g('tout', null, [0, H, 0]), cl2 = P.couleur;
    B.m('corps', tout, sph(.105, .1, .21 * Lg), cl2); B.m('ventre', tout, sph(.09, .07, .17 * Lg), P.ventre, [0, -.035, .01]);
    B.m('flash', tout, sph(.112, .107, .222 * Lg), '#ffffff', [0, 0, 0], [0, 0, 0], 1, { basic: true });
    const t = B.g('tete', tout, [0, .05, .17 * Lg + .03]);
    B.m('crane', t, sph(.088, .082, .095), cl2, [0, .03, .06]); B.m('museau', t, box(.075, .06, .11), fonce(cl2, 1.1), [0, 0, .15]); B.m('truffe', t, sph(.022), '#1c1612', [0, .02, .21]);
    const jm = B.g('machoire', t, [0, -.012, .1]); B.m('machoire_m', jm, box(.062, .024, .1), fonce(cl2, .85), [0, 0, .05]); B.m('croc_h', t, cone(.011, .04, 5), '#fff', [.025, -.025, .19], [Math.PI, 0, 0]);
    B.m('croc_b', jm, cone(.011, .04, 5), '#fff', [.02, .03, .09], [0, 0, 0]);
    oeil(B, 'oeil_g', t, [-.055, .075, .105], .024); oeil(B, 'oeil_d', t, [.055, .075, .105], .024);
    B.m('oreille_g', t, cone(.032, .08, 6), fonce(cl2, .75), [-.05, .13, .03], [0, 0, .2]); B.m('oreille_d', t, cone(.032, .08, 6), fonce(cl2, .75), [.05, .13, .03], [0, 0, -.2]);
    const q1 = B.g('queue1', tout, [0, .04, -.2 * Lg], [-.6, 0, 0]); B.m('queue1_m', q1, cyl(.022, .12, 8), cl2, [0, 0, -.05], [Math.PI / 2, 0, 0]);
    const q2 = B.g('queue2', q1, [0, 0, -.11], [-.25, 0, 0]); B.m('queue2_m', q2, cyl(.016, .11, 8), fonce(cl2, 1.15), [0, 0, -.05], [Math.PI / 2, 0, 0]);
    for (let j = 0; j < np; j++) for (const [k, s] of [['g', -1], ['d', 1]]) {
      const z = np === 2 ? (j ? -.14 : .14) * Lg : (.2 - j * .2) * Lg, hip = B.g(`patte_${j}${k}`, tout, [s * .08, -.05, z]);
      B.m(`cuisse_${j}${k}`, hip, cyl(.026, .13, 8, .022), cl2, [0, -.055, 0]);
      const kn = B.g(`bas_${j}${k}`, hip, [0, -.12, 0]); B.m(`mollet_${j}${k}`, kn, cyl(.02, .13, 8, .02), fonce(cl2, .85), [0, -.06, 0]); B.m(`pied_${j}${k}`, kn, box(.045, .025, .07), fonce(cl2, .5), [0, -.125, .012]);
    }
  },
  etats(P) {
    const np = Math.round(P.paires), pattes = (u, A, K, ph0 = 0) => { const o = {}; for (let j = 0; j < np; j++) for (const [k, s] of [['g', 0], ['d', 1]]) {
      const ps = ph0 + ((j + s) % 2) * .5, a = sin(u, ps), c = Math.cos(TAU * (u + ps)); o[`patte_${j}${k}`] = { r: [A * a, 0, 0] }; o[`bas_${j}${k}`] = { r: [K * Math.max(0, -c), 0, 0] }; } return o; };
    const lun = u => ({ tout: { p: [0, -.04 * hold(u, 0, .3) * (1 - hold(u, .6, 1)), .2 * kf(u, [[0, 0], [.3, -.4], [.5, 1], [.8, .2], [1, 0]])], r: [-.25 * kf(u, [[0, 0], [.3, 1], [.55, -.8], [1, 0]]), 0, 0] },
      machoire: { r: [.7 * kf(u, [[0, 0], [.35, .2], [.5, 1], [.68, 0], [1, 0]]), 0, 0] }, tete: { r: [-.2 * kf(u, [[0, 0], [.3, 1], [.5, -.3], [1, 0]]), 0, 0] } });
    return [
      { id: 'idle', dur: 1.2, N: 4, boucle: true, collision: 'solide', fn: u => ({ tout: { s: [1, 1 + .025 * sin(u), 1] }, queue1: { r: [0, .25 * sin(u), 0] }, queue2: { r: [0, .3 * sin(u, -.1), 0] }, tete: { r: [.05 * sin(u, .2), 0, 0] } }) },
      { id: 'deplacement', dur: .8, N: 8, boucle: true, collision: 'solide', fn: u => ({ ...pattes(u, .55, 1.0), tout: { p: [0, .02 * Math.abs(sin(u, 0, 1)), 0], r: [.02 * sin(u, 0, 2), 0, 0] }, tete: { r: [.06 * sin(u, .25, 2), 0, 0] }, queue1: { r: [0, .35 * sin(u, 0, 2), 0] } }) },
      { id: 'attaque', dur: .6, N: 6, boucle: false, collision: 'solide', suivant: 'idle', fenetre: [.45, .7], fn: lun },
      { id: 'degat', dur: .4, N: 4, boucle: false, collision: 'solide', suivant: 'idle', fn: u => ({ tout: { p: [0, 0, -.06 * Math.sin(Math.PI * u)], r: [-.18 * Math.sin(Math.PI * u), 0, 0] }, tete: { r: [-.5 * Math.sin(Math.PI * u), 0, 0] }, machoire: { r: [.4 * Math.sin(Math.PI * u), 0, 0] }, flash: { s: u > .1 && u < .7 ? 1 : CACHE } }) },
      { id: 'mort', dur: .8, N: 6, boucle: false, collision: 'aucune', fn: u => { const roul = hold(u, .1, .85), o = pattes(0, 0, 0); for (const k of Object.keys(o)) { o[k] = { r: [-.2 * roul, 0, ((k.includes('g') ? -1 : 1)) * .35 * roul] }; }
        return { ...o, tout: { p: [0, -.15 * roul + .1 * Math.sin(Math.PI * roul), 0], r: [0, 0, Math.PI * roul] }, tete: { r: [-.4 * roul, 0, 0] }, machoire: { r: [.5 * roul, 0, 0] } }; } },
    ];
  },
  transitions: () => TR_MONSTRE(true),
  points: () => ({ gueule: [0, .38, .36], centre: [0, .3, 0] }),
});

def({
  id: 'crabe', famille: 'monstre', label: 'Crabe (rampant, pinces)', vue: { dir: 's', pitch: 22 }, cadre: 1, initial: 'idle',
  params: [pCoul('couleur', 'Carapace', '#e0643a'), pNb('pinces', 'Taille des pinces', 1.5, .7, 1.8, .05), pNb('taille', 'Taille (1 = héros)', 1.35, .4, 1.8, .05)],
  cache: () => ['flash'],
  construire(P, B) {
    const t = B.g('tout', null, [0, .105, 0]), c = P.couleur;
    B.m('carapace', t, sph(.2, .1, .14), c); B.m('dos', t, sph(.15, .06, .1), clair(c, .15), [0, .055, -.01]); B.m('flash', t, sph(.212, .108, .15), '#ffffff', [0, 0, 0], [0, 0, 0], 1, { basic: true });
    for (const [k, s] of [['g', -1], ['d', 1]]) {
      const oe = B.g('pedoncule_' + k, t, [s * .07, .08, .1]); B.m('tige_' + k, oe, cyl(.014, .09, 6), fonce(c, .8), [0, .045, 0]); oeil(B, 'oeil_' + k, oe, [0, .11, .012], .04);
      const br = B.g('bras_' + k, t, [s * .17, .02, .09], [0, 0, s * 1.0]); B.m('bras_m_' + k, br, box(.1, .035, .035), fonce(c, .85), [s * .05, 0, 0]);
      const av = B.g('avbras_' + k, br, [s * .1, 0, 0], [0, 0, s * -.7]); B.m('avbras_m_' + k, av, box(.075, .04, .04), c, [s * .037, 0, 0]);
      const pc = P.pinces, ph = B.g('pince_h_' + k, av, [s * .07, .0, 0], [0, 0, s * -.15]), pb = B.g('pince_b_' + k, av, [s * .07, -.0, 0], [0, 0, s * .25]);
      B.m('doigt_h_' + k, ph, cone(.03 * pc, .12 * pc, 7), clair(c, .3), [s * .06 * pc, .0, 0], [0, 0, -s * Math.PI / 2]); B.m('doigt_b_' + k, pb, cone(.028 * pc, .11 * pc, 7), clair(c, .12), [s * .055 * pc, -.0, 0], [0, 0, -s * Math.PI / 2]);
      for (let i = 0; i < 3; i++) { const pa = B.g(`patte_${k}${i}`, t, [s * .16, -.015, .07 - i * .07], [0, 0, s * -.55]); B.m(`patte_m_${k}${i}`, pa, box(.1, .018, .018), fonce(c, .75), [s * .045, 0, 0]);
        const bs = B.g(`patte_b_${k}${i}`, pa, [s * .09, 0, 0], [0, 0, s * .9]); B.m(`patte_bm_${k}${i}`, bs, box(.08, .016, .016), fonce(c, .65), [s * .035, 0, 0]); }
    }
  },
  etats() {
    const pincesOuv = (a, s0 = 1) => { const o = {}; for (const [k, s] of [['g', -1], ['d', 1]]) { o['pince_h_' + k] = { r: [0, 0, s * -a] }; o['pince_b_' + k] = { r: [0, 0, s * a * .6] }; } return o; };
    const pat = (u, A) => { const o = {}; for (const k of ['g', 'd']) for (let i = 0; i < 3; i++) { const ph = ((i + (k === 'g' ? 1 : 0)) % 2) * .5, s = k === 'g' ? -1 : 1;
      o[`patte_${k}${i}`] = { r: [0, 0, s * (.18 * Math.max(0, sin(u, ph)) )] }; o[`patte_b_${k}${i}`] = { r: [0, 0, s * (-.25 * Math.max(0, sin(u, ph)))] }; } return o; };
    const lev = k => ({ bras_g: { r: [0, 0, -.55 * k] }, bras_d: { r: [0, 0, .55 * k] } });
    return [
      { id: 'idle', dur: 1.2, N: 4, boucle: true, collision: 'solide', fn: u => ({ ...pincesOuv(.1 + .22 * (.5 + .5 * sin(u))), tout: { s: [1, 1 + .03 * sin(u), 1] }, pedoncule_g: { r: [.1 * sin(u, .1), 0, 0] }, pedoncule_d: { r: [.1 * sin(u, .3), 0, 0] } }) },
      { id: 'deplacement', dur: .6, N: 6, boucle: true, collision: 'solide', fn: u => ({ ...pat(u, 1), ...pincesOuv(.12), tout: { p: [0, .015 * Math.abs(sin(u, 0, 1)), 0], r: [0, 0, .05 * sin(u, 0, 1)] } }) },
      { id: 'attaque', dur: .5, N: 5, boucle: false, collision: 'solide', suivant: 'idle', fenetre: [.4, .75], fn: u => { const o = kf(u, [[0, .1], [.3, .9], [.5, .9], [.65, 0], [.85, .5], [1, .1]]); return { ...pincesOuv(o), ...lev(kf(u, [[0, 0], [.3, 1], [.6, .6], [1, 0]])), tout: { p: [0, .03 * Math.sin(Math.PI * u), .04 * Math.sin(Math.PI * u)] } }; } },
      { id: 'degat', dur: .4, N: 4, boucle: false, collision: 'solide', suivant: 'idle', fn: u => ({ ...pincesOuv(.8 * Math.sin(Math.PI * u)), tout: { p: [-.05 * Math.sin(Math.PI * u), 0, 0], r: [0, 0, -.25 * Math.sin(Math.PI * u)] }, flash: { s: u > .1 && u < .7 ? 1 : CACHE } }) },
      { id: 'mort', dur: .8, N: 6, boucle: false, collision: 'aucune', fn: u => { const r = hold(u, .05, .8), o = {}; for (const k of ['g', 'd']) for (let i = 0; i < 3; i++) { const s = k === 'g' ? -1 : 1; o[`patte_${k}${i}`] = { r: [0, 0, s * (-1.6 * r)] }; o[`patte_b_${k}${i}`] = { r: [0, 0, s * (.8 * r)] }; }
        return { ...o, ...pincesOuv(.1), ...lev(1.2 * r), tout: { r: [Math.PI * r, 0, 0], p: [0, .04 * Math.sin(Math.PI * r) - .02 * r, 0] } }; } },
    ];
  },
  transitions: () => TR_MONSTRE(true),
  points: () => ({ pince_g: [-.3, .2, .12], pince_d: [.3, .2, .12] }),
});

def({
  id: 'plante', famille: 'monstre', label: 'Plante carnivore', vue: { dir: 'e', pitch: 8 }, cadre: 1, initial: 'idle', miroir: true,
  params: [pCoul('couleur', 'Gueule', '#c8323c'), pCoul('feuillage', 'Tige et feuilles', '#38963f'), pNb('hauteur', 'Hauteur de la tige', 1.1, .7, 1.4, .05), pNb('taille', 'Taille (1 = héros)', 1.3, .4, 1.8, .05)],
  cache: () => ['flash'],
  construire(P, B) {
    const hh = P.hauteur, cb = P.couleur, fe = P.feuillage;
    B.m('pot', null, cyl(.15, .12, 16, .12), '#a0623a', [0, .06, 0]); B.m('bord_pot', null, cyl(.14, .03, 16), '#b87646', [0, .13, 0]); B.m('terre', null, cyl(.12, .01, 16), '#3a2616', [0, .146, 0]);
    const t1 = B.g('tige1', null, [0, .14, 0]); B.m('tige1_m', t1, cyl(.026, .17 * hh, 8, .02), fe, [0, .08 * hh, 0]);
    const t2 = B.g('tige2', t1, [0, .17 * hh, 0]); B.m('tige2_m', t2, cyl(.02, .17 * hh, 8, .026), fe, [0, .085 * hh, 0]);
    B.m('feuille_g', t1, sph(.1, .012, .04), fonce(fe, .85), [-.1, .06, 0], [0, 0, .5]); B.m('feuille_d', t1, sph(.1, .012, .04), fonce(fe, .85), [.1, .09, 0], [0, 0, -.5]);
    const tete = B.g('tete', t2, [0, .17 * hh, 0]);
    const jh = B.g('machoire_haut', tete, [0, .0, -.07]), jb = B.g('machoire_bas', tete, [0, .0, -.07]);
    B.m('haut_m', jh, demi(.12, .1, .17, true), cb, [0, 0, .09], [0, 0, 0], 1, { double: true }); B.m('bas_m', jb, demi(.115, .075, .165, false), fonce(cb, .8), [0, 0, .09], [0, 0, 0], 1, { double: true });
    B.m('gorge', jb, sph(.07, .02, .1), '#6b1018', [0, .005, .08]); B.m('langue', jb, sph(.035, .012, .06), '#f08aa0', [0, .012, .12]);
    for (let i = 0; i < 4; i++) { const z = .0 + i * .07; B.m('dent_h' + i, jh, cone(.014, .045, 5), '#fff', [.09 - (i === 3 ? .04 : 0), -.018, z + .02], [Math.PI, 0, 0]); B.m('dent_hd' + i, jh, cone(.014, .045, 5), '#fff', [-.09 + (i === 3 ? .04 : 0), -.018, z + .02], [Math.PI, 0, 0]);
      B.m('dent_b' + i, jb, cone(.012, .04, 5), '#fff', [.085 - (i === 3 ? .04 : 0), .02, z + .03]); B.m('dent_bd' + i, jb, cone(.012, .04, 5), '#fff', [-.085 + (i === 3 ? .04 : 0), .02, z + .03]); }
    [[-.05, .08, .1], [.05, .09, .0], [0, .1, .17]].forEach((q, i) => B.m('tache_' + i, jh, sph(.022, .008, .022), '#f4e6d0', q));
    B.m('flash', tete, sph(.135, .11, .19), '#ffffff', [0, .0, .09], [0, 0, 0], 1, { basic: true });
  },
  etats() {
    const ouv = (a, b = a * .5) => ({ machoire_haut: { r: [-a, 0, 0] }, machoire_bas: { r: [b, 0, 0] } });
    const att = u => { const rec = kf(u, [[0, 0], [.3, 1], [.5, -.8], [.8, -.1], [1, 0]]), bouche = kf(u, [[0, .15], [.3, .35], [.5, 1.1], [.62, .1], [.7, .6], [.85, .1], [1, .15]]);
      return { ...ouv(bouche, bouche * .5), tige1: { r: [-.35 * rec, 0, 0] }, tige2: { r: [-.55 * rec, 0, 0] }, tete: { r: [.25 * rec, 0, 0] } }; };
    return [
      { id: 'idle', dur: 1.4, N: 4, boucle: true, collision: 'solide', fn: u => ({ ...ouv(.12 + .1 * (.5 + .5 * sin(u))), tige1: { r: [.08 * sin(u), 0, 0] }, tige2: { r: [.14 * sin(u, -.12), 0, 0] }, tete: { r: [.1 * sin(u, -.25), 0, 0] }, feuille_g: { r: [0, 0, .12 * sin(u, .2)] }, feuille_d: { r: [0, 0, -.12 * sin(u, .2)] } }) },
      { id: 'attaque', dur: .6, N: 6, boucle: false, collision: 'solide', suivant: 'idle', fenetre: [.45, .75], fn: att },
      { id: 'degat', dur: .4, N: 4, boucle: false, collision: 'solide', suivant: 'idle', fn: u => ({ ...ouv(.7 * Math.sin(Math.PI * u)), tige1: { r: [.25 * Math.sin(Math.PI * u), 0, 0] }, tige2: { r: [.45 * Math.sin(Math.PI * u), 0, 0] }, flash: { s: u > .1 && u < .7 ? 1 : CACHE } }) },
      { id: 'mort', dur: .8, N: 6, boucle: false, collision: 'aucune', fn: u => { const r = hold(u, .05, .9); return { ...ouv(.1 * (1 - r) + .35 * r, .1), tige1: { r: [.5 * r, 0, 0] }, tige2: { r: [1.0 * r, 0, 0] }, tete: { r: [.9 * r, 0, 0] }, feuille_g: { r: [0, 0, .5 * r] }, feuille_d: { r: [0, 0, -.5 * r] } }; } },
    ];
  },
  transitions: () => TR_MONSTRE(false),
  points: () => ({ gueule: [0, .6, .22] }),
});

/* ------------------------------------------------------------------ API publique */
export const catalogue = () => [...CAT.values()].map(s => ({ id: s.id, famille: s.famille, label: s.label, vue: s.vue, cadre: s.cadre, params: s.params }));
export const valeursDefaut = id => { const s = CAT.get(id); if (!s) throw new Error('type inconnu : ' + id); return Object.fromEntries(s.params.map(p => [p.k, p.def])); };

/* Crée l'objet : { nom, id, spec, params, racine, cadreMesh, clips[], etats[], transitions[], points, ancre3d, cadre, vue }.
   Un état d'animation : { id, clip, N, dur, boucle, statique, collision, suivant, fenetre, tmax } ; tmax = valeur à donner à « Générer » */
export function creer(id, params = {}, nom = null) {
  const spec = CAT.get(id); if (!spec) throw new Error('type inconnu : ' + id);
  const P = { ...valeursDefaut(id), ...params };
  for (const p of spec.params) { if (p.type === 'nombre') P[p.k] = cl(+P[p.k], p.min, p.max); if (p.type === 'bool') P[p.k] = !!P[p.k]; }
  const nm = (nom || id).replace(/[^\w\-]+/g, '_'), B = new Constructeur(nm, P.taille);
  spec.construire(P, B);
  const cd = (params.cadre != null ? +params.cadre : spec.cadre) || 1;
  /* cadre : boîte invisible de référence (cellule du sprite, indépendante de la forme de l'objet à un instant donné) */
  const cm = B.m('__cadre', B.racine, box(cd, cd, cd), '#ff00ff', [0, cd / 2, 0]); cm.visible = false;
  figer(B.racine);
  const cache = spec.cache(P), etats = spec.etats(P).map(e => {
    const clip = fabriquerClip(B, `${nm} · ${e.id}`, e.dur, e.fn, { boucle: !!e.boucle, cache });
    return { id: e.id, clip: clip.name, clipObj: clip, N: e.N, dur: e.dur, boucle: !!e.boucle, statique: !!e.statique, collision: e.collision || 'solide', suivant: e.suivant || null, fenetre: e.fenetre || null,
      tmax: e.boucle ? e.dur : e.N > 1 ? +(e.dur * e.N / (e.N - 1)).toFixed(5) : 1 };
  });
  const sc = P.taille;
  const O = { nom: nm, id, spec, params: P, racine: B.racine, cadreMesh: cm, noeuds: B.n, clips: etats.map(e => e.clipObj), etats, transitions: spec.transitions(P), initial: spec.initial,
    points: Object.fromEntries(Object.entries(spec.points(P)).map(([k, v]) => [k, v.map(x => x * sc)])), ancre3d: spec.ancre || [0, 0, 0], cadre: cd, vue: { ...(spec.vueP ? spec.vueP(P) : spec.vue) }, miroir: !!spec.miroir || P.type === 'oiseau' };
  verifierObjet(O);
  return O;
}
/* contrôle de cohérence (états référencés, un seul état initial, noms uniques) : jette une erreur claire si l'objet est mal décrit */
export function verifierObjet(O) {
  const ids = new Set(O.etats.map(e => e.id));
  if (ids.size !== O.etats.length) throw new Error(O.nom + ' : états en double');
  if (!ids.has(O.initial)) throw new Error(`${O.nom} : état initial « ${O.initial} » inconnu`);
  for (const e of O.etats) if (e.suivant && !ids.has(e.suivant)) throw new Error(`${O.nom} : « ${e.id} » → « ${e.suivant} » inconnu`);
  for (const t of O.transitions) if (!ids.has(t.de) || !ids.has(t.vers)) throw new Error(`${O.nom} : transition ${t.de} → ${t.vers} inconnue`);
  return true;
}

/* ------------------------------------------------------------------ données de jeu (ancres, boîtes, durées) */
const YAW = { s: 0, se: 45, e: 90, ne: 135, n: 180, nw: -135, w: -90, sw: -45 };
/* projette un point 3D (unités héros, origine aux pieds) dans la cellule T×T du sprite, comme le fait « Générer » en cadre fixe :
   caméra orthographique, demi-côté 0,725·cadre, centre à 0,675·cadre de hauteur */
export function projeter(pt, { T, cadre = 1, dir = 's', pitch = 0 }) {
  const a = (YAW[dir] || 0) * R, p = pitch * R, x = pt[0] * Math.cos(a) + pt[2] * Math.sin(a), z = -pt[0] * Math.sin(a) + pt[2] * Math.cos(a);
  const sy = (pt[1] - .675 * cadre) * Math.cos(p) - z * Math.sin(p), k = T / (1.45 * cadre);
  return { x: +(T / 2 + x * k).toFixed(1), y: +(T / 2 - sy * k).toFixed(1) };
}
/* boîte englobante {x,y,w,h} des pixels opaques d'un ensemble d'images (masque T×T) ; null si vide */
export function boiteMasques(masques, T, exclure = null) {
  let x0 = T, y0 = T, x1 = -1, y1 = -1;
  for (const m of masques) for (let j = 0; j < T * T; j++) if (m[j] && !(exclure && exclure[j])) { const x = j % T, y = (j / T) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const dansBoite = (b, x, y) => b && x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h;
/* Données de jeu d'un objet généré. lib : Map nomAnimation -> résultat de « Générer » {T,N,dirs,frames[{d,f,mask}]} ; reg : {O,T,dir,pitch,cle(etat)->nomAnimation} */
export function donneesDeJeu(reg, lib) {
  const { O, T } = reg, dir = reg.dir || O.vue.dir, pitch = reg.pitch != null ? reg.pitch : O.vue.pitch, vue = { T, cadre: O.cadre, dir, pitch };
  const masques = (R, d, a = 0, b = 1e9) => R.frames.filter(f => f.d === d && f.f >= a && f.f <= b).sort((p, q) => p.f - q.f).map(f => f.mask);
  const rep = lib.get(reg.cle(O.initial)), dr = rep ? (rep.dirs.includes(dir) ? dir : rep.dirs[0]) : dir, repos = rep ? masques(rep, dr)[0] : null;
  const etats = {};
  for (const e of O.etats) {
    const R = lib.get(reg.cle(e.id)); if (!R) continue;
    const d = R.dirs.includes(dir) ? dir : R.dirs[0], ms = masques(R, d), n = ms.length, tot = e.statique ? 0 : Math.round(e.dur * 1000), un = e.statique ? 0 : Math.round(tot / Math.max(1, n));
    const o = { animation: reg.cle(e.id), tag: `${reg.cle(e.id)}_${d}`, images: n, boucle: e.boucle, statique: e.statique, duree_ms: Array(n).fill(un), duree_totale_ms: un * n, collision: e.collision,
      hurtbox: boiteMasques(ms, T), suivant: e.suivant };
    if (e.fenetre && n > 1) {   // hitbox d'attaque : pixels des images actives absents de l'image de repos (la partie qui « dépasse »)
      const a = Math.round(e.fenetre[0] * (n - 1)), b = Math.max(a, Math.round(e.fenetre[1] * (n - 1))), bb = boiteMasques(masques(R, d, a, b), T, repos) || boiteMasques(masques(R, d, a, b), T);
      o.hitbox = { images: [a, b], ...bb };
    }
    etats[e.id] = o;
  }
  const pts = {}; for (const [k, v] of Object.entries(O.points)) pts[k] = projeter(v, vue);
  return { type: O.id, famille: O.spec.famille, params: O.params, direction: dir, miroir_gauche: O.miroir ? 'retourner horizontalement à l\'exécution (ou générer la direction w)' : null,
    cellule: { w: T, h: T }, cadre: O.cadre, px_par_unite: +(T / (1.45 * O.cadre)).toFixed(2), unite: 'hauteur du héros = 1',
    ancre: projeter(O.ancre3d, vue), points: pts, etat_initial: O.initial, etats, transitions: O.transitions.map(t => ({ de: t.de, evenement: t.evenement, vers: t.vers })) };
}
export const NOTE_FORMAT = 'character-forge/gamedata@1 : coordonnées en pixels de cellule, origine en haut à gauche, y vers le bas ; durées en ms par image ; ancre = pieds (ou centre pour projectiles/collectibles/effets)';

/* ------------------------------------------------------------------ en-tête C (AKA) : états, durées, boîtes */
export function enteteC(nomBase, donnees, nomsAnim) {
  const U = s => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  let t = `// ${nomBase} : données de jeu générées par character-forge (objets.js) — ne pas éditer\n#pragma once\n#include <stdint.h>\n`;
  t += `typedef struct { const uint16_t* pixels; uint8_t images; uint8_t boucle; uint16_t duree_ms; int8_t suivant; int8_t collision; int16_t hurt_x, hurt_y; uint16_t hurt_w, hurt_h; } ObjetEtat;\n`;
  t += `enum { COLL_AUCUNE, COLL_SOLIDE, COLL_TRAVERSABLE, COLL_DANGEREUX, COLL_DECLENCHEUR };\n`;
  const C = { aucune: 0, solide: 1, traversable: 2, dangereux: 3, declencheur: 4 };
  for (const [nom, d] of Object.entries(donnees)) {
    const ids = Object.keys(d.etats), N = U(nom);
    t += `\n// --- ${nom} (${d.type}) : cellule ${d.cellule.w}x${d.cellule.h}, ancre (${d.ancre.x},${d.ancre.y})\n`;
    ids.forEach((id, i) => { t += `#include "${nomsAnim(d.etats[id].animation)}.h"\n`; });
    t += `enum { ${ids.map((id, i) => `${N}_${U(id)} = ${i}`).join(', ')}, ${N}_NB_ETATS };\n`;
    t += `#define ${N}_ANCRE_X ${Math.round(d.ancre.x)}\n#define ${N}_ANCRE_Y ${Math.round(d.ancre.y)}\n#define ${N}_INITIAL ${N}_${U(d.etat_initial)}\n`;
    t += `static const ObjetEtat ${nom}_etats[${N}_NB_ETATS] = {\n` + ids.map(id => { const e = d.etats[id], h = e.hurtbox || { x: 0, y: 0, w: 0, h: 0 };
      return `  { ${nomsAnim(e.animation)}, ${e.images}, ${e.boucle ? 1 : 0}, ${e.duree_ms[0] || 0}, ${e.suivant ? `${N}_${U(e.suivant)}` : -1}, ${'COLL_' + (e.collision || 'aucune').toUpperCase()}, ${h.x}, ${h.y}, ${h.w}, ${h.h} },  // ${id}`; }).join('\n') + '\n};\n';
  }
  return t;
}

const API = { catalogue, valeursDefaut, creer, verifierObjet, projeter, boiteMasques, donneesDeJeu, enteteC, NOTE_FORMAT, registre: new Map(), version: 1 };
if (typeof window !== 'undefined') window.ObjetsForge = API;
export default API;
