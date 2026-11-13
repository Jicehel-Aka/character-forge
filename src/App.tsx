import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  Upload,
  Download,
  Layers,
  Cpu,
  Film,
  Crosshair,
  RefreshCw,
  Sliders,
  Check,
  AlertCircle,
  FileImage,
  Box,
  Palette,
  User,
  Sword,
  Trees,
  PlusCircle,
  HelpCircle,
  Scissors,
  Camera,
  RotateCcw,
  Archive,
  FolderArchive,
  Users,
  Accessibility,
  Wand2,
} from 'lucide-react';

import {
  DetectedElement,
  CharacterProfile,
  SamplePreset,
  AssetCreationIntent,
  Model3DViewMode,
} from './types/assets';
import { WardrobeItem, WardrobeSlot, CharacterWardrobeState, MultiViewAngle } from './types/wardrobe';
import { INITIAL_WARDROBE_STATE } from './data/wardrobeLibrary';
import { SAMPLE_PRESETS } from './data/samples';
import { cropElement, ChromaKeyOptions, sliceGrid } from './utils/imageProcessing';
import { InteractiveCanvas } from './components/InteractiveCanvas';
import { SpriteAnimationPlayer } from './components/SpriteAnimationPlayer';
import { RGB565Inspector } from './components/RGB565Inspector';
import { ThreeCharacterViewport } from './components/ThreeCharacterViewport';
import { CharacterAIDeck } from './components/CharacterAIDeck';
import { WardrobeManager } from './components/WardrobeManager';
import { ExportModal } from './components/ExportModal';
import { UploadCreationHub } from './components/UploadCreationHub';
import { MultiViewManager } from './components/MultiViewManager';
import { AddCropToWardrobeModal } from './components/AddCropToWardrobeModal';
import { CharacterBankModal } from './components/CharacterBankModal';
import { BankCharacter, BankPropObject } from './types/characterBank';
import { BANK_CHARACTERS } from './data/characterBank';
import {
  AnatomicalProportions,
  DEFAULT_PROPORTIONS,
  calibrateProportionsFromImage,
} from './utils/humanoidCalibrator';
import { HumanoidMorphInspector } from './components/HumanoidMorphInspector';
import { PoseLibraryPanel } from './components/PoseLibraryPanel';
import { Forge3DCreatorPanel, ActiveForgedModel } from './components/Forge3DCreatorPanel';
import { CharacterPosePreset, PoseJointMap } from './types/poses';
import { POSE_LIBRARY } from './data/poseLibrary';
import { GitHubPublishModal } from './components/GitHubPublishModal';
import meshyKarateFront from './assets/images/meshy_karate_front_1794213134683.jpg';
import meshyKarateBack from './assets/images/meshy_karate_back_1794213151085.jpg';

const LEGACY_SAMPLE_ASSET_MAP: Record<string, string> = {
  '/src/assets/images/meshy_karate_front_1794213134683.jpg': meshyKarateFront,
  '/src/assets/images/meshy_karate_back_1794213151085.jpg': meshyKarateBack,
  '/src/assets/images/sample_retro_game_1794137120269.jpg': SAMPLE_PRESETS[1]?.imageUrl || meshyKarateFront,
  '/src/assets/images/sample_character_bd_1794137120622.jpg': SAMPLE_PRESETS[2]?.imageUrl || meshyKarateFront,
  '/src/assets/images/sample_spritesheet_1794137121788.jpg': SAMPLE_PRESETS[3]?.imageUrl || meshyKarateFront,
};

function normalizeSampleAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return LEGACY_SAMPLE_ASSET_MAP[url] || url;
}

export default function App() {
  // Current active sample or uploaded image (with localStorage persistence)
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    return localStorage.getItem('characterai_selected_preset_id') || SAMPLE_PRESETS[0].id;
  });
  const [currentImageUrl, setCurrentImageUrl] = useState<string>(() => {
    const saved = localStorage.getItem('characterai_current_image_url');
    return normalizeSampleAssetUrl(saved) || SAMPLE_PRESETS[0].imageUrl;
  });
  const [activeTab, setActiveTab] = useState<'canvas' | 'character_3d' | 'multiview' | 'wardrobe' | 'animation' | 'rgb565'>(() => {
    return (localStorage.getItem('characterai_active_tab') as any) || 'character_3d';
  });
  const [viewport3DMode, setViewport3DMode] = useState<Model3DViewMode>('character');

  // Character & Object Bank & GitHub Publish Modal State
  const [isCharacterBankOpen, setIsCharacterBankOpen] = useState<boolean>(false);
  const [isGitHubPublishOpen, setIsGitHubPublishOpen] = useState<boolean>(false);
  const [pendingAnimationTransfer, setPendingAnimationTransfer] = useState<{ id: string; name: string } | null>(null);
  const [studioSideTab, setStudioSideTab] = useState<
    'poses' | 'forge3d' | 'wardrobe' | 'multiview' | 'mannequin' | 'profile'
  >('poses');

  // Pose Library State
  const [activePoseId, setActivePoseId] = useState<string | null>(POSE_LIBRARY[0].id);
  const [poseJoints, setPoseJoints] = useState<PoseJointMap>(POSE_LIBRARY[0].joints);
  const [isPoseModeActive, setIsPoseModeActive] = useState<boolean>(false);
  const [customPoses, setCustomPoses] = useState<CharacterPosePreset[]>(() => {
    const saved = localStorage.getItem('characterai_custom_poses');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [];
  });

  // Forged 3D Object (Text-to-3D / Fixed-View Visual Hull) State
  const [activeForgedModel, setActiveForgedModel] = useState<ActiveForgedModel | null>(null);
  const [customEquippedProp, setCustomEquippedProp] = useState<THREE.Group | null>(null);

  // Humanoid Anatomical Proportions & Morphing State
  const [proportions, setProportions] = useState<AnatomicalProportions>(() => {
    const saved = localStorage.getItem('characterai_anatomical_proportions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return DEFAULT_PROPORTIONS;
  });
  const [showGhostOverlay, setShowGhostOverlay] = useState<boolean>(true);
  const [ghostOpacity, setGhostOpacity] = useState<number>(0.45);
  const [projectTextureOnMannequin, setProjectTextureOnMannequin] = useState<boolean>(false);
  const [mannequinStyle, setMannequinStyle] = useState<'studio' | 'skin' | 'wireframe'>('studio');
  const [isCalibratingProportions, setIsCalibratingProportions] = useState<boolean>(false);

  // Modular Wardrobe Customization State
  const [wardrobeState, setWardrobeState] = useState<CharacterWardrobeState>(() => {
    const saved = localStorage.getItem('characterai_wardrobe_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return INITIAL_WARDROBE_STATE;
  });

  // Custom items extracted by the user and added to the wardrobe library
  const [customWardrobeItems, setCustomWardrobeItems] = useState<WardrobeItem[]>(() => {
    const saved = localStorage.getItem('characterai_custom_wardrobe_items');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  // Multi-View Turnaround Angles (Face, Profil G, Profil D, Dos, Dessus, Dessous, 3/4)
  const [multiViews, setMultiViews] = useState<Record<MultiViewAngle, string | null>>(() => {
    const defaultViews: Record<MultiViewAngle, string | null> = {
      front: meshyKarateFront,
      left: null,
      right: null,
      back: meshyKarateBack,
      top: null,
      bottom: null,
      three_quarter: null,
    };

    const saved = localStorage.getItem('characterai_multiviews');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Clean up previous wrong placeholders where back was assigned to left, or front to right/3quarter
        if (
          parsed.left === meshyKarateBack ||
          parsed.left === '/src/assets/images/meshy_karate_back_1794213151085.jpg'
        ) {
          parsed.left = null;
        }
        if (
          parsed.right === meshyKarateFront ||
          parsed.right === '/src/assets/images/meshy_karate_front_1794213134683.jpg'
        ) {
          parsed.right = null;
        }
        if (
          parsed.three_quarter === meshyKarateFront ||
          parsed.three_quarter === '/src/assets/images/meshy_karate_front_1794213134683.jpg'
        ) {
          parsed.three_quarter = null;
        }
        const normalized: Partial<Record<MultiViewAngle, string | null>> = {};
        for (const angle of Object.keys(parsed) as MultiViewAngle[]) {
          normalized[angle] = normalizeSampleAssetUrl(parsed[angle]);
        }
        return {
          ...defaultViews,
          ...normalized,
        };
      } catch (e) {
        // ignore
      }
    }
    return defaultViews;
  });
  const [activeMultiViewAngle, setActiveMultiViewAngle] = useState<MultiViewAngle>('front');
  const [trigger3DReconstruct, setTrigger3DReconstruct] = useState<boolean>(false);

  // Modal for adding a cropped sprite directly into the 3D wardrobe
  const [isAddWardrobeOpen, setIsAddWardrobeOpen] = useState<boolean>(false);
  const [elementForWardrobe, setElementForWardrobe] = useState<DetectedElement | null>(null);

  // Asset Elements & Metadata
  const [elements, setElements] = useState<DetectedElement[]>(SAMPLE_PRESETS[0].defaultElements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    SAMPLE_PRESETS[0].defaultElements[0]?.id || null
  );
  const [palette, setPalette] = useState<string[]>(SAMPLE_PRESETS[0].defaultPalette);
  const [characterProfile, setCharacterProfile] = useState<CharacterProfile | undefined>(
    SAMPLE_PRESETS[0].defaultProfile
  );

  // Active Category Filter for Drawer
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'characters' | 'objects' | 'scenery' | 'ui'>('all');

  // Chroma Key Settings
  const [chromaKey, setChromaKey] = useState<ChromaKeyOptions>({
    enabled: false,
    targetColor: { r: 10, g: 15, b: 29 },
    tolerance: 18,
  });

  // UI state
  const [isAnalyzingAI, setIsAnalyzingAI] = useState<boolean>(false);
  const [aiAnalysisSummary, setAiAnalysisSummary] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isCreationHubOpen, setIsCreationHubOpen] = useState<boolean>(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Sync proportions to localStorage
  useEffect(() => {
    localStorage.setItem('characterai_anatomical_proportions', JSON.stringify(proportions));
  }, [proportions]);

  // 1-Click Auto-Calibration of Humanoid Mannequin Proportions
  const handleAutoCalibrateMannequin = async () => {
    const targetUrl = multiViews.front || selectedElement?.croppedDataUrl || currentImageUrl;
    if (!targetUrl) return;
    setIsCalibratingProportions(true);
    try {
      const calibrated = await calibrateProportionsFromImage(targetUrl);
      setProportions(calibrated);
      setStudioSideTab('mannequin');
    } finally {
      setIsCalibratingProportions(false);
    }
  };

  // Save changes to localStorage so user uploads are never replaced
  useEffect(() => {
    localStorage.setItem('characterai_current_image_url', currentImageUrl);
    localStorage.setItem('characterai_selected_preset_id', selectedPresetId);
    localStorage.setItem('characterai_active_tab', activeTab);
  }, [currentImageUrl, selectedPresetId, activeTab]);

  useEffect(() => {
    localStorage.setItem('characterai_wardrobe_state', JSON.stringify(wardrobeState));
  }, [wardrobeState]);

  useEffect(() => {
    localStorage.setItem('characterai_custom_wardrobe_items', JSON.stringify(customWardrobeItems));
  }, [customWardrobeItems]);

  useEffect(() => {
    localStorage.setItem('characterai_multiviews', JSON.stringify(multiViews));
  }, [multiViews]);

  useEffect(() => {
    localStorage.setItem('characterai_custom_poses', JSON.stringify(customPoses));
  }, [customPoses]);

  // Load and slice elements whenever image or chroma key changes
  useEffect(() => {
    let isCancelled = false;

    async function processCrops() {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        if (isCancelled) return;
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });

        const updated = await Promise.all(
          elements.map(async (el) => {
            try {
              const { dataUrl } = await cropElement(img, el.box_2d, chromaKey);
              return { ...el, croppedDataUrl: dataUrl };
            } catch (err) {
              return el;
            }
          })
        );

        if (!isCancelled) {
          setElements(updated);
        }
      };
      img.src = currentImageUrl;
    }

    processCrops();
    return () => {
      isCancelled = true;
    };
  }, [currentImageUrl, chromaKey]);

  // Switch Preset Handler
  const handleSelectPreset = (preset: SamplePreset) => {
    setSelectedPresetId(preset.id);
    setCurrentImageUrl(preset.imageUrl);
    setElements(preset.defaultElements);
    setSelectedElementId(preset.defaultElements[0]?.id || null);
    setPalette(preset.defaultPalette);
    setCharacterProfile(preset.defaultProfile);
    setAiAnalysisSummary(null);

    // Auto-adjust default view tab based on preset type
    if (preset.type === 'spritesheet') {
      setActiveTab('animation');
      setViewport3DMode('prop');
    } else if (preset.type === 'character_bd') {
      setActiveTab('character_3d');
      setViewport3DMode('character');
    } else {
      setActiveTab('canvas');
      setViewport3DMode('prop');
    }
  };

  // Ingestion from Creation Hub
  const handleImageLoadedFromHub = (dataUrl: string, intent: AssetCreationIntent, label?: string) => {
    setCurrentImageUrl(dataUrl);
    setSelectedPresetId(`custom_${intent}`);
    setElements([]);
    setSelectedElementId(null);
    setAiAnalysisSummary(null);

    if (intent === 'character') {
      setActiveTab('character_3d');
      setViewport3DMode('character');
    } else if (intent === 'object') {
      setActiveTab('canvas');
      setViewport3DMode('prop');
    } else if (intent === 'scenery') {
      setActiveTab('canvas');
      setViewport3DMode('diorama');
    } else {
      setActiveTab('animation');
      setViewport3DMode('prop');
    }

    // Trigger automated AI analysis right away for user file
    triggerAIAnalysis(dataUrl, intent);
  };

  // Call Server-Side Gemini Vision API
  const triggerAIAnalysis = async (base64Override?: string, intentOverride?: AssetCreationIntent) => {
    setIsAnalyzingAI(true);
    setAiAnalysisSummary(null);

    try {
      let imagePayload = base64Override || currentImageUrl;

      if (!imagePayload.startsWith('data:')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imagePayload;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        imagePayload = canvas.toDataURL('image/jpeg', 0.85);
      }

      const response = await fetch('/api/extract/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePayload,
          mimeType: 'image/jpeg',
          mode: intentOverride === 'character' || selectedPresetId === 'character_gruumshka' ? 'character_bd' : 'auto',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.elements && data.elements.length > 0) {
        const img = new Image();
        img.src = currentImageUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        const croppedWithImages = await Promise.all(
          data.elements.map(async (el: any, index: number) => {
            const { dataUrl } = await cropElement(img, el.box_2d, chromaKey);
            return {
              id: el.id || `ai_el_${index}`,
              label: el.label || `Élément ${index + 1}`,
              category: el.category || 'item',
              box_2d: el.box_2d,
              description: el.description,
              dominantColor: el.dominantColor,
              croppedDataUrl: dataUrl,
            };
          })
        );

        setElements(croppedWithImages);
        if (croppedWithImages.length > 0) {
          setSelectedElementId(croppedWithImages[0].id);
        }
      }

      if (data.palette && data.palette.length > 0) {
        setPalette(data.palette);
      }

      if (data.characterProfile) {
        setCharacterProfile(data.characterProfile);
      }

      setAiAnalysisSummary(
        data.summary ||
          `Analyse IA terminée : ${data.elements?.length || 0} assets identifiés et découpés.`
      );
    } catch (err: any) {
      console.warn('AI analysis API returned error or fallback:', err);
      setAiAnalysisSummary(
        "Mode Heuristique Actif : Découpage intelligent par contours et géométrie vectorielle."
      );
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  // Add Element manually
  const handleAddElement = async (newEl: DetectedElement) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentImageUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const { dataUrl } = await cropElement(img, newEl.box_2d, chromaKey);
    const withCrop = { ...newEl, croppedDataUrl: dataUrl };

    setElements((prev) => [...prev, withCrop]);
    setSelectedElementId(withCrop.id);
  };

  // Delete Element
  const handleDeleteElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedElementId === id) {
      const remaining = elements.filter((el) => el.id !== id);
      setSelectedElementId(remaining[0]?.id || null);
    }
  };

  // Apply Grid Slicer
  const handleApplyGridSlice = async (rows: number, cols: number) => {
    const sliced = sliceGrid(rows, cols, 'cell');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentImageUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const withCrops = await Promise.all(
      sliced.map(async (item) => {
        const { dataUrl } = await cropElement(img, item.box_2d, chromaKey);
        return {
          ...item,
          croppedDataUrl: dataUrl,
          dominantColor: '#38bdf8',
        };
      })
    );

    setElements(withCrops);
    if (withCrops.length > 0) {
      setSelectedElementId(withCrops[0].id);
    }
  };

  const handleUploadMultiView = (angle: MultiViewAngle, dataUrl: string) => {
    setMultiViews((prev) => ({ ...prev, [angle]: dataUrl }));
    setActiveMultiViewAngle(angle);
    setCurrentImageUrl(dataUrl);
    setSelectedPresetId('custom_multiview');
  };

  // Handler when selecting a full character from the Character & Object Bank
  const handleSelectBankCharacter = (char: BankCharacter) => {
    setSelectedPresetId(`bank_${char.id}`);
    setCurrentImageUrl(char.imageUrl);
    setMultiViews(char.multiViews);
    setWardrobeState(char.wardrobeState);
    if (char.customWardrobeItems && char.customWardrobeItems.length > 0) {
      setCustomWardrobeItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newOnes = char.customWardrobeItems!.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newOnes];
      });
    }
    setPalette(char.palette);
    setCharacterProfile(char.profile);

    if (char.defaultElements && char.defaultElements.length > 0) {
      setElements(char.defaultElements);
      setSelectedElementId(char.defaultElements[0].id);
    }

    if (pendingAnimationTransfer) {
      setAiAnalysisSummary(
        `✨ Animation "${pendingAnimationTransfer.name}" rétargetée avec succès sur le squelette 3D de ${char.name} !`
      );
      setPendingAnimationTransfer(null);
    } else {
      setAiAnalysisSummary(
        `Personnage "${char.name}" (${char.archetypeLabel}) chargé depuis la banque avec son squelette et ses 5 vues 3D.`
      );
    }

    setIsCharacterBankOpen(false);
    setActiveTab('character_3d');
  };

  // Handler when equipping an item from the bank
  const handleEquipBankObject = (prop: BankPropObject) => {
    setWardrobeState((prev) => ({
      ...prev,
      [prop.slot]: prop.wardrobeItemId,
    }));
    setAiAnalysisSummary(`Objet "${prop.name}" (${prop.category}) équipé sur l'emplacement [${prop.slot}] !`);
  };

  // Handler when initiating animation transfer across characters
  const handleTransferAnimation = (animId: string, animName: string) => {
    setPendingAnimationTransfer({ id: animId, name: animName });
    setIsCharacterBankOpen(true);
  };

  const filteredElements = React.useMemo(() => {
    if (categoryFilter === 'characters') {
      return elements.filter((e) => e.category === 'player' || e.category === 'character_part');
    }
    if (categoryFilter === 'objects') {
      return elements.filter((e) => e.category === 'weapon' || e.category === 'item' || e.category === 'vehicle');
    }
    if (categoryFilter === 'scenery') {
      return elements.filter((e) => e.category === 'background');
    }
    if (categoryFilter === 'ui') {
      return elements.filter((e) => e.category === 'ui' || e.category === 'animation_frame');
    }
    return elements;
  }, [elements, categoryFilter]);

  const selectedElement = elements.find((e) => e.id === selectedElementId) || elements[0] || null;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* 3-Zone Responsive Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 sm:px-6 py-3 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap">
            Character Forge & Asset Studio
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="order-3 xl:order-2 w-full xl:w-auto flex items-center gap-3.5 text-xs sm:text-sm font-medium text-slate-400 overflow-x-auto py-0.5">
          <button
            onClick={() => setActiveTab('character_3d')}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'character_3d' ? 'text-sky-400 font-semibold' : ''
            }`}
          >
            <Box className="w-4 h-4" />
            <span>Studio 3D</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('character_3d');
              setStudioSideTab('poses');
            }}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'character_3d' && studioSideTab === 'poses' ? 'text-sky-400 font-semibold' : ''
            }`}
          >
            <Accessibility className="w-3.5 h-3.5" />
            <span>Poses 3D</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('character_3d');
              setStudioSideTab('forge3d');
            }}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'character_3d' && studioSideTab === 'forge3d' ? 'text-amber-400 font-semibold' : ''
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Forge 3D & IA</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('character_3d');
              setStudioSideTab('wardrobe');
            }}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'character_3d' && studioSideTab === 'wardrobe' ? 'text-pink-400 font-semibold' : ''
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Garde-Robe</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('character_3d');
              setStudioSideTab('multiview');
            }}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'character_3d' && studioSideTab === 'multiview' ? 'text-indigo-400 font-semibold' : ''
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Vues Fixes</span>
          </button>
          <button
            onClick={() => setActiveTab('canvas')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'canvas' ? 'text-sky-400 font-semibold' : ''
            }`}
          >
            Découpe 2D
          </button>
          <button
            onClick={() => setActiveTab('animation')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'animation' ? 'text-sky-400 font-semibold' : ''
            }`}
          >
            Animation 2D
          </button>
          <button
            onClick={() => setActiveTab('rgb565')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white ${
              activeTab === 'rgb565' ? 'text-sky-400 font-semibold' : ''
            }`}
          >
            RGB565
          </button>
        </nav>

        {/* Zone 3: Active Image Chip & Primary Actions */}
        <div className="order-2 xl:order-3 flex flex-wrap items-center gap-2">
          {/* Active Image Indicator Chip */}
          <div
            onClick={() => setActiveTab('canvas')}
            className="hidden 2xl:flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs cursor-pointer transition-colors"
            title="Cliquez pour afficher cette image dans la table de découpe"
          >
            <img
              src={currentImageUrl}
              alt="Active"
              className="w-5 h-5 rounded object-cover border border-sky-400/40 bg-slate-950"
            />
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-slate-500 font-mono leading-none">Actif :</span>
              <span className="text-[11px] text-slate-200 font-semibold leading-tight truncate max-w-[110px]">
                {characterProfile?.name?.split('-')[0]?.trim() || 'Personnage'}
              </span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
          </div>

          {/* Publish to Existing GitHub Repo (Jicehel-Aka/character-forge) */}
          <button
            onClick={() => setIsGitHubPublishOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold text-amber-100 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer ring-1 ring-amber-400/50"
            title="Publier la version fusionnée vers ton dépôt GitHub Jicehel-Aka/character-forge (Pages ou Source + Actions CI)"
          >
            <FolderArchive className="w-4 h-4 text-amber-100" />
            <span>Publier GitHub</span>
          </button>

          {/* Character & Object Bank Button */}
          <button
            onClick={() => setIsCharacterBankOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer ring-1 ring-violet-400/40"
          >
            <Users className="w-4 h-4" />
            <span>Banque (6)</span>
          </button>

          {/* Big Ingestion Button */}
          <button
            onClick={() => setIsCreationHubOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer ring-1 ring-sky-400/30"
          >
            <Upload className="w-4 h-4" />
            <span>+ Importer</span>
          </button>

          {/* Quick open standalone modele.html */}
          <a
            href="./modele.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 sm:py-2 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors whitespace-nowrap"
            title="Ouvrir la page autonome modele.html dans un nouvel onglet"
          >
            <span>modele.html ↗</span>
          </a>

          {/* Bulk Export ZIP Pack */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer ring-1 ring-emerald-400/40"
          >
            <Archive className="w-4 h-4" />
            <span>Export ZIP ({elements.length})</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1520px] mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Creation & Ingestion Category Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg">
          <button
            onClick={() => setIsCharacterBankOpen(true)}
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-violet-500/30 hover:border-violet-400 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-100 block group-hover:text-violet-300">
                👥 Banque 3D & Objets
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                6 Persos, 12 Équipements
              </span>
            </div>
          </button>
          <button
            onClick={() => setIsCreationHubOpen(true)}
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-pink-500/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 group-hover:scale-105 transition-transform shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-100 block group-hover:text-pink-300">
                👤 Personnage 3D
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                VRM, A-Pose & 5 vues
              </span>
            </div>
          </button>

          <button
            onClick={() => setIsCreationHubOpen(true)}
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-amber-500/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
              <Sword className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-100 block group-hover:text-amber-300">
                ⚔️ Objet & Arme
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                3D Prop, Sprite & RGB565
              </span>
            </div>
          </button>

          <button
            onClick={() => setIsCreationHubOpen(true)}
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-emerald-500/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
              <Trees className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-100 block group-hover:text-emerald-300">
                🏞️ Décor & Scène
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                Diorama 3D & Tuiles
              </span>
            </div>
          </button>

          <button
            onClick={() => setIsCreationHubOpen(true)}
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-sky-500/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-100 block group-hover:text-sky-300">
                🎞️ Spritesheet
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                Animation & ESPBoy/AKA
              </span>
            </div>
          </button>
        </div>

        {/* Quick Presets & AI Trigger Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/70 border border-slate-800 rounded-xl text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-semibold mr-1">Presets Calibrés :</span>
            {SAMPLE_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    isSelected
                      ? 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-400/50'
                      : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <FileImage className="w-3.5 h-3.5" />
                  <span>{preset.title.split('(')[0]}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({preset.badge})</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => triggerAIAnalysis()}
            disabled={isAnalyzingAI}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingAI ? 'animate-spin' : ''}`} />
            <span>{isAnalyzingAI ? 'Analyse par Agent IA...' : 'Analyser par Agent IA'}</span>
          </button>
        </div>

        {/* AI Summary Banner if present */}
        {aiAnalysisSummary && (
          <div className="p-3 bg-sky-950/60 border border-sky-800/60 rounded-xl text-xs text-sky-200 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{aiAnalysisSummary}</span>
            </div>
            <span className="font-mono text-[11px] text-sky-400 shrink-0">
              {elements.length} assets découpés
            </span>
          </div>
        )}

        {/* Tab 1: Découpe & Analyse (Default View) */}
        {activeTab === 'canvas' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <InteractiveCanvas
                imageUrl={currentImageUrl}
                elements={elements}
                selectedElementId={selectedElementId}
                onSelectElement={(id) => setSelectedElementId(id)}
                onAddElement={handleAddElement}
                onDeleteElement={handleDeleteElement}
                chromaKey={chromaKey}
                onChangeChromaKey={setChromaKey}
                onApplyGridSlice={handleApplyGridSlice}
              />

              {palette.length > 0 && (
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-slate-300">Palette Dominante Extraite :</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {palette.map((color, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800 font-mono text-[11px]"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-slate-300">{color}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 max-h-[740px] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <h3 className="font-semibold text-sm text-slate-100">
                    Assets Découpés ({filteredElements.length})
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">PNG + RGB565</span>
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                    categoryFilter === 'all' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tous ({elements.length})
                </button>
                <button
                  onClick={() => setCategoryFilter('characters')}
                  className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                    categoryFilter === 'characters' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Personnages
                </button>
                <button
                  onClick={() => setCategoryFilter('objects')}
                  className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                    categoryFilter === 'objects' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Objets & Armes
                </button>
                <button
                  onClick={() => setCategoryFilter('scenery')}
                  className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                    categoryFilter === 'scenery' ? 'bg-sky-500 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Décors
                </button>
              </div>

              {filteredElements.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Aucun élément découpé dans cette catégorie.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filteredElements.map((el) => {
                    const isSelected = el.id === selectedElementId;
                    return (
                      <div
                        key={el.id}
                        onClick={() => setSelectedElementId(el.id)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-950 border-sky-500 ring-1 ring-sky-500/50 shadow-md'
                            : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700'
                        }`}
                      >
                        <div className="w-14 h-14 rounded bg-slate-900 border border-slate-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                          {el.croppedDataUrl ? (
                            <img
                              src={el.croppedDataUrl}
                              alt={el.label}
                              className="max-h-full max-w-full object-contain pixelated"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-800" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-200 truncate">
                              {el.label}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 capitalize px-1.5 py-0.5 rounded bg-slate-900">
                              {el.category}
                            </span>
                          </div>

                          {el.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1 italic">
                              {el.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setElementForWardrobe(el);
                                setIsAddWardrobeOpen(true);
                              }}
                              className="flex items-center gap-1 text-pink-400 hover:text-pink-300 font-medium px-1.5 py-0.5 rounded bg-pink-950/40 border border-pink-500/30"
                              title="Ajouter cet élément découpé dans la Garde-Robe 3D pour habiller le modèle"
                            >
                              <PlusCircle className="w-3 h-3" />
                              <span>+ Garde-Robe</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedElementId(el.id);
                                setActiveTab('rgb565');
                              }}
                              className="text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                              RGB565 →
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedElementId(el.id);
                                if (el.category === 'weapon' || el.category === 'item' || el.category === 'vehicle') {
                                  setViewport3DMode('prop');
                                } else if (el.category === 'background') {
                                  setViewport3DMode('diorama');
                                } else {
                                  setViewport3DMode('character');
                                }
                                setActiveTab('character_3d');
                              }}
                              className="text-sky-400 hover:text-sky-300 font-medium"
                            >
                              3D Viewport →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Unified Studio 3D & Character Forge Workspace */}
        {activeTab === 'character_3d' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px] h-[calc(100vh-210px)] max-h-[880px]">
            {/* Left Column: Premier 3D Interactive Viewport (7 cols) */}
            <div className="lg:col-span-7 h-full">
              <ThreeCharacterViewport
                characterImageUrl={selectedElement?.croppedDataUrl || currentImageUrl}
                characterName={characterProfile?.name || 'Combattant Martial Arts (Meshy)'}
                palette={palette}
                viewMode={viewport3DMode}
                onViewModeChange={(mode) => setViewport3DMode(mode)}
                wardrobeState={wardrobeState}
                customWardrobeItems={customWardrobeItems}
                multiViews={multiViews}
                onUploadView={handleUploadMultiView}
                onBatchUpdateViews={(next) => setMultiViews(next)}
                onOpenWardrobe={() => setStudioSideTab('wardrobe')}
                onOpenCharacterBank={() => setIsCharacterBankOpen(true)}
                onTransferAnimation={handleTransferAnimation}
                turnaroundPrompts={characterProfile?.turnaroundPrompts}
                triggerReconstruction={trigger3DReconstruct}
                proportions={proportions}
                onChangeProportions={setProportions}
                showGhostOverlay={showGhostOverlay}
                ghostOpacity={ghostOpacity}
                projectTextureOnMannequin={projectTextureOnMannequin}
                mannequinStyle={mannequinStyle}
                onAutoCalibrate={handleAutoCalibrateMannequin}
                activePoseJoints={poseJoints}
                isPoseModeActive={isPoseModeActive}
                onTogglePoseMode={setIsPoseModeActive}
                activeForgedModel={activeForgedModel}
                customEquippedProp={customEquippedProp}
                onClearForgedModel={() => {
                  setActiveForgedModel(null);
                  setViewport3DMode('character');
                }}
                onUnequipCustomProp={() => {
                  setCustomEquippedProp(null);
                  setWardrobeState((prev) => ({ ...prev, weapon: null }));
                }}
                onSendSpriteSheetToWorkspace={(sheetDataUrl, name) => {
                  setCurrentImageUrl(sheetDataUrl);
                  setAiAnalysisSummary(`Planche "${name}" chargée dans la table de découpe 2D & RGB565.`);
                  setActiveTab('canvas');
                }}
              />
            </div>

            {/* Right Column: Unified Interactive Inspector with Tabs (5 cols) */}
            <div className="lg:col-span-5 h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* Studio Inspector Header Tabs */}
              <div className="flex items-center gap-1 p-2 bg-slate-950/90 border-b border-slate-800 shrink-0 text-xs overflow-x-auto">
                <button
                  onClick={() => setStudioSideTab('poses')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    studioSideTab === 'poses'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-950/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Bibliothèque de positions 3D articulées et réglage fin des articulations"
                >
                  <Accessibility className="w-3.5 h-3.5" />
                  <span>Positions 3D</span>
                </button>

                <button
                  onClick={() => setStudioSideTab('forge3d')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    studioSideTab === 'forge3d'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Création d'objets 3D par description, vues fixes et correction d'erreurs avancée"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Forge 3D & Erreurs</span>
                </button>

                <button
                  onClick={() => setStudioSideTab('mannequin')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    studioSideTab === 'mannequin'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Ajuster la morphologie, les proportions et calibrer le mannequin par rapport aux photos"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Morphologie</span>
                </button>

                <button
                  onClick={() => setStudioSideTab('wardrobe')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    studioSideTab === 'wardrobe'
                      ? 'bg-pink-600 text-white shadow-md shadow-pink-950/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Modifier les vêtements, armes et accessoires avec prévisualisation immédiate en 3D"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Garde-Robe</span>
                </button>

                <button
                  onClick={() => setStudioSideTab('multiview')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    studioSideTab === 'multiview'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Charger vos photos sous différents angles et aligner les vues fixes"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Vues Fixes</span>
                </button>

                <button
                  onClick={() => setStudioSideTab('profile')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    studioSideTab === 'profile'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Voir les caractéristiques du personnage et la spécification VRM"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Fiche VRM</span>
                </button>
              </div>

              {/* Inspector Content Body */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar modal-scroll-body">
                {studioSideTab === 'poses' && (
                  <PoseLibraryPanel
                    activePoseId={activePoseId}
                    poseJoints={poseJoints}
                    isPoseModeActive={isPoseModeActive}
                    onSelectPose={(pose) => {
                      setActivePoseId(pose.id);
                      setPoseJoints(pose.joints);
                      setIsPoseModeActive(true);
                    }}
                    onUpdateJoints={(next) => {
                      setPoseJoints(next);
                      setIsPoseModeActive(true);
                    }}
                    onResumeAnimationMode={() => setIsPoseModeActive(false)}
                    customPoses={customPoses}
                    onSaveCustomPose={(name, joints) => {
                      const newPose: CharacterPosePreset = {
                        id: `pose_custom_${Date.now()}`,
                        name,
                        category: 'perso',
                        categoryLabel: 'Perso',
                        description: 'Pose personnalisée enregistrée dans le studio.',
                        icon: '⭐',
                        joints,
                        isCustom: true,
                      };
                      setCustomPoses((prev) => [...prev, newPose]);
                      setActivePoseId(newPose.id);
                    }}
                    onDeleteCustomPose={(id) =>
                      setCustomPoses((prev) => prev.filter((p) => p.id !== id))
                    }
                    onImportCustomPose={(pose) => setCustomPoses((prev) => [...prev, pose])}
                  />
                )}

                {studioSideTab === 'forge3d' && (
                  <Forge3DCreatorPanel
                    multiViews={multiViews}
                    onUpdateMultiViews={(next) => setMultiViews(next)}
                    onDisplayForgedModel={(model) => setActiveForgedModel(model)}
                    activeForgedModel={activeForgedModel}
                    onClearForgedModel={() => {
                      setActiveForgedModel(null);
                      setCustomEquippedProp(null);
                      setViewport3DMode('character');
                    }}
                    onTriggerHumanoidGLB={() => {
                      setActiveForgedModel(null);
                      setViewport3DMode('character');
                      setTrigger3DReconstruct(true);
                      setTimeout(() => setTrigger3DReconstruct(false), 600);
                    }}
                    onEquipGeneratedWeapon={(model) => {
                      setCustomEquippedProp(model.mesh.clone());
                      setViewport3DMode('character');
                      setAiAnalysisSummary(
                        `Objet "${model.title}" équipé dans la main droite du mannequin 3D.`
                      );
                    }}
                    hasCustomEquippedProp={Boolean(customEquippedProp || wardrobeState.weapon)}
                    onUnequipGeneratedWeapon={() => {
                      setCustomEquippedProp(null);
                      setWardrobeState((prev) => ({ ...prev, weapon: null }));
                      setAiAnalysisSummary('Objet retiré de la main droite du combattant.');
                    }}
                    onOpenMultiViewGallery={() => setStudioSideTab('multiview')}
                  />
                )}

                {studioSideTab === 'mannequin' && (
                  <HumanoidMorphInspector
                    proportions={proportions}
                    onChangeProportions={setProportions}
                    onAutoCalibrateFromFront={handleAutoCalibrateMannequin}
                    frontImageUrl={multiViews.front || selectedElement?.croppedDataUrl || currentImageUrl}
                    multiViews={multiViews}
                    showGhostOverlay={showGhostOverlay}
                    onToggleGhostOverlay={setShowGhostOverlay}
                    ghostOpacity={ghostOpacity}
                    onChangeGhostOpacity={setGhostOpacity}
                    projectTextureOnMannequin={projectTextureOnMannequin}
                    onToggleProjectTexture={setProjectTextureOnMannequin}
                    mannequinStyle={mannequinStyle}
                    onChangeMannequinStyle={setMannequinStyle}
                    isCalibrating={isCalibratingProportions}
                  />
                )}

                {studioSideTab === 'wardrobe' && (
                  <WardrobeManager
                    wardrobeState={wardrobeState}
                    onChangeWardrobe={setWardrobeState}
                    characterName={characterProfile?.name}
                    customWardrobeItems={customWardrobeItems}
                    onOpen3DView={() => {}}
                    onOpenMultiView={() => setStudioSideTab('multiview')}
                  />
                )}

                {studioSideTab === 'multiview' && (
                  <MultiViewManager
                    views={multiViews}
                    activeViewAngle={activeMultiViewAngle}
                    onSelectView={(angle) => {
                      setActiveMultiViewAngle(angle);
                      if (multiViews[angle]) {
                        setCurrentImageUrl(multiViews[angle]!);
                      }
                    }}
                    onUploadView={handleUploadMultiView}
                    onBatchUpdateViews={(next) => setMultiViews(next)}
                    onSliceViewOnCanvas={(angle) => {
                      const url = multiViews[angle];
                      if (url) {
                        setCurrentImageUrl(url);
                        setActiveTab('canvas');
                      }
                    }}
                    onOpenErrorCorrection={() => setStudioSideTab('forge3d')}
                    onTriggerReconstruction={() => {
                      setTrigger3DReconstruct(true);
                      setTimeout(() => setTrigger3DReconstruct(false), 600);
                    }}
                  />
                )}

                {studioSideTab === 'profile' && (
                  <CharacterAIDeck
                    profile={characterProfile}
                    characterImage={currentImageUrl}
                    palette={palette}
                    onOpen3DView={() => {}}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Animation & Spritesheet */}
        {activeTab === 'animation' && (
          <div className="flex flex-col gap-5">
            <SpriteAnimationPlayer
              frames={elements}
              onSelectFrame={(f) => setSelectedElementId(f.id)}
            />

            <RGB565Inspector selectedElement={selectedElement} globalPalette={palette} />
          </div>
        )}

        {/* Tab 5: ESPBoy / AKA (RGB565) */}
        {activeTab === 'rgb565' && (
          <div className="flex flex-col gap-5">
            <RGB565Inspector selectedElement={selectedElement} globalPalette={palette} />

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
              <span className="text-xs font-semibold text-slate-300">
                Sélectionner un autre asset pour conversion RGB565 / ESPBoy :
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {elements.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs shrink-0 transition-all ${
                      el.id === selectedElementId
                        ? 'bg-slate-950 border-emerald-500 ring-1 ring-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {el.croppedDataUrl && (
                      <img
                        src={el.croppedDataUrl}
                        alt={el.label}
                        className="w-6 h-6 object-contain pixelated"
                      />
                    )}
                    <span>{el.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Upload Creation Hub Modal */}
      <UploadCreationHub
        isOpen={isCreationHubOpen}
        onClose={() => setIsCreationHubOpen(false)}
        onImageLoaded={handleImageLoadedFromHub}
        onSelectSamplePreset={handleSelectPreset}
      />

      {/* Export Pack Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        elements={elements}
        palette={palette}
        characterProfile={characterProfile}
        imageDimensions={imageDimensions}
      />

      {/* Add Sliced Element to 3D Wardrobe Modal */}
      <AddCropToWardrobeModal
        isOpen={isAddWardrobeOpen}
        onClose={() => setIsAddWardrobeOpen(false)}
        element={elementForWardrobe}
        onSaveToWardrobe={(newItem) => {
          setCustomWardrobeItems((prev) => [...prev, newItem]);
          setWardrobeState((prev) => ({
            ...prev,
            [newItem.slot]: newItem.id,
          }));
          setIsAddWardrobeOpen(false);
          setActiveTab('wardrobe');
        }}
      />

      {/* Character & Object Bank Modal */}
      <CharacterBankModal
        isOpen={isCharacterBankOpen}
        onClose={() => {
          setIsCharacterBankOpen(false);
          setPendingAnimationTransfer(null);
        }}
        onSelectCharacter={handleSelectBankCharacter}
        onEquipObject={handleEquipBankObject}
        activeCharacterId={selectedPresetId.replace('bank_', '')}
      />

      {/* GitHub Existing Repo Publish Modal */}
      <GitHubPublishModal
        isOpen={isGitHubPublishOpen}
        onClose={() => setIsGitHubPublishOpen(false)}
      />
    </div>
  );
}
