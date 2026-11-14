// plateforme : données de jeu générées par character-forge (objets.js) — ne pas éditer
#pragma once
#include <stdint.h>
typedef struct { const uint16_t* pixels; uint8_t images; uint8_t boucle; uint16_t duree_ms; int8_t suivant; int8_t collision; int16_t hurt_x, hurt_y; uint16_t hurt_w, hurt_h; } ObjetEtat;
enum { COLL_AUCUNE, COLL_SOLIDE, COLL_TRAVERSABLE, COLL_DANGEREUX, COLL_DECLENCHEUR };

// --- slime (slime) : cellule 48x48, ancre (24,46.1)
#include "plateforme_slime_idle.h"
#include "plateforme_slime_deplacement.h"
#include "plateforme_slime_attaque.h"
#include "plateforme_slime_degat.h"
#include "plateforme_slime_mort.h"
enum { SLIME_IDLE = 0, SLIME_DEPLACEMENT = 1, SLIME_ATTAQUE = 2, SLIME_DEGAT = 3, SLIME_MORT = 4, SLIME_NB_ETATS };
#define SLIME_ANCRE_X 24
#define SLIME_ANCRE_Y 46
#define SLIME_INITIAL SLIME_IDLE
static const ObjetEtat slime_etats[SLIME_NB_ETATS] = {
  { plateforme_slime_idle, 4, 1, 250, -1, COLL_SOLIDE, 14, 36, 20, 12 },  // idle
  { plateforme_slime_deplacement, 8, 1, 100, -1, COLL_SOLIDE, 13, 26, 22, 22 },  // deplacement
  { plateforme_slime_attaque, 6, 0, 83, SLIME_IDLE, COLL_SOLIDE, 13, 36, 28, 12 },  // attaque
  { plateforme_slime_degat, 4, 0, 100, SLIME_IDLE, COLL_SOLIDE, 10, 35, 25, 13 },  // degat
  { plateforme_slime_mort, 6, 0, 117, -1, COLL_AUCUNE, 9, 35, 30, 13 },  // mort
};

// --- coffre (coffre) : cellule 48x48, ancre (24,45.5)
#include "plateforme_coffre_ferme.h"
#include "plateforme_coffre_ouverture.h"
#include "plateforme_coffre_ouvert.h"
#include "plateforme_coffre_fermeture.h"
enum { COFFRE_FERME = 0, COFFRE_OUVERTURE = 1, COFFRE_OUVERT = 2, COFFRE_FERMETURE = 3, COFFRE_NB_ETATS };
#define COFFRE_ANCRE_X 24
#define COFFRE_ANCRE_Y 46
#define COFFRE_INITIAL COFFRE_FERME
static const ObjetEtat coffre_etats[COFFRE_NB_ETATS] = {
  { plateforme_coffre_ferme, 1, 0, 0, -1, COLL_SOLIDE, 15, 30, 18, 17 },  // ferme
  { plateforme_coffre_ouverture, 6, 0, 83, COFFRE_OUVERT, COLL_SOLIDE, 15, 22, 18, 25 },  // ouverture
  { plateforme_coffre_ouvert, 4, 1, 200, -1, COLL_SOLIDE, 15, 22, 18, 25 },  // ouvert
  { plateforme_coffre_fermeture, 5, 0, 80, COFFRE_FERME, COLL_SOLIDE, 15, 22, 18, 25 },  // fermeture
};

// --- levier (levier) : cellule 48x48, ancre (24,45.7)
#include "plateforme_levier_off.h"
#include "plateforme_levier_on.h"
#include "plateforme_levier_activation.h"
#include "plateforme_levier_desactivation.h"
enum { LEVIER_OFF = 0, LEVIER_ON = 1, LEVIER_ACTIVATION = 2, LEVIER_DESACTIVATION = 3, LEVIER_NB_ETATS };
#define LEVIER_ANCRE_X 24
#define LEVIER_ANCRE_Y 46
#define LEVIER_INITIAL LEVIER_OFF
static const ObjetEtat levier_etats[LEVIER_NB_ETATS] = {
  { plateforme_levier_off, 1, 0, 0, -1, COLL_SOLIDE, 13, 26, 22, 21 },  // off
  { plateforme_levier_on, 1, 0, 0, -1, COLL_SOLIDE, 13, 26, 22, 21 },  // on
  { plateforme_levier_activation, 4, 0, 63, LEVIER_ON, COLL_SOLIDE, 13, 24, 22, 23 },  // activation
  { plateforme_levier_desactivation, 4, 0, 63, LEVIER_OFF, COLL_SOLIDE, 13, 24, 22, 23 },  // desactivation
};

// --- porte (porte) : cellule 48x48, ancre (24,46.1)
#include "plateforme_porte_ferme.h"
#include "plateforme_porte_ouvert.h"
#include "plateforme_porte_ouverture.h"
#include "plateforme_porte_fermeture.h"
enum { PORTE_FERME = 0, PORTE_OUVERT = 1, PORTE_OUVERTURE = 2, PORTE_FERMETURE = 3, PORTE_NB_ETATS };
#define PORTE_ANCRE_X 24
#define PORTE_ANCRE_Y 46
#define PORTE_INITIAL PORTE_FERME
static const ObjetEtat porte_etats[PORTE_NB_ETATS] = {
  { plateforme_porte_ferme, 1, 0, 0, -1, COLL_SOLIDE, 7, 4, 37, 43 },  // ferme
  { plateforme_porte_ouvert, 1, 0, 0, -1, COLL_TRAVERSABLE, 7, 4, 37, 43 },  // ouvert
  { plateforme_porte_ouverture, 6, 0, 83, PORTE_OUVERT, COLL_SOLIDE, 7, 4, 37, 43 },  // ouverture
  { plateforme_porte_fermeture, 6, 0, 83, PORTE_FERME, COLL_SOLIDE, 7, 4, 37, 43 },  // fermeture
};
