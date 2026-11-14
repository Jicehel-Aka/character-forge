import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import JSZip from 'jszip';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Répertoire du site statique (pages autonomes + build de l'app React).
 * En dev (tsx server.ts) __dirname = racine du dépôt ; en prod (dist/server.js) c'est dist/.
 */
const ROOT_DIR = path.basename(__dirname) === 'dist' ? path.resolve(__dirname, '..') : __dirname;
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// ---------------------------------------------------------------------------
// Configuration (variables d'environnement, voir .env.example)
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) > 0 && Number(process.env.PORT) < 65536 ? Number(process.env.PORT) : 3000;
/** Par défaut le serveur n'écoute qu'en local ; HOST=0.0.0.0 pour l'exposer volontairement. */
const HOST = process.env.HOST || '127.0.0.1';
/** Jeton d'accès optionnel : s'il est défini, /api/* (hors /api/health) exige l'en-tête X-Api-Token. */
const API_TOKEN = process.env.API_TOKEN || '';
/**
 * Modèle Gemini. « gemini-4-hydrogen » (ancien défaut) n'existe pas dans la liste officielle
 * des modèles (ai.google.dev/gemini-api/docs/models) ; défaut sûr : un modèle « flash » stable
 * multimodal. Surchargeable par GEMINI_MODEL.
 */
const GEMINI_MODEL = /^[a-z0-9][a-z0-9._-]{2,63}$/i.test(process.env.GEMINI_MODEL || '')
  ? (process.env.GEMINI_MODEL as string)
  : 'gemini-3.8-flash';
const MAX_BODY_MB = Math.min(Math.max(Number(process.env.MAX_BODY_MB) || 8, 1), 25);
const RATE_LIMIT_PER_MIN = Math.max(Number(process.env.RATE_LIMIT_PER_MIN) || 20, 1);
const EXPORT_RATE_LIMIT_PER_MIN = Math.max(Number(process.env.EXPORT_RATE_LIMIT_PER_MIN) || 3, 1);

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_MODES = new Set(['auto', 'character_bd', 'spritesheet', 'game_screenshot', 'retro_sprite']);
const MAX_PROMPT_CHARS = 1000;

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use(express.json({ limit: `${MAX_BODY_MB}mb` }));
app.use(express.urlencoded({ limit: `${MAX_BODY_MB}mb`, extended: true }));

// Client Gemini côté serveur : la clé ne quitte jamais ce processus (jamais renvoyée au client ni journalisée).
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'character-forge',
        },
      },
    })
  : null;

// ---------------------------------------------------------------------------
// Garde-fous : jeton, limite de débit
// ---------------------------------------------------------------------------
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireToken(req: Request, res: Response, next: NextFunction) {
  if (!API_TOKEN) return next();
  const auth = req.header('authorization') || '';
  const given = req.header('x-api-token') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (given && safeEqual(given, API_TOKEN)) return next();
  res.status(401).json({ error: "Jeton d'accès manquant ou invalide." });
}

/** Limiteur à fenêtre glissante d'une minute, en mémoire, par adresse IP. */
function rateLimit(maxPerMin: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [k, v] of hits) {
      const kept = v.filter((t) => t > cutoff);
      if (kept.length) hits.set(k, kept);
      else hits.delete(k);
    }
  }, 60_000).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'inconnu';
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => t > now - 60_000);
    if (recent.length >= maxPerMin) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const aiLimiter = rateLimit(RATE_LIMIT_PER_MIN);
const exportLimiter = rateLimit(EXPORT_RATE_LIMIT_PER_MIN);

// Health endpoint (sonde utilisée par le client pour détecter le mode statique ; aucune donnée sensible)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!ai,
    authRequired: !!API_TOKEN,
    timestamp: new Date().toISOString(),
  });
});

// AI Asset Extraction Endpoint
app.post('/api/extract/ai', requireToken, aiLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { imageBase64, mimeType = 'image/jpeg', mode = 'auto' } = body;

    if (typeof imageBase64 !== 'string' || !imageBase64) {
      res.status(400).json({ error: "Le paramètre imageBase64 (texte base64) est requis." });
      return;
    }
    if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
      res.status(400).json({ error: `mimeType non autorisé (autorisés : ${[...ALLOWED_MIME].join(', ')}).` });
      return;
    }
    if (typeof mode !== 'string' || !ALLOWED_MODES.has(mode)) {
      res.status(400).json({ error: `mode non autorisé (autorisés : ${[...ALLOWED_MODES].join(', ')}).` });
      return;
    }

    // Strip data URL header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[\w.+-]+;base64,/, '');
    if (cleanBase64.length > MAX_BODY_MB * 1024 * 1024 || !/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(cleanBase64)) {
      res.status(400).json({ error: 'Image invalide ou trop volumineuse (base64 attendu).' });
      return;
    }

    if (!ai) {
      res.status(503).json({
        error: "Aucune clé GEMINI_API_KEY n'est configurée sur le serveur.",
        fallbackAvailable: true,
      });
      return;
    }

    const systemPrompt = `You are an expert game developer, retro-gaming engineer (ESPBoy, AKA, Arduboy, Godot), and technical artist.
Your mission is to perform visual asset recovery and segmentation on user images (retro game screenshots, spritesheets, comic/BD artworks like Gruumshka, or game captures).
Analyze the provided image and detect every separable visual asset:
1. Identify all key elements (player, enemies, vehicles, weapons, props, UI widgets, character parts: face, armor, boots, hair, sword, or animation frames if it's a spritesheet).
2. For each element, specify precise 2D bounding boxes as [ymin, xmin, ymax, xmax] normalized on a 0-1000 scale (where 0 is top/left, 1000 is bottom/right).
3. Extract the dominant 8 to 16 color palette as hex codes.
4. If the image depicts a character or comic/BD art, extract an anatomical character profile and turnaround prompts for 3D CharacterAI reconstruction (Front, Left Profile, Right Profile, 3/4 View, Back).
5. Suggest the best target format: "game_screenshot", "spritesheet", "character_bd", or "retro_sprite".`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this image in mode "${mode}". Return detailed segmentation bounding boxes [ymin, xmin, ymax, xmax] (0-1000 scale), category, labels, dominant colors, and character details if applicable.`,
          },
        ],
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Executive summary of detected visual assets in the image.',
            },
            suggestedType: {
              type: Type.STRING,
              description: 'One of: game_screenshot, spritesheet, character_bd, retro_sprite',
            },
            elements: {
              type: Type.ARRAY,
              description: 'List of detected sprite elements with bounding boxes',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    description: 'player, enemy, vehicle, item, ui, background, weapon, character_part, animation_frame',
                  },
                  box_2d: {
                    type: Type.ARRAY,
                    description: '[ymin, xmin, ymax, xmax] normalized 0-1000',
                    items: { type: Type.INTEGER },
                  },
                  description: { type: Type.STRING },
                  dominantColor: { type: Type.STRING },
                },
                required: ['id', 'label', 'category', 'box_2d'],
              },
            },
            palette: {
              type: Type.ARRAY,
              description: 'Extracted dominant color palette hex codes (#RRGGBB)',
              items: { type: Type.STRING },
            },
            characterProfile: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                hair: { type: Type.STRING },
                eyes: { type: Type.STRING },
                outfit: { type: Type.STRING },
                weapons: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                dominantStyle: { type: Type.STRING },
                turnaroundPrompts: {
                  type: Type.OBJECT,
                  properties: {
                    front: { type: Type.STRING },
                    left_profile: { type: Type.STRING },
                    right_profile: { type: Type.STRING },
                    three_quarter: { type: Type.STRING },
                    back: { type: Type.STRING },
                  },
                },
              },
            },
          },
          required: ['summary', 'suggestedType', 'elements', 'palette'],
        },
      },
    });

    const textOutput = response.text || '{}';
    const parsed = JSON.parse(textOutput);
    res.json(parsed);
  } catch (error: unknown) {
    // Le message du SDK n'est que journalisé : jamais renvoyé tel quel au client.
    console.error('Erreur /api/extract/ai :', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: "L'analyse par Gemini a échoué (voir les journaux du serveur).",
      fallbackAvailable: true,
    });
  }
});

// AI Text-to-3D Blueprint Generation Endpoint
app.post('/api/generate/3d-blueprint', requireToken, aiLimiter, async (req: Request, res: Response) => {
  try {
    const rawPrompt = (req.body ?? {}).prompt;
    if (typeof rawPrompt !== 'string' || !rawPrompt.trim()) {
      res.status(400).json({ error: 'Le paramètre prompt (texte non vide) est requis.' });
      return;
    }
    if (rawPrompt.length > MAX_PROMPT_CHARS) {
      res.status(400).json({ error: `Description trop longue (maximum ${MAX_PROMPT_CHARS} caractères).` });
      return;
    }
    // Pas de guillemets/retours ligne : le texte est inséré entre guillemets dans le prompt.
    const prompt = rawPrompt.replace(/["\r\n\u0000-\u001f]+/g, ' ').trim();

    if (!ai) {
      res.status(503).json({
        error: "Aucune clé GEMINI_API_KEY n'est configurée sur le serveur.",
        fallbackAvailable: true,
      });
      return;
    }

    const systemInstruction = `You are a senior 3D technical artist and procedural Three.js architect.
Given a user description of a 3D object, weapon, prop, vehicle, or stylized figure, decompose it into a rich, physically grounded multi-part 3D blueprint of 4 to 12 sub-parts.
Rules:
- Units are meters, Y is up, base sits near y=0, total height around 0.8 to 1.7 meters.
- Allowed kinds: "box", "cylinder", "sphere", "cone", "torus", "capsule", "lathe_vessel", "extrude_blade", "octahedron_crystal", "ring".
- Allowed textureStyle: "none", "metal", "wood", "stone", "crystal".
- Provide realistic PBR properties: roughness (0.08 to 0.92), metalness (0.0 to 0.95), optional emissive hex and emissiveIntensity (0 to 1.5), and opacity (0.3 to 1.0).`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Create a detailed 3D blueprint in JSON for: "${prompt}". Title and part names in French.`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING },
            descriptionSummary: { type: Type.STRING },
            parts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  position: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  rotationDeg: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  scale: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  color: { type: Type.STRING },
                  roughness: { type: Type.NUMBER },
                  metalness: { type: Type.NUMBER },
                  emissive: { type: Type.STRING },
                  emissiveIntensity: { type: Type.NUMBER },
                  opacity: { type: Type.NUMBER },
                  textureStyle: { type: Type.STRING },
                },
                required: ['name', 'kind', 'position', 'scale', 'color'],
              },
            },
          },
          required: ['title', 'category', 'parts'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error: unknown) {
    console.error('Erreur /api/generate/3d-blueprint :', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'La génération du plan 3D par Gemini a échoué (voir les journaux du serveur).',
      fallbackAvailable: true,
    });
  }
});

// Helper to recursively add files into a JSZip instance
async function addDirToZip(
  zip: JSZip,
  absDir: string,
  zipPrefix: string,
  shouldSkip: (relZipPath: string) => boolean
) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (shouldSkip(zipPath)) continue;
    if (entry.isDirectory()) {
      await addDirToZip(zip, absPath, zipPath, shouldSkip);
    } else if (entry.isFile()) {
      const content = await fs.readFile(absPath);
      zip.file(zipPath, content);
    }
  }
}

// Export d'un paquet à glisser dans le dépôt GitHub. AUCUNE compilation ici : le site est
// précompilé par `npm run build` (sortie dans docs/). Un seul export à la fois.
let exportBusy = false;

app.get('/api/export/github-pages-pack', requireToken, exportLimiter, async (req: Request, res: Response) => {
  if (exportBusy) {
    res.status(429).json({ error: 'Un export est déjà en cours, réessaie dans un instant.' });
    return;
  }
  exportBusy = true;
  try {
    const mode = req.query.mode === 'source' ? 'source' : 'pages';
    const owner = String(req.query.owner || 'Jicehel-Aka').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 39) || 'Jicehel-Aka';
    const repo = String(req.query.repo || 'character-forge').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100) || 'character-forge';
    const zip = new JSZip();

    if (mode === 'pages') {
      try {
        await fs.access(path.join(DOCS_DIR, 'index.html'));
      } catch {
        res.status(503).json({ error: "Le site n'est pas compilé : lance « npm run build » sur le serveur." });
        return;
      }
      await addDirToZip(zip, DOCS_DIR, '', () => false);
      zip.file('.nojekyll', '');
      for (const rootDoc of ['LICENSE', 'README.md']) {
        try {
          zip.file(rootDoc, await fs.readFile(path.join(ROOT_DIR, rootDoc)));
        } catch {
          // fichier absent : ignoré
        }
      }
      const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${repo}-github-pages-ready.zip"`);
      res.send(zipBuf);
      return;
    }

    // Mode source : code de l'app + serveur + workflows (le site compilé est dans docs/, non inclus ici).
    const rootFiles = [
      'package.json',
      'package-lock.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'server.ts',
      'README.md',
      'LICENSE',
      'THIRD_PARTY.md',
      '.env.example',
      '.gitignore',
    ];
    for (const fileName of rootFiles) {
      try {
        zip.file(fileName, await fs.readFile(path.join(ROOT_DIR, fileName)));
      } catch {
        // fichier optionnel absent : ignoré
      }
    }
    for (const dir of ['src', 'scripts', '.github/workflows']) {
      try {
        await addDirToZip(zip, path.join(ROOT_DIR, dir), dir, () => false);
      } catch {
        // dossier absent : ignoré
      }
    }
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${owner}-${repo}-full-source.zip"`);
    res.send(zipBuf);
  } catch (error: unknown) {
    console.error('Erreur /api/export/github-pages-pack :', error instanceof Error ? error.message : error);
    res.status(500).json({ error: "L'export a échoué (voir les journaux du serveur)." });
  } finally {
    exportBusy = false;
  }
});

// Réponse JSON (jamais HTML) pour toute route /api inconnue
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route inconnue.' });
});

// Erreurs (corps trop gros, JSON invalide...) : toujours une réponse JSON en français, jamais une page HTML.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; type?: string };
  const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 500;
  const error =
    e?.type === 'entity.too.large'
      ? `Requête trop volumineuse (maximum ${MAX_BODY_MB} Mo).`
      : e?.type === 'entity.parse.failed'
        ? 'Corps JSON invalide.'
        : 'Erreur du serveur.';
  res.status(status).json({ error });
});

// Sert le site : pages autonomes + app React compilée, toutes dans docs/.
async function setupServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Dev : les pages autonomes de docs/ (modele.html, vendor/, exemple/...) sont servies telles quelles,
    // sans index.html (c'est Vite qui sert celui de l'app).
    app.use(express.static(DOCS_DIR, { index: false, extensions: ['html'] }));
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DOCS_DIR));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(DOCS_DIR, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(
      `Serveur : http://${HOST}:${PORT} (Gemini : ${ai ? `actif, modèle ${GEMINI_MODEL}` : 'désactivé'} ; jeton : ${API_TOKEN ? 'exigé' : 'non exigé'})`
    );
  });
}

setupServer();
