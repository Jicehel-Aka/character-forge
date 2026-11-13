import { SamplePreset } from '../types/assets';
import meshyKarateFront from '../assets/images/meshy_karate_front_1794213134683.jpg';
import sampleRetroGame from '../assets/images/sample_retro_game_1794137120269.jpg';
import sampleCharacterBd from '../assets/images/sample_character_bd_1794137120622.jpg';
import sampleSpritesheet from '../assets/images/sample_spritesheet_1794137121788.jpg';

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'meshy_karateka',
    title: 'Combattant Martial Arts (Meshy 3D Multi-Vues)',
    badge: 'Meshy 3D & Character Turnaround',
    description: 'Modèle 3D complet généré via Meshy avec ses différentes vues (Face, Profil, Dos, Dessus). Découpe du kimono, de la ceinture obi noire, des gants de frappe bleus, du bandeau et des chaussures.',
    imageUrl: meshyKarateFront,
    type: 'character_bd',
    defaultPalette: [
      '#F8FAFC', // White karate gi
      '#18181B', // Black belt
      '#2563EB', // Blue gloves & headband
      '#1E293B', // Spiky black hair
      '#E8D7C3', // Skin tone
      '#64748B', // Gray soles
      '#0F172A', // Background dark
    ],
    defaultElements: [
      {
        id: 'karate_head_bandeau',
        label: 'Cheveux Manga Noirs & Bandeau Bleu',
        category: 'character_part',
        box_2d: [30, 160, 280, 340],
        description: 'Mèches de cheveux noirs ébouriffés avec bandeau bleu de combat',
        dominantColor: '#2563EB',
      },
      {
        id: 'karate_kimono_gi',
        label: 'Kimono / Dogi de Karaté Blanc',
        category: 'character_part',
        box_2d: [170, 95, 410, 400],
        description: 'Veste de kimono croisée blanche avec manches courtes plissées',
        dominantColor: '#F8FAFC',
      },
      {
        id: 'karate_obi_black',
        label: 'Ceinture Noire de Combat (Obi)',
        category: 'character_part',
        box_2d: [265, 175, 365, 335],
        description: 'Ceinture noire nouée à la taille avec deux pans retombant',
        dominantColor: '#18181B',
      },
      {
        id: 'karate_gloves_blue',
        label: 'Gants de Frappe Bleus (Mitaines)',
        category: 'character_part',
        box_2d: [265, 80, 350, 155],
        description: 'Paire de mitaines de frappe bleues pour le combat rapproché',
        dominantColor: '#2563EB',
      },
      {
        id: 'karate_pants_white',
        label: 'Pantalon de Karaté Blanc',
        category: 'character_part',
        box_2d: [300, 140, 420, 360],
        description: 'Pantalon ample blanc d’arts martiaux retroussé aux chevilles',
        dominantColor: '#F8FAFC',
      },
      {
        id: 'karate_sneakers',
        label: 'Baskets de Dojo & Semelles',
        category: 'character_part',
        box_2d: [400, 115, 470, 380],
        description: 'Chaussures de sport blanches avec bandes et semelles plates',
        dominantColor: '#E2E8F0',
      },
    ],
    defaultProfile: {
      name: 'Ryuichi - Combattant Martial (Meshy 3D)',
      hair: 'Cheveux noirs hérissés avec bandeau bleu royal flottant à l’arrière',
      eyes: 'Regard déterminé manga avec sourcils foncés',
      outfit: 'Kimono (dogi) blanc en coton épais, pantalon ample, ceinture noire obi nouée',
      weapons: ['Gants de frappe bleus rembourrés', 'Bandage de poignets'],
      dominantStyle: 'Modèle 3D Chibi / Stylisé Meshy (Shonen Martial Arts)',
      turnaroundPrompts: {
        front: 'Full body front view of anime martial artist Ryuichi, white karate gi, black belt obi, blue headband, blue sparring gloves, sneakers, neutral pose.',
        left_profile: 'Left profile view showing side of face, blue headband knot ribbons, raised blue fist, side folds of white kimono gi.',
        right_profile: 'Right profile view showing martial arts posture, muscular arm, side silhouette of black hair and white pants.',
        three_quarter: 'Three-quarter dynamic perspective view of martial artist showcasing 3D depth of kimono, black belt knot and gloves.',
        back: 'Rear back view showing the blue headband knot tied at the back of head, white kimono back folds, and back of black belt.',
      },
    },
  },
  {
    id: 'retro_f1',
    title: 'Capture Rétro (Formula 1 16-Bit)',
    badge: 'ESPBoy / AKA Target',
    description: 'Screenshot de jeu de course arcade 16-bit. Idéal pour découper player car, rivaux, HUD compte-tours et circuit.',
    imageUrl: sampleRetroGame,
    type: 'game_screenshot',
    defaultPalette: [
      '#D02424', // Red race car
      '#1D4ED8', // Blue rival
      '#EAB308', // Speedo yellow
      '#15803D', // Track grass
      '#334155', // Asphalt grey
      '#F8FAFC', // Curb white
      '#0F172A', // Deep black
      '#0284C7', // Sky cyan
    ],
    defaultElements: [
      {
        id: 'player_car_f1',
        label: 'Bolide Joueur (F1 Rouge #11)',
        category: 'vehicle',
        box_2d: [570, 255, 788, 625],
        description: 'Voiture de course F1 rouge n°11 vue arrière avec aileron et échappement',
        dominantColor: '#D02424',
      },
      {
        id: 'rival_car_blue',
        label: 'Rival Bleu (#8)',
        category: 'enemy',
        box_2d: [480, 555, 608, 730],
        description: 'Voiture concurrente bleue avec numéro 8',
        dominantColor: '#1D4ED8',
      },
      {
        id: 'hud_speedometer',
        label: 'Compte-tours & Compteur HUD',
        category: 'ui',
        box_2d: [810, 290, 995, 700],
        description: 'Jauge compte-tours avec affichage numérique de vitesse 168 MPH',
        dominantColor: '#EAB308',
      },
      {
        id: 'hud_minimap',
        label: 'Minimap Circuit HUD',
        category: 'ui',
        box_2d: [30, 800, 235, 985],
        description: 'Tracé du circuit avec positions en temps réel des bolides',
        dominantColor: '#F8FAFC',
      },
      {
        id: 'hud_lap_timer',
        label: 'Chronomètre & Position HUD',
        category: 'ui',
        box_2d: [30, 10, 195, 230],
        description: 'Affichage temps au tour, position 1st/12 et lap 02/03',
        dominantColor: '#EAB308',
      },
    ],
  },
  {
    id: 'character_gruumshka',
    title: 'Artwork BD - Guerrière Gruumshka',
    badge: 'CharacterAI & 3D Studio',
    description: 'Portrait plein pied style bande dessinée / roman graphique. Découpe visage, armure, épée et génération multi-vues 3D.',
    imageUrl: sampleCharacterBd,
    type: 'character_bd',
    defaultPalette: [
      '#6E5139', // Leather armor brown
      '#374A3D', // Cloak green
      '#D4D8DD', // Silver hair
      '#2E7D32', // Emerald eyes
      '#8C8F94', // Steel blade
      '#1E1A17', // Dark belt
      '#E8D7C3', // Skin tone
      '#B08968', // Light leather
    ],
    defaultElements: [
      {
        id: 'char_face_hair',
        label: 'Visage & Tresses Argentées',
        category: 'character_part',
        box_2d: [60, 280, 345, 620],
        description: 'Visage déterminé aux yeux verts émeraude et tresses d’argent nordiques',
        dominantColor: '#D4D8DD',
      },
      {
        id: 'char_armor_torso',
        label: 'Plastron de Cuir Clouté & Cape',
        category: 'character_part',
        box_2d: [180, 340, 620, 755],
        description: 'Plastron de cuir tanné, spalière forgée à tête d’ours et cape forestière',
        dominantColor: '#6E5139',
      },
      {
        id: 'char_sword_runic',
        label: 'Épée Runique à Deux Mains',
        category: 'weapon',
        box_2d: [340, 170, 895, 348],
        description: 'Lame d’acier gravée de runes nordiques avec pommeau ouvragé',
        dominantColor: '#8C8F94',
      },
      {
        id: 'char_boots',
        label: 'Bottes de Marche Renforcées',
        category: 'character_part',
        box_2d: [625, 305, 940, 750],
        description: 'Bottes en cuir à sangles adaptées au terrain rocailleux',
        dominantColor: '#6E5139',
      },
    ],
    defaultProfile: {
      name: 'Gruumshka the Untamed',
      hair: 'Tresses argentées nordiques avec perles de combat',
      eyes: 'Vert émeraude perçant',
      outfit: 'Cuir bouilli renforcé, spalière forgée tête d’ours, cape vert sombre',
      weapons: ['Épée runique à deux mains gravée', 'Dague de chasse au fourreau'],
      dominantStyle: 'Bande Dessinée Fantasy héroïque européenne (ligne claire & ombrage hachuré)',
      turnaroundPrompts: {
        front: 'Full body front view of fantasy warrior woman Gruumshka, silver braided hair, hardened leather armor, bear pauldron, standing tall, neutral T-pose/A-pose, clean background.',
        left_profile: 'Left profile side view of fantasy warrior Gruumshka, silver braids visible, leather cuirass silhouette, sword scabbard at hip, orthographic perspective.',
        right_profile: 'Right profile side view of warrior Gruumshka, bear pauldron details, side profile of face, leather armbraces, orthographic.',
        three_quarter: 'Three-quarter dynamic perspective view of Gruumshka, showcasing layered armor depth, green cloak drape and runic blade.',
        back: 'Rear view showing green cloak folds, hair braids down back, scabbard straps, back leather armor lacing.',
      },
    },
  },
  {
    id: 'spritesheet_scifi',
    title: 'Spritesheet Cosmonaute (8 Frames)',
    badge: 'Animation & Grid Slicer',
    description: 'Spritesheet pixel-art 8 frames (4 Run, 4 Jump). Auto-découpage de grille, lecteur d’animation en boucle et export C/RGB565.',
    imageUrl: sampleSpritesheet,
    type: 'spritesheet',
    defaultPalette: [
      '#E97D11', // Orange armor
      '#1C52A8', // Blue flight suit
      '#00C0FF', // Visor glow
      '#FFFFFF', // Helmet white
      '#161A29', // Grid background
      '#D83A11', // Orange shadow
    ],
    defaultElements: [
      {
        id: 'run_frame_1',
        label: 'Course Frame 1 (Start)',
        category: 'animation_frame',
        box_2d: [170, 50, 470, 220],
        description: 'Cycle de course frame 1 - propulsion jambe arrière',
        dominantColor: '#E97D11',
      },
      {
        id: 'run_frame_2',
        label: 'Course Frame 2 (Stride)',
        category: 'animation_frame',
        box_2d: [170, 290, 470, 470],
        description: 'Cycle de course frame 2 - enjambée avant',
        dominantColor: '#E97D11',
      },
      {
        id: 'run_frame_3',
        label: 'Course Frame 3 (Push)',
        category: 'animation_frame',
        box_2d: [170, 540, 470, 715],
        description: 'Cycle de course frame 3 - poussée dynamique',
        dominantColor: '#E97D11',
      },
      {
        id: 'run_frame_4',
        label: 'Course Frame 4 (Contact)',
        category: 'animation_frame',
        box_2d: [170, 775, 470, 950],
        description: 'Cycle de course frame 4 - contact au sol',
        dominantColor: '#E97D11',
      },
      {
        id: 'jump_frame_1',
        label: 'Saut Frame 1 (Anticipation)',
        category: 'animation_frame',
        box_2d: [590, 55, 890, 215],
        description: 'Cycle de saut frame 1 - flexion d’impact',
        dominantColor: '#E97D11',
      },
      {
        id: 'jump_frame_2',
        label: 'Saut Frame 2 (Ascension)',
        category: 'animation_frame',
        box_2d: [550, 285, 870, 465],
        description: 'Cycle de saut frame 2 - élévation genoux repliés',
        dominantColor: '#E97D11',
      },
      {
        id: 'jump_frame_3',
        label: 'Saut Frame 3 (Apex)',
        category: 'animation_frame',
        box_2d: [505, 535, 845, 715],
        description: 'Cycle de saut frame 3 - point culminant du saut',
        dominantColor: '#E97D11',
      },
      {
        id: 'jump_frame_4',
        label: 'Saut Frame 4 (Landing)',
        category: 'animation_frame',
        box_2d: [570, 785, 890, 945],
        description: 'Cycle de saut frame 4 - préparation atterrissage',
        dominantColor: '#E97D11',
      },
    ],
  },
];
