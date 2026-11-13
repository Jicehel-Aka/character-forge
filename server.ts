import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import JSZip from 'jszip';

const execAsync = promisify(exec);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Server-side Gemini API client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Health endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!ai,
    timestamp: new Date().toISOString(),
  });
});

// AI Asset Extraction Endpoint
app.post('/api/extract/ai', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', mode = 'auto' } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 parameter is required' });
      return;
    }

    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY not configured on server',
        fallbackAvailable: true,
      });
      return;
    }

    // Strip data URL header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const systemPrompt = `You are an expert game developer, retro-gaming engineer (ESPBoy, AKA, Arduboy, Godot), and technical artist.
Your mission is to perform visual asset recovery and segmentation on user images (retro game screenshots, spritesheets, comic/BD artworks like Gruumshka, or game captures).
Analyze the provided image and detect every separable visual asset:
1. Identify all key elements (player, enemies, vehicles, weapons, props, UI widgets, character parts: face, armor, boots, hair, sword, or animation frames if it's a spritesheet).
2. For each element, specify precise 2D bounding boxes as [ymin, xmin, ymax, xmax] normalized on a 0-1000 scale (where 0 is top/left, 1000 is bottom/right).
3. Extract the dominant 8 to 16 color palette as hex codes.
4. If the image depicts a character or comic/BD art, extract an anatomical character profile and turnaround prompts for 3D CharacterAI reconstruction (Front, Left Profile, Right Profile, 3/4 View, Back).
5. Suggest the best target format: "game_screenshot", "spritesheet", "character_bd", or "retro_sprite".`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
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
  } catch (error: any) {
    console.error('Error in /api/extract/ai:', error);
    res.status(500).json({
      error: error.message || 'Gemini extraction failed',
      fallbackAvailable: true,
    });
  }
});

// AI Text-to-3D Blueprint Generation Endpoint
app.post('/api/generate/3d-blueprint', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'prompt parameter is required' });
      return;
    }

    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY not configured on server',
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
      model: 'gemini-4-hydrogen',
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
  } catch (error: any) {
    console.error('Error in /api/generate/3d-blueprint:', error);
    res.status(500).json({
      error: error.message || '3D blueprint generation failed',
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

// Export up-to-date merged bundle for existing GitHub repository (GitHub Pages build OR full source + workflow)
app.get('/api/export/github-pages-pack', async (req: Request, res: Response) => {
  try {
    const mode = req.query.mode === 'source' ? 'source' : 'pages';
    const owner = String(req.query.owner || 'Jicehel-Aka').replace(/[^a-zA-Z0-9_-]/g, '');
    const repo = String(req.query.repo || 'character-forge').replace(/[^a-zA-Z0-9._-]/g, '');
    const rootDir = process.cwd();
    const zip = new JSZip();

    if (mode === 'pages') {
      // Always run fresh Vite client build so dist/ reflects all latest merged changes
      await execAsync('npx vite build', { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 });
      const distDir = path.join(rootDir, 'dist');

      await addDirToZip(zip, distDir, '', (rel) => {
        return (
          rel.startsWith('assets/aistudio') ||
          rel.startsWith('github_repo') ||
          rel === 'character-forge-github-pack.zip' ||
          rel === 'server.js'
        );
      });

      zip.file('.nojekyll', '');

      // Ensure LICENSE & README from root are up to date
      for (const rootDoc of ['LICENSE', 'README.md']) {
        try {
          const docBuf = await fs.readFile(path.join(rootDir, rootDoc));
          zip.file(rootDoc, docBuf);
        } catch {
          // ignore if missing
        }
      }

      const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${repo}-github-pages-ready.zip"`
      );
      res.send(zipBuf);
      return;
    }

    // Source mode: full React + Three.js + Node codebase + standalone public/ tools + GitHub Pages CI workflow
    const rootFiles = [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'metadata.json',
      'server.ts',
      'README.md',
      'LICENSE',
      '.env.example',
      '.gitignore',
    ];
    for (const fileName of rootFiles) {
      try {
        const buf = await fs.readFile(path.join(rootDir, fileName));
        zip.file(fileName, buf);
      } catch {
        // ignore missing optional files
      }
    }

    await addDirToZip(zip, path.join(rootDir, 'src'), 'src', () => false);
    await addDirToZip(zip, path.join(rootDir, 'public'), 'public', (rel) => {
      return (
        rel.startsWith('public/assets/aistudio') ||
        rel.startsWith('public/github_repo') ||
        rel === 'public/character-forge-github-pack.zip'
      );
    });

    // GitHub Actions auto-deploy workflow for GitHub Pages
    zip.file(
      '.github/workflows/deploy-pages.yml',
      `name: Deploy ${repo} to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npx vite build
      - run: rm -rf dist/assets/aistudio dist/github_repo dist/character-forge-github-pack.zip dist/server.js
      - run: touch dist/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - id: deployment
        uses: actions/deploy-pages@v4
`
    );

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${owner}-${repo}-full-source.zip"`
    );
    res.send(zipBuf);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur export GitHub Pages';
    console.error('Error in /api/export/github-pages-pack:', error);
    res.status(500).json({ error: msg });
  }
});

// Serve frontend in dev or prod
async function setupServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (Gemini AI: ${ai ? 'active' : 'disabled'})`);
  });
}

setupServer();
