// exemple_aka.cpp — lire les données de jeu de character-forge (plateforme_gamedata.h) et jouer des animations.
//
// Ce fichier est du C++ portable : il se compile et se lance sur PC (-DHOTE) et écrit l'écran 320x240 dans un fichier PPM,
// ce qui permet de vérifier la logique sans console :
//     g++ -std=c++17 -Wall -DHOTE exemple_aka.cpp -I. -o exemple && ./exemple scene.ppm
// Sur la console AKA, seule la fonction presenter() change. Les appels gb_graphics y sont du PSEUDO-CODE : je n'ai pas
// l'API exacte sous les yeux, adapte les noms (blit d'une zone RGB565 avec couleur transparente 0xF81F, ou tampon d'écran).
//
// Format des données (voir docs/objets.md) :
//  - plateforme_<action>.h : tableau uint16_t RGB565, ordre « direction, puis image » ; 0xF81F = transparent
//  - plateforme_gamedata.h : pour chaque objet, une table ObjetEtat (pixels, images, boucle, durée par image en ms, état suivant
//    à la fin d'une animation non bouclée, type de collision, hurtbox en pixels de cellule) + ancre OBJET_ANCRE_X/Y (pieds)
#include <cstdint>
#include <cstdio>
#include <initializer_list>
#include "plateforme_gamedata.h"   // slime, coffre, levier, porte (et inclut leurs images)
#include "plateforme_idle.h"       // héros : « idle » et « marche » (en-têtes d'animation ordinaires du paquet)
#include "plateforme_marche.h"

constexpr uint16_t CLE = 0xF81F;           // couleur transparente RGB565
constexpr int T = PLATEFORME_IDLE_W;       // taille de la cellule (48)
constexpr int LARGEUR = 320, HAUTEUR = 240;
static uint16_t ecran[LARGEUR * HAUTEUR];

// ---------------------------------------------------------------- animateur générique (aucune dépendance console)
struct Anim { const ObjetEtat* tab; int etat; int image; uint32_t ms; };

static void anim_etat(Anim& a, int e) { a.etat = e; a.image = 0; a.ms = 0; }

// avance de dt millisecondes ; renvoie true si un état s'est terminé et a basculé sur son « suivant »
static bool anim_maj(Anim& a, uint32_t dt) {
    const ObjetEtat& e = a.tab[a.etat];
    if (e.images <= 1 || e.duree_ms == 0) return false;      // image fixe
    a.ms += dt;
    while (a.ms >= e.duree_ms) {
        a.ms -= e.duree_ms; a.image++;
        if (a.image >= e.images) {
            if (e.boucle) a.image = 0;
            else if (e.suivant >= 0) { anim_etat(a, e.suivant); return true; }
            else { a.image = e.images - 1; a.ms = 0; return false; }   // reste sur la dernière image (ex. « mort »)
        }
    }
    return false;
}

static const uint16_t* anim_pixels(const Anim& a) { return a.tab[a.etat].pixels + (size_t)a.image * T * T; }

// ---------------------------------------------------------------- dessin : les pieds (ancre) vont en (x, sol)
static void blit(const uint16_t* px, int x, int y, bool miroir) {
    for (int j = 0; j < T; j++) for (int i = 0; i < T; i++) {
        uint16_t c = px[j * T + (miroir ? T - 1 - i : i)];
        int X = x + i, Y = y + j;
        if (c != CLE && X >= 0 && X < LARGEUR && Y >= 0 && Y < HAUTEUR) ecran[Y * LARGEUR + X] = c;
    }
}
static void dessiner(const Anim& a, int ancre_x, int ancre_y, int x, int sol, bool miroir = false) {
    blit(anim_pixels(a), x - (miroir ? T - 1 - ancre_x : ancre_x), sol - ancre_y, miroir);
}

// hurtbox (pixels de cellule) -> écran, et test de chevauchement
struct Rect { int x, y, w, h; };
static Rect boite(const Anim& a, int ancre_x, int ancre_y, int x, int sol) {
    const ObjetEtat& e = a.tab[a.etat];
    return { x - ancre_x + e.hurt_x, sol - ancre_y + e.hurt_y, (int)e.hurt_w, (int)e.hurt_h };
}
static bool chevauche(Rect a, Rect b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

// ---------------------------------------------------------------- présentation à l'écran
static void presenter(const char* fichier) {
#ifdef HOTE
    FILE* f = fopen(fichier, "wb"); if (!f) return;
    fprintf(f, "P6\n%d %d\n255\n", LARGEUR, HAUTEUR);
    for (int i = 0; i < LARGEUR * HAUTEUR; i++) { uint16_t c = ecran[i];
        unsigned char rgb[3] = { (unsigned char)(((c >> 11) & 31) * 255 / 31), (unsigned char)(((c >> 5) & 63) * 255 / 63), (unsigned char)((c & 31) * 255 / 31) };
        fwrite(rgb, 1, 3, f); }
    fclose(f);
#else
    (void)fichier;
    // PSEUDO-CODE console AKA (noms d'API à adapter à gb_graphics) :
    //   gb_graphics_push_rgb565(ecran, LARGEUR, HAUTEUR);      // ou dessiner chaque cellule directement avec la clé 0xF81F
#endif
}

// ---------------------------------------------------------------- petite scène : tout est piloté par les données
int main(int argc, char** argv) {
    // le héros n'a pas de table générée : on décrit ses deux animations avec la même structure
    static const ObjetEtat hero_etats[2] = {
        { plateforme_idle,   PLATEFORME_IDLE_FRAMES,   1, 150, -1, COLL_SOLIDE, 16, 8, 16, 38 },
        { plateforme_marche, PLATEFORME_MARCHE_FRAMES, 1, 110, -1, COLL_SOLIDE, 16, 8, 16, 38 } };
    const int SOL = 200, HERO_ANCRE_X = 24, HERO_ANCRE_Y = 46;

    Anim hero   { hero_etats,    1, 0, 0 };
    Anim slime  { slime_etats,   SLIME_DEPLACEMENT, 0, 0 };
    Anim coffre { coffre_etats,  COFFRE_FERME, 0, 0 };
    Anim levier { levier_etats,  LEVIER_OFF, 0, 0 };
    Anim porte  { porte_etats,   PORTE_FERME, 0, 0 };

    int hero_x = 40, slime_x = 120;
    bool coffre_declenche = false, levier_declenche = false, porte_declenche = false;
    for (uint32_t t = 0; t <= 4800; t += 16) {
        if (hero_x < 250) hero_x += 1;                 // le héros avance vers la droite puis s'arrête
        if (slime.etat == SLIME_DEPLACEMENT && (t & 32)) slime_x -= 1;   // le slime rampe vers la gauche tant qu'il est vivant
        // événements de jeu -> états (les transitions complètes sont dans plateforme_gamedata.json)
        if (!coffre_declenche && hero_x >= 150)  { coffre_declenche = true; anim_etat(coffre, COFFRE_OUVERTURE); printf("t=%4u ms : coffre -> ouverture\n", t); }
        if (!levier_declenche && hero_x >= 220)  { levier_declenche = true; anim_etat(levier, LEVIER_ACTIVATION); printf("t=%4u ms : levier -> activation\n", t); }
        if (levier.etat == LEVIER_ON && !porte_declenche) { porte_declenche = true; anim_etat(porte, PORTE_OUVERTURE); printf("t=%4u ms : porte -> ouverture\n", t); }
        for (Anim* a : { &hero, &slime, &coffre, &levier, &porte }) {
            int avant = a->etat;
            if (anim_maj(*a, 16) && a != &hero) printf("t=%4u ms : etat %d -> %d (fin d'animation)\n", t, avant, a->etat);
        }
        // collision héros / slime avec les hurtboxes générées
        if (chevauche(boite(hero, HERO_ANCRE_X, HERO_ANCRE_Y, hero_x, SOL), boite(slime, SLIME_ANCRE_X, SLIME_ANCRE_Y, slime_x, SOL)) && slime.etat != SLIME_DEGAT && slime.etat != SLIME_MORT) {
            anim_etat(slime, SLIME_DEGAT); printf("t=%4u ms : slime touché -> degat\n", t);
        }
        if (slime.etat == SLIME_DEGAT && slime.image == slime.tab[SLIME_DEGAT].images - 1) anim_etat(slime, SLIME_MORT);
    }

    for (int i = 0; i < LARGEUR * HAUTEUR; i++) ecran[i] = (i / LARGEUR > SOL) ? 0x3186 : 0x5D7F;   // ciel et sol unis
    dessiner(porte,  PORTE_ANCRE_X,  PORTE_ANCRE_Y,  275, SOL);
    dessiner(levier, LEVIER_ANCRE_X, LEVIER_ANCRE_Y, 230, SOL);
    dessiner(coffre, COFFRE_ANCRE_X, COFFRE_ANCRE_Y, 170, SOL);
    dessiner(slime,  SLIME_ANCRE_X,  SLIME_ANCRE_Y,  slime_x, SOL);
    dessiner(hero, HERO_ANCRE_X, HERO_ANCRE_Y, hero_x, SOL);
    presenter(argc > 1 ? argv[1] : "scene.ppm");
    printf("état final : coffre=%d levier=%d porte=%d slime=%d\n", coffre.etat, levier.etat, porte.etat, slime.etat);
    return (coffre.etat == COFFRE_OUVERT && levier.etat == LEVIER_ON && porte.etat == PORTE_OUVERT) ? 0 : 1;
}
