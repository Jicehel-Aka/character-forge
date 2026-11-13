import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { reconstructCharacter3DMesh, Reconstructed3DResult } from '../utils/visualHull3D';
import { Sprite3DRendererModal } from './Sprite3DRendererModal';
import {
  RotateCcw,
  Eye,
  Box,
  Layers,
  Download,
  Maximize2,
  Minimize2,
  Sparkles,
  Camera,
  Play,
  Pause,
  Film,
  User,
  Users,
  Sword,
  Trees,
  Scissors,
  Upload,
  Image as ImageIcon,
  RefreshCw,
  Cpu,
  Share2,
  FileCode,
  Sliders,
  AlertCircle,
  Wand2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Model3DViewMode, RigAnimationPose } from '../types/assets';
import { WardrobeItem, CharacterWardrobeState, MultiViewAngle } from '../types/wardrobe';
import { INITIAL_WARDROBE_STATE } from '../data/wardrobeLibrary';
import { TransferableAnimationId } from '../types/characterBank';
import { TRANSFERABLE_ANIMATIONS } from '../data/characterBank';
import { evaluateSkeletalKinematics, exportTransferableAnimationJSON } from '../utils/animationBank';
import {
  AnatomicalProportions,
  DEFAULT_PROPORTIONS,
  createSculptedHumanoidMeshes,
  calibrateProportionsFromImage,
} from '../utils/humanoidCalibrator';
import { PoseJointMap } from '../types/poses';
import { applyPoseToRigBones, syncSkeletonVisualizerToBones } from '../data/poseLibrary';
import type { ActiveForgedModel } from './Forge3DCreatorPanel';

interface Props {
  characterImageUrl?: string;
  characterName?: string;
  palette?: string[];
  viewMode?: Model3DViewMode;
  onViewModeChange?: (mode: Model3DViewMode) => void;
  wardrobeState?: CharacterWardrobeState;
  customWardrobeItems?: WardrobeItem[];
  onOpenWardrobe?: () => void;
  onOpenCharacterBank?: () => void;
  onTransferAnimation?: (animId: TransferableAnimationId, animName: string) => void;
  turnaroundPrompts?: {
    front?: string;
    left_profile?: string;
    right_profile?: string;
    three_quarter?: string;
    back?: string;
  };
  multiViews?: Record<MultiViewAngle, string | null>;
  onUploadView?: (angle: MultiViewAngle, dataUrl: string) => void;
  onBatchUpdateViews?: (nextViews: Record<MultiViewAngle, string | null>) => void;
  triggerReconstruction?: boolean;
  proportions?: AnatomicalProportions;
  onChangeProportions?: (p: AnatomicalProportions) => void;
  showGhostOverlay?: boolean;
  ghostOpacity?: number;
  projectTextureOnMannequin?: boolean;
  mannequinStyle?: 'studio' | 'skin' | 'wireframe';
  onAutoCalibrate?: () => Promise<void>;
  activePoseJoints?: PoseJointMap | null;
  isPoseModeActive?: boolean;
  onTogglePoseMode?: (active: boolean) => void;
  activeForgedModel?: ActiveForgedModel | null;
  customEquippedProp?: THREE.Group | null;
  onClearForgedModel?: () => void;
  onUnequipCustomProp?: () => void;
  onSendSpriteSheetToWorkspace?: (dataUrl: string, name: string) => void;
}

export interface CharacterRigBones {
  torso?: THREE.Mesh;
  head?: THREE.Mesh;
  armLeft?: THREE.Mesh;
  elbowLeft?: THREE.Group;
  handLeft?: THREE.Group;
  armRight?: THREE.Mesh;
  elbowRight?: THREE.Group;
  handRight?: THREE.Group;
  legLeft?: THREE.Mesh;
  kneeLeft?: THREE.Group;
  legRight?: THREE.Mesh;
  kneeRight?: THREE.Group;
  footLeft?: THREE.Mesh;
  footRight?: THREE.Mesh;
  weaponMount?: THREE.Group;
  cloakMount?: THREE.Group;
  hairMount?: THREE.Group;
  eyewearMount?: THREE.Group;
  armorMount?: THREE.Group;
  beltMount?: THREE.Group;
  glovesLeftMount?: THREE.Group;
  glovesRightMount?: THREE.Group;
}

export const ThreeCharacterViewport: React.FC<Props> = ({
  characterImageUrl,
  characterName = 'Avatar VRM Prototype',
  palette = ['#D4D8DD', '#6E5139', '#2E7D32', '#8C8F94'],
  viewMode = 'character',
  onViewModeChange,
  wardrobeState = INITIAL_WARDROBE_STATE,
  customWardrobeItems = [],
  onOpenWardrobe,
  onOpenCharacterBank,
  onTransferAnimation,
  turnaroundPrompts,
  multiViews,
  onUploadView,
  onBatchUpdateViews,
  triggerReconstruction,
  proportions = DEFAULT_PROPORTIONS,
  onChangeProportions,
  showGhostOverlay = true,
  ghostOpacity = 0.45,
  projectTextureOnMannequin = false,
  mannequinStyle = 'studio',
  onAutoCalibrate,
  activePoseJoints = null,
  isPoseModeActive = false,
  onTogglePoseMode,
  activeForgedModel = null,
  customEquippedProp = null,
  onClearForgedModel,
  onUnequipCustomProp,
  onSendSpriteSheetToWorkspace,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameIdRef = useRef<number>(0);
  const angleFileInputRef = useRef<HTMLInputElement>(null);
  const realModelFileInputRef = useRef<HTMLInputElement>(null);

  // Group references
  const characterGroupRef = useRef<THREE.Group | null>(null);
  const realModelGroupRef = useRef<THREE.Group | null>(null);
  const reconstructedGroupRef = useRef<THREE.Group | null>(null);
  const reconstructedDataRef = useRef<{
    mesh: THREE.Object3D;
    vertexCount: number;
    triangleCount: number;
    exportObj: (name?: string) => string;
    exportGlbBlob: () => Promise<Blob>;
  } | null>(null);
  const reconstructedSourceRef = useRef<'forged' | 'photogrammetry' | null>(null);
  const wardrobeSlotsGroupRef = useRef<THREE.Group | null>(null);
  const propGroupRef = useRef<THREE.Group | null>(null);
  const dioramaGroupRef = useRef<THREE.Group | null>(null);
  const skeletonHelperGroupRef = useRef<THREE.Group | null>(null);
  const ghostPlaneGroupRef = useRef<THREE.Group | null>(null);
  const frontTextureRef = useRef<THREE.Texture | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  // Bones references
  const bonesRef = useRef<CharacterRigBones>({});

  // States
  const [displayMode, setDisplayMode] = useState<'reconstructed' | 'procedural' | 'real_mesh'>('procedural');
  const [isReconstructing, setIsReconstructing] = useState<boolean>(false);
  const [showLandmarkGuides, setShowLandmarkGuides] = useState<boolean>(true);
  const [isAutoCalibrating, setIsAutoCalibrating] = useState<boolean>(false);
  const [reconstructedStats, setReconstructedStats] = useState<{
    vertexCount: number;
    triangleCount: number;
  } | null>(null);
  const [realModelStats, setRealModelStats] = useState<{
    fileName: string;
    vertices: number;
    triangles: number;
    meshCount: number;
  } | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [materialMode, setMaterialMode] = useState<'pbr' | 'toon' | 'normal' | 'clay'>('pbr');
  const [activeView, setActiveView] = useState<MultiViewAngle>('front');
  const [activeAnimation, setActiveAnimation] = useState<TransferableAnimationId>('a_pose');
  const [animationSpeed, setAnimationSpeed] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState<boolean>(true);
  const [isExportingGlb, setIsExportingGlb] = useState<boolean>(false);
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);
  const [exportedStatus, setExportedStatus] = useState<string | null>(null);
  const [internalMode, setInternalMode] = useState<Model3DViewMode>(viewMode);
  const [showReferenceCard, setShowReferenceCard] = useState<boolean>(true);
  const [loadedClips, setLoadedClips] = useState<THREE.AnimationClip[]>([]);
  const [selectedLoadedClipIdx, setSelectedLoadedClipIdx] = useState<number>(0);
  const [isSpriteRendererOpen, setIsSpriteRendererOpen] = useState<boolean>(false);

  // Live refs for rAF loop
  const activeAnimationRef = useRef<TransferableAnimationId>('a_pose');
  const animationSpeedRef = useRef<number>(1.0);
  const autoRotateRef = useRef<boolean>(true);
  const isAnimationPlayingRef = useRef<boolean>(true);
  const displayModeRef = useRef<'reconstructed' | 'procedural' | 'real_mesh'>('procedural');
  const internalModeRef = useRef<Model3DViewMode>(viewMode);
  const isPoseModeActiveRef = useRef<boolean>(false);
  const activePoseJointsRef = useRef<PoseJointMap | null>(null);

  useEffect(() => {
    activeAnimationRef.current = activeAnimation;
  }, [activeAnimation]);

  useEffect(() => {
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    isAnimationPlayingRef.current = isAnimationPlaying;
  }, [isAnimationPlaying]);

  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);

  useEffect(() => {
    internalModeRef.current = internalMode;
  }, [internalMode]);

  useEffect(() => {
    isPoseModeActiveRef.current = Boolean(isPoseModeActive);
    activePoseJointsRef.current = activePoseJoints || null;
  }, [isPoseModeActive, activePoseJoints]);

  const viewLabels: Record<MultiViewAngle, string> = {
    front: 'Face (0°)',
    left: 'Profil Gauche (-90°)',
    right: 'Profil Droit (+90°)',
    back: 'Vue de Dos (180°)',
    top: 'Vue du Dessus (+90°)',
    bottom: 'Vue du Dessous (-90°)',
    three_quarter: 'Perspective 3/4',
  };

  const currentAngleImage = (multiViews && multiViews[activeView]) || characterImageUrl;

  const handleAngleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        setExportedStatus(`Suppression du fond Meshy et calibrage pour "${viewLabels[activeView]}"...`);
        try {
          const { cleanAndNormalizeSingleView } = await import('../utils/viewSegmentation');
          const res = await cleanAndNormalizeSingleView(dataUrl, activeView, {
            removeBg: true,
            autoContrast: true,
            mode: 'auto',
          });
          onUploadView?.(activeView, res.dataUrl);
          setExportedStatus(`Fond retiré et vue "${viewLabels[activeView]}" mise à jour !`);
        } catch {
          onUploadView?.(activeView, dataUrl);
          setExportedStatus(`Image pour la vue "${viewLabels[activeView]}" mise à jour !`);
        }
        setTimeout(() => setExportedStatus(null), 3500);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useEffect(() => {
    setInternalMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 540;

    // Detect software GL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 1. Renderer r160+
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Scene & Environment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3. Camera & Controls
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 1.3, 3.8);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.95, 0);
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 1.2;
    controls.maxDistance = 8.0;
    controlsRef.current = controls;

    // 4. Lighting Rig
    const ambientLight = new THREE.HemisphereLight(0xfff5ea, 0x0f172a, 1.3);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3.0, 4.5, 3.5);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    rimLight.position.set(-3.5, 3.0, -3.0);
    scene.add(rimLight);

    // Warm bounce light
    const bounceLight = new THREE.DirectionalLight(0xffedd5, 1.0);
    bounceLight.position.set(0, -2, 2);
    scene.add(bounceLight);

    // 5. Ground Contact Shadow & Pedestal
    const groundGeo = new THREE.CylinderGeometry(1.6, 1.7, 0.08, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.3,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.04;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    // Glowing stage ring
    const ringGeo = new THREE.RingGeometry(1.4, 1.45, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    // 6. Build the 3 Groups (Character, Prop, Diorama)
    const charGroup = new THREE.Group();
    charGroup.name = 'CharacterGroup';
    scene.add(charGroup);
    characterGroupRef.current = charGroup;

    const wardrobeGroup = new THREE.Group();
    wardrobeGroup.name = 'WardrobeSlotsGroup';
    charGroup.add(wardrobeGroup);
    wardrobeSlotsGroupRef.current = wardrobeGroup;

    const propGroup = new THREE.Group();
    propGroup.name = 'PropGroup';
    propGroup.visible = false;
    scene.add(propGroup);
    propGroupRef.current = propGroup;

    const dioramaGroup = new THREE.Group();
    dioramaGroup.name = 'DioramaGroup';
    dioramaGroup.visible = false;
    scene.add(dioramaGroup);
    dioramaGroupRef.current = dioramaGroup;

    // Reconstructed Character Group (Visual Hull 3D)
    const reconGroup = new THREE.Group();
    reconGroup.name = 'ReconstructedCharacterGroup';
    reconGroup.visible = false;
    scene.add(reconGroup);
    reconstructedGroupRef.current = reconGroup;

    // Bone visualizer group
    const skelGroup = new THREE.Group();
    skelGroup.name = 'SkeletonVisualizer';
    skelGroup.visible = false;
    scene.add(skelGroup);
    skeletonHelperGroupRef.current = skelGroup;

    // Ghost Plane Group (2D Reference Silhouette Overlay)
    const ghostGroup = new THREE.Group();
    ghostGroup.name = 'GhostPlaneGroup';
    scene.add(ghostGroup);
    ghostPlaneGroupRef.current = ghostGroup;

    // Build anatomical sculpted humanoid base body
    buildAnatomicalBaseBody(
      charGroup,
      skelGroup,
      bonesRef.current,
      proportions,
      mannequinStyle,
      projectTextureOnMannequin ? frontTextureRef.current : null
    );

    // Mount initial wardrobe items
    updateWardrobeMeshes(bonesRef.current, wardrobeState, customWardrobeItems);

    // Build 3D Prop & Diorama
    buildPropModel(propGroup);
    buildDioramaStage(dioramaGroup);

    // 7. Animation Loop with Skeletal Kinematics
    let clock = new THREE.Clock();

    function animate() {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Update real model animation if present
      if (mixerRef.current && isAnimationPlayingRef.current) {
        mixerRef.current.update(delta * animationSpeedRef.current);
      }

      // Auto-rotation of active group using live refs
      if (autoRotateRef.current) {
        if (displayModeRef.current === 'reconstructed' && reconstructedGroupRef.current && reconstructedGroupRef.current.visible) {
          reconstructedGroupRef.current.rotation.y += 0.008;
        } else if (displayModeRef.current === 'real_mesh' && realModelGroupRef.current && realModelGroupRef.current.visible) {
          realModelGroupRef.current.rotation.y += 0.008;
        } else if (internalModeRef.current === 'character' && charGroup && charGroup.visible) {
          charGroup.rotation.y += 0.008;
        }
        if (internalModeRef.current === 'prop' && propGroup && propGroup.visible) propGroup.rotation.y += 0.012;
        if (internalModeRef.current === 'diorama' && dioramaGroup && dioramaGroup.visible) dioramaGroup.rotation.y += 0.004;
      }

      // Skeletal Pose / Animation Logic for procedural character
      if (internalModeRef.current === 'character' && bonesRef.current) {
        if (isPoseModeActiveRef.current && activePoseJointsRef.current) {
          applyPoseToRigBones(bonesRef.current, activePoseJointsRef.current);
        } else if (isAnimationPlayingRef.current) {
          // Reset sub-joints back to neutral before cyclic kinematic animation
          bonesRef.current.elbowLeft?.rotation.set(-0.1, 0, 0);
          bonesRef.current.elbowRight?.rotation.set(-0.1, 0, 0);
          bonesRef.current.kneeLeft?.rotation.set(0, 0, 0);
          bonesRef.current.kneeRight?.rotation.set(0, 0, 0);
          bonesRef.current.footLeft?.rotation.set(0, 0, 0);
          bonesRef.current.footRight?.rotation.set(0, 0, 0);
          bonesRef.current.torso?.rotation.set(0, 0, 0);
          bonesRef.current.head?.rotation.set(0, 0, 0);
          evaluateSkeletalKinematics(bonesRef.current, activeAnimationRef.current, elapsed, animationSpeedRef.current);
        }
        if (skelGroup.visible) {
          skelGroup.rotation.y = charGroup.rotation.y;
          syncSkeletonVisualizerToBones(skelGroup, bonesRef.current);
        }
      }

      controls.update();
      renderer.render(scene, camera);
      frameIdRef.current = requestAnimationFrame(animate);
    }

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      renderer.dispose();
    };
  }, []);

  // Sync Forged 3D Model (from Description or Fixed-View Sculpting) into Viewport
  useEffect(() => {
    if (!reconstructedGroupRef.current) return;

    if (!activeForgedModel) {
      if (reconstructedSourceRef.current === 'forged') {
        while (reconstructedGroupRef.current.children.length > 0) {
          reconstructedGroupRef.current.remove(reconstructedGroupRef.current.children[0]);
        }
        reconstructedDataRef.current = null;
        reconstructedSourceRef.current = null;
        setReconstructedStats(null);
        setInternalMode('character');
        onViewModeChange?.('character');
        setDisplayMode('procedural');
      }
      return;
    }

    while (reconstructedGroupRef.current.children.length > 0) {
      reconstructedGroupRef.current.remove(reconstructedGroupRef.current.children[0]);
    }
    reconstructedGroupRef.current.add(activeForgedModel.mesh);
    reconstructedGroupRef.current.position.set(0, 0, 0);
    reconstructedGroupRef.current.rotation.set(0, 0, 0);
    reconstructedSourceRef.current = 'forged';
    reconstructedDataRef.current = {
      mesh: activeForgedModel.mesh,
      vertexCount: activeForgedModel.vertexCount,
      triangleCount: activeForgedModel.triangleCount,
      exportObj: activeForgedModel.exportObj,
      exportGlbBlob: activeForgedModel.exportGlbBlob,
    };
    setReconstructedStats({
      vertexCount: activeForgedModel.vertexCount,
      triangleCount: activeForgedModel.triangleCount,
    });
    setDisplayMode('reconstructed');
  }, [activeForgedModel]);

  // Update Wardrobe Meshes whenever wardrobeState, customWardrobeItems, or customEquippedProp change
  useEffect(() => {
    if (bonesRef.current) {
      updateWardrobeMeshes(bonesRef.current, wardrobeState, customWardrobeItems, customEquippedProp);
      if (displayMode === 'reconstructed' && customEquippedProp) {
        setDisplayMode('procedural');
      }
    }
  }, [wardrobeState, customWardrobeItems, customEquippedProp]);

  // Rebuild humanoid body when proportions, style, or texture projection change
  useEffect(() => {
    if (characterGroupRef.current && skeletonHelperGroupRef.current) {
      buildAnatomicalBaseBody(
        characterGroupRef.current,
        skeletonHelperGroupRef.current,
        bonesRef.current,
        proportions,
        mannequinStyle,
        projectTextureOnMannequin ? frontTextureRef.current : null
      );
      updateWardrobeMeshes(bonesRef.current, wardrobeState, customWardrobeItems, customEquippedProp);
    }
  }, [proportions, mannequinStyle, projectTextureOnMannequin]);

  // Load front texture for ghost plane and optional projection
  useEffect(() => {
    const activeUrl = multiViews?.front || characterImageUrl;
    if (!activeUrl) {
      frontTextureRef.current = null;
      if (ghostPlaneGroupRef.current) ghostPlaneGroupRef.current.clear();
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(activeUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      frontTextureRef.current = tex;

      if (ghostPlaneGroupRef.current) {
        ghostPlaneGroupRef.current.clear();
        if (showGhostOverlay) {
          const planeGeo = new THREE.PlaneGeometry(1.5, 1.9);
          const planeMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: ghostOpacity,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const planeMesh = new THREE.Mesh(planeGeo, planeMat);
          planeMesh.position.set(0, 1.0, -0.38);
          ghostPlaneGroupRef.current.add(planeMesh);
        }
      }
    });
  }, [characterImageUrl, multiViews?.front, showGhostOverlay, ghostOpacity]);

  // Quick Camera Presets
  const setCameraViewPreset = (angle: 'front' | 'side_r' | 'side_l' | 'back' | 'perspective') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    controls.target.set(0, 0.95, 0);
    switch (angle) {
      case 'front':
        cam.position.set(0, 1.05, 3.2);
        break;
      case 'side_r':
        cam.position.set(3.2, 1.05, 0);
        break;
      case 'side_l':
        cam.position.set(-3.2, 1.05, 0);
        break;
      case 'back':
        cam.position.set(0, 1.05, -3.2);
        break;
      case 'perspective':
        cam.position.set(2.2, 1.4, 2.4);
        break;
    }
    controls.update();
  };

  // 1-Click Auto-Calibrate Proportions Handler
  const handleAutoCalibrateMannequin = async () => {
    if (onAutoCalibrate) {
      await onAutoCalibrate();
      return;
    }
    const targetUrl = multiViews?.front || characterImageUrl;
    if (!targetUrl || !onChangeProportions) return;
    setIsAutoCalibrating(true);
    try {
      const detected = await calibrateProportionsFromImage(targetUrl);
      onChangeProportions(detected);
      setCameraViewPreset('front');
    } finally {
      setIsAutoCalibrating(false);
    }
  };

  // Update visibility when internalMode or displayMode changes
  useEffect(() => {
    if (displayMode === 'reconstructed') {
      if (characterGroupRef.current) characterGroupRef.current.visible = false;
      if (realModelGroupRef.current) realModelGroupRef.current.visible = false;
      if (reconstructedGroupRef.current) reconstructedGroupRef.current.visible = true;
      if (propGroupRef.current) propGroupRef.current.visible = false;
      if (dioramaGroupRef.current) dioramaGroupRef.current.visible = false;
      if (skeletonHelperGroupRef.current) skeletonHelperGroupRef.current.visible = false;
    } else if (displayMode === 'real_mesh') {
      if (characterGroupRef.current) characterGroupRef.current.visible = false;
      if (realModelGroupRef.current) realModelGroupRef.current.visible = true;
      if (reconstructedGroupRef.current) reconstructedGroupRef.current.visible = false;
      if (propGroupRef.current) propGroupRef.current.visible = false;
      if (dioramaGroupRef.current) dioramaGroupRef.current.visible = false;
      if (skeletonHelperGroupRef.current) skeletonHelperGroupRef.current.visible = false;
    } else {
      if (characterGroupRef.current) characterGroupRef.current.visible = internalMode === 'character';
      if (realModelGroupRef.current) realModelGroupRef.current.visible = false;
      if (reconstructedGroupRef.current) reconstructedGroupRef.current.visible = false;
      if (propGroupRef.current) propGroupRef.current.visible = internalMode === 'prop';
      if (dioramaGroupRef.current) dioramaGroupRef.current.visible = internalMode === 'diorama';
      if (skeletonHelperGroupRef.current) {
        skeletonHelperGroupRef.current.visible = internalMode === 'character' && showSkeleton;
      }
    }
  }, [internalMode, showSkeleton, displayMode]);

  // Update materials when wireframe or materialMode changes
  useEffect(() => {
    const currentActiveGroup =
      displayMode === 'reconstructed'
        ? reconstructedGroupRef.current
        : displayMode === 'real_mesh'
        ? realModelGroupRef.current
        : internalMode === 'character'
        ? characterGroupRef.current
        : internalMode === 'prop'
        ? propGroupRef.current
        : dioramaGroupRef.current;

    if (!currentActiveGroup) return;

    currentActiveGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          applyShaderMode(mesh, materialMode, wireframe);
        }
      }
    });
  }, [wireframe, materialMode, internalMode, displayMode, wardrobeState, activeForgedModel]);

  // Load custom artwork texture into 3D relief plaque for the active angle
  useEffect(() => {
    if (!currentAngleImage || !characterGroupRef.current) return;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(currentAngleImage, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;

      const existing = characterGroupRef.current?.getObjectByName('canonical_plaque');
      if (existing) characterGroupRef.current?.remove(existing);

      const plaqueGeo = new THREE.PlaneGeometry(1.0, 1.45);
      const plaqueMat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaque.name = 'canonical_plaque';
      plaque.position.set(0.95, 0.95, -0.2);
      plaque.rotation.y = -Math.PI / 8;
      characterGroupRef.current?.add(plaque);
    });
  }, [currentAngleImage]);

  function setCameraAngle(view: MultiViewAngle) {
    if (!cameraRef.current || !controlsRef.current) return;
    setActiveView(view);
    setAutoRotate(false);

    controlsRef.current.target.set(0, 0.95, 0);

    switch (view) {
      case 'front':
        cameraRef.current.position.set(0, 1.0, 3.2);
        break;
      case 'left':
        cameraRef.current.position.set(-3.2, 1.0, 0);
        break;
      case 'right':
        cameraRef.current.position.set(3.2, 1.0, 0);
        break;
      case 'back':
        cameraRef.current.position.set(0, 1.0, -3.2);
        break;
      case 'top':
        cameraRef.current.position.set(0, 3.4, 0.05);
        break;
      case 'bottom':
        cameraRef.current.position.set(0, -2.4, 0.05);
        break;
      case 'three_quarter':
      default:
        cameraRef.current.position.set(2.2, 1.3, 2.4);
        break;
    }
    controlsRef.current.update();
  }

  // Generate Real Clean 3D Humanoid Model from Multi-Views with automatic background removal & view alignment
  const handleGenerate3DFromViews = async () => {
    if (!sceneRef.current || !reconstructedGroupRef.current) return;
    setIsReconstructing(true);
    setExportedStatus(
      'Préparation auto (détourage du fond, alignement Dos/Face au sol, rotation Dessus)...'
    );

    try {
      const rawViews: Record<MultiViewAngle, string | null> = {
        front: multiViews?.front || characterImageUrl || null,
        left: multiViews?.left || null,
        right: multiViews?.right || null,
        back: multiViews?.back || null,
        top: multiViews?.top || null,
        bottom: multiViews?.bottom || null,
        three_quarter: multiViews?.three_quarter || null,
      };

      const { autoPrepareAllViews } = await import('../utils/viewSegmentation');
      const { preparedViews, actions } = await autoPrepareAllViews(rawViews, {
        removeBg: true,
        autoContrast: true,
        autoRotateTopBottom: true,
      });

      // Propagate cleaned & aligned views back to Multi-View gallery so user sees transparent cutouts & fixed orientations
      if (onBatchUpdateViews && multiViews) {
        onBatchUpdateViews(preparedViews);
      }

      setExportedStatus('Sculpture HD Surface Nets SDF & Texture Multi-Vues en cours...');

      const result = await reconstructCharacter3DMesh({
        views: preparedViews,
        resolutionY: 68,
        radialSegments: 48,
        smoothNormals: true,
      });

      // Clean existing children in reconstructed group
      while (reconstructedGroupRef.current.children.length > 0) {
        const child = reconstructedGroupRef.current.children[0];
        reconstructedGroupRef.current.remove(child);
      }

      reconstructedGroupRef.current.add(result.mesh);
      reconstructedDataRef.current = result;
      reconstructedSourceRef.current = 'photogrammetry';
      onClearForgedModel?.();

      // Position to center
      reconstructedGroupRef.current.position.set(0, 0, 0);

      setInternalMode('character');
      onViewModeChange?.('character');
      setDisplayMode('reconstructed');
      setReconstructedStats({
        vertexCount: result.vertexCount,
        triangleCount: result.triangleCount,
      });

      const prepNote = actions.length > 0 ? ` (${actions[0]})` : '';
      setExportedStatus(
        `Modèle 3D propre généré (${result.triangleCount.toLocaleString()} triangles)${prepNote} ! Prêt pour export .GLB.`
      );
      setTimeout(() => setExportedStatus(null), 5500);
    } catch (err: any) {
      console.error('Error generating 3D from views:', err);
      setExportedStatus(
        err?.message || 'Erreur lors de la synthèse 3D. Vérifiez les vues fournies.'
      );
      setTimeout(() => setExportedStatus(null), 6000);
    } finally {
      setIsReconstructing(false);
    }
  };

  // Automatically trigger 3D reconstruction when requested via prop
  useEffect(() => {
    if (triggerReconstruction) {
      handleGenerate3DFromViews();
    }
  }, [triggerReconstruction]);
  const loadModelFile = (file: File) => {
    if (!file || file.size === 0) {
      setExportedStatus('Fichier vide ou illisible.');
      setTimeout(() => setExportedStatus(null), 3000);
      return;
    }
    setIsLoadingModel(true);
    const fileName = file.name;
    const ext = fileName.split('.').pop()?.toLowerCase();

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) {
        setIsLoadingModel(false);
        return;
      }

      const finishLoading = (object: THREE.Object3D, animations?: THREE.AnimationClip[]) => {
        if (!sceneRef.current) return;
        if (realModelGroupRef.current) {
          sceneRef.current.remove(realModelGroupRef.current);
          realModelGroupRef.current = null;
        }

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.9 / (maxDim || 1);

        const containerGroup = new THREE.Group();
        containerGroup.name = 'UserReal3DModel';
        object.scale.setScalar(scale);
        object.position.sub(center.multiplyScalar(scale));
        object.position.y += 0.95;
        containerGroup.add(object);

        let vertexCount = 0;
        let triangleCount = 0;
        let meshCount = 0;

        object.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            meshCount++;
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.geometry) {
              const geom = mesh.geometry;
              vertexCount += geom.attributes.position ? geom.attributes.position.count : 0;
              triangleCount += geom.index
                ? geom.index.count / 3
                : geom.attributes.position
                ? geom.attributes.position.count / 3
                : 0;
            }
          }
        });

        const validAnims = (animations || []).filter((c) => c.tracks && c.tracks.length > 0);
        setLoadedClips(validAnims);
        setSelectedLoadedClipIdx(0);

        if (validAnims.length > 0) {
          mixerRef.current = new THREE.AnimationMixer(object);
          const action = mixerRef.current.clipAction(validAnims[0]);
          action.play();
        } else {
          mixerRef.current = null;
        }

        sceneRef.current.add(containerGroup);
        realModelGroupRef.current = containerGroup;

        if (characterGroupRef.current) {
          characterGroupRef.current.visible = false;
        }

        setRealModelStats({
          fileName,
          vertices: Math.round(vertexCount),
          triangles: Math.round(triangleCount),
          meshCount,
        });
        setDisplayMode('real_mesh');
        setIsLoadingModel(false);
        setExportedStatus(
          `Modèle 3D "${fileName}" (${Math.round(triangleCount).toLocaleString()} triangles, ${validAnims.length} anim.) chargé !`
        );
        setTimeout(() => setExportedStatus(null), 4000);
      };

      if (ext === 'glb' || ext === 'gltf' || ext === 'vrm') {
        const loader = new GLTFLoader();
        loader.parse(
          arrayBuffer,
          '',
          (gltf) => {
            finishLoading(gltf.scene, gltf.animations);
          },
          (err) => {
            console.error('Error parsing GLTF/VRM:', err);
            setIsLoadingModel(false);
            setExportedStatus('Erreur de lecture du fichier GLB/VRM.');
            setTimeout(() => setExportedStatus(null), 3000);
          }
        );
      } else if (ext === 'fbx') {
        try {
          const fbxLoader = new FBXLoader();
          const fbxObj = fbxLoader.parse(arrayBuffer, '');
          finishLoading(fbxObj, (fbxObj as unknown as { animations?: THREE.AnimationClip[] }).animations || []);
        } catch (err) {
          console.error('Error parsing FBX:', err);
          setIsLoadingModel(false);
          setExportedStatus('Erreur de lecture du fichier FBX (exportez en GLB ou FBX récent).');
          setTimeout(() => setExportedStatus(null), 3500);
        }
      } else if (ext === 'obj') {
        const text = new TextDecoder().decode(arrayBuffer);
        const objLoader = new OBJLoader();
        try {
          const obj = objLoader.parse(text);
          finishLoading(obj);
        } catch (err) {
          console.error('Error parsing OBJ:', err);
          setIsLoadingModel(false);
        }
      } else {
        setIsLoadingModel(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Load 1-click CC0 example mannequin from /exemple/mannequin.glb (from character-forge GitHub)
  const loadExampleMannequin = async () => {
    setIsLoadingModel(true);
    setExportedStatus('Chargement du mannequin libre de droits CC0 (Idle & Walk)...');
    try {
      const resp = await fetch('./exemple/mannequin.glb');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      loadModelFile(new File([blob], 'mannequin_exemple_CC0.glb', { type: 'model/gltf-binary' }));
    } catch (err) {
      console.error('Failed to load example mannequin:', err);
      setIsLoadingModel(false);
      setExportedStatus("Impossible de charger l'exemple CC0 (./exemple/mannequin.glb).");
      setTimeout(() => setExportedStatus(null), 3500);
    }
  };

  const handleSelectLoadedClip = (idx: number) => {
    setSelectedLoadedClipIdx(idx);
    if (!mixerRef.current || !loadedClips[idx]) return;
    mixerRef.current.stopAllAction();
    const act = mixerRef.current.clipAction(loadedClips[idx]);
    act.reset().play();
  };

  // Export 3D Mesh as binary GLTF (.glb) format
  const exportGLB = async () => {
    setIsExportingGlb(true);
    setExportedStatus('Génération du fichier binaire .GLB en cours...');
    try {
      if (displayMode === 'reconstructed' && reconstructedDataRef.current) {
        const blob = await reconstructedDataRef.current.exportGlbBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${characterName.replace(/[^a-zA-Z0-9_-]/g, '_')}_clean_mesh.glb`;
        a.click();
        URL.revokeObjectURL(url);
        setExportedStatus('Modèle 3D propre (.GLB) exporté avec succès ! Prêt pour Blender, Unity ou Godot.');
        setTimeout(() => setExportedStatus(null), 4000);
        return;
      }

      const targetGroup =
        displayMode === 'real_mesh'
          ? realModelGroupRef.current
          : internalMode === 'character'
          ? characterGroupRef.current
          : internalMode === 'prop'
          ? propGroupRef.current
          : dioramaGroupRef.current;

      if (!targetGroup) return;

      const { exportObjectToGLBBlob } = await import('../utils/visualHull3D');
      const blob = await exportObjectToGLBBlob(targetGroup);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${characterName.replace(/[^a-zA-Z0-9_-]/g, '_')}.glb`;
      a.click();
      URL.revokeObjectURL(url);
      setExportedStatus('Fichier 3D (.GLB) exporté avec succès !');
      setTimeout(() => setExportedStatus(null), 4000);
    } catch (err) {
      console.error('Error exporting GLB:', err);
      setExportedStatus('Erreur lors de la génération du fichier GLB.');
      setTimeout(() => setExportedStatus(null), 3000);
    } finally {
      setIsExportingGlb(false);
    }
  };

  // Export 3D Mesh as Wavefront OBJ format
  function exportOBJ() {
    if (displayMode === 'reconstructed' && reconstructedDataRef.current) {
      const objOutput = reconstructedDataRef.current.exportObj(characterName);
      const blob = new Blob([objOutput], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${characterName.replace(/[^a-zA-Z0-9_-]/g, '_')}_reconstructed_3d.obj`;
      a.click();
      URL.revokeObjectURL(url);
      setExportedStatus('Maillage 3D Visual Hull (.OBJ) exporté avec succès !');
      setTimeout(() => setExportedStatus(null), 3000);
      return;
    }

    const targetGroup =
      displayMode === 'real_mesh'
        ? realModelGroupRef.current
        : internalMode === 'character'
        ? characterGroupRef.current
        : internalMode === 'prop'
        ? propGroupRef.current
        : dioramaGroupRef.current;

    if (!targetGroup) return;

    let objOutput = `# CharacterGen 3D Model: ${characterName} (${displayMode === 'real_mesh' ? 'RealMesh' : internalMode})\n# Exported from Asset Recovery Agent & CharacterAI Studio\n`;
    let vertexOffset = 1;

    targetGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.name !== 'canonical_plaque') {
        const mesh = child as THREE.Mesh;
        if (!mesh.geometry) return;
        const geo = mesh.geometry.clone().toNonIndexed();
        mesh.updateMatrixWorld();
        geo.applyMatrix4(mesh.matrixWorld);

        const pos = geo.attributes.position;
        if (!pos) return;
        objOutput += `o ${mesh.name || 'Part'}\n`;

        for (let i = 0; i < pos.count; i++) {
          objOutput += `v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}\n`;
        }

        for (let i = 0; i < pos.count; i += 3) {
          objOutput += `f ${vertexOffset + i} ${vertexOffset + i + 1} ${vertexOffset + i + 2}\n`;
        }
        vertexOffset += pos.count;
      }
    });

    const blob = new Blob([objOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${characterName.replace(/[^a-zA-Z0-9_-]/g, '_')}_3d.obj`;
    a.click();
    URL.revokeObjectURL(url);

    setExportedStatus('Maillage 3D Wavefront (.OBJ) exporté avec succès !');
    setTimeout(() => setExportedStatus(null), 3000);
  }

  function captureSnapshot() {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${characterName.replace(/[^a-zA-Z0-9_-]/g, '_')}_3d_snapshot.png`;
    a.click();
    setExportedStatus('Capture HD du rendu 3D enregistrée (.PNG) !');
    setTimeout(() => setExportedStatus(null), 3000);
  }

  // Export transferable animation track as JSON
  function handleExportAnimation() {
    const jsonStr = exportTransferableAnimationJSON(activeAnimation, characterName);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anim_${activeAnimation}_${characterName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportedStatus(`Piste d'animation "${activeAnimation}" exportée (.JSON) !`);
    setTimeout(() => setExportedStatus(null), 3000);
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'glb' || ext === 'gltf' || ext === 'vrm' || ext === 'fbx' || ext === 'obj') {
            loadModelFile(file);
          }
        }
      }}
      className={`bg-slate-950 flex flex-col transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none w-screen h-screen'
          : 'relative w-full h-full min-h-[580px] rounded-xl border border-slate-800 overflow-hidden'
      }`}
    >
      {/* Top Header Information & Mode Switchers */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 max-w-[80%]">
        <div className="flex items-center gap-2 bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-700/70 text-xs shadow-lg">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-slate-100">{characterName}</span>
          <span className="text-slate-500">·</span>
          <span className="text-sky-400 font-mono text-[11px]">CharacterGen 3D</span>
        </div>

        {/* 3-Way Mode Switcher: Mannequin Animable vs Vrai 3D Propre GLB vs Modèle Externe */}
        <div className="flex items-center bg-slate-900/95 backdrop-blur-md p-1 rounded-lg border border-slate-700/70 text-xs shadow-lg">
          <button
            onClick={() => {
              setInternalMode('character');
              onViewModeChange?.('character');
              setDisplayMode('procedural');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
              displayMode === 'procedural'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Afficher le mannequin articulé pour tester les poses, la garde-robe et les animations"
          >
            <User className="w-3.5 h-3.5" />
            <span>🥋 Mannequin Rig</span>
          </button>

          <button
            onClick={() => {
              if (!reconstructedDataRef.current) {
                handleGenerate3DFromViews();
              } else {
                setDisplayMode('reconstructed');
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
              displayMode === 'reconstructed'
                ? 'bg-amber-500 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
            }`}
            title="Afficher le vrai personnage/objet 3D sculpté directement à partir de vos vues fixes (sans mannequin)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {reconstructedStats
                ? `✨ Vrai Perso 3D (${reconstructedStats.triangleCount.toLocaleString()} poly)`
                : '✨ Vrai Perso 3D (Vues)'}
            </span>
          </button>

          <button
            onClick={() => {
              if (!realModelGroupRef.current) {
                realModelFileInputRef.current?.click();
              } else {
                setDisplayMode('real_mesh');
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
              displayMode === 'real_mesh'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Charger un fichier 3D existant (.GLB / .VRM / .OBJ)"
          >
            <Box className="w-3.5 h-3.5" />
            <span>
              {realModelStats
                ? `🎮 Modèle Importé (${realModelStats.triangles.toLocaleString()} poly)`
                : '📥 Charger Fichier .GLB'}
            </span>
          </button>
        </div>

        {/* Action Button: Lancer la Sculpture du Vrai Personnage 3D */}
        <button
          onClick={handleGenerate3DFromViews}
          disabled={isReconstructing}
          className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg border border-amber-400/50 text-xs font-bold shadow-lg transition-all cursor-pointer"
          title="Sculpter un vrai modèle 3D continu (Surface Nets SDF + Lissage Taubin) directement à partir de vos vues fixes (sans mannequin)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isReconstructing ? 'animate-spin' : ''}`} />
          <span>{isReconstructing ? 'Sculpture 3D...' : '⚡ Sculpter Vrai Perso 3D (.GLB)'}</span>
        </button>

        {/* 3D Mode Selector: Character / Prop / Diorama (when in procedural mode) */}
        {displayMode === 'procedural' && (
          <div className="flex items-center bg-slate-900/95 backdrop-blur-md p-1 rounded-lg border border-slate-700/70 text-xs shadow-lg">
            <button
              onClick={() => {
                setInternalMode('character');
                onViewModeChange?.('character');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors ${
                internalMode === 'character' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Personnage</span>
            </button>
            <button
              onClick={() => {
                setInternalMode('prop');
                onViewModeChange?.('prop');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors ${
                internalMode === 'prop' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sword className="w-3 h-3" />
              <span>Objet</span>
            </button>
            <button
              onClick={() => {
                setInternalMode('diorama');
                onViewModeChange?.('diorama');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors ${
                internalMode === 'diorama' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trees className="w-3 h-3" />
              <span>Diorama</span>
            </button>
          </div>
        )}

        {/* Wardrobe Quick Trigger Button */}
        {displayMode === 'procedural' && internalMode === 'character' && onOpenWardrobe && (
          <button
            onClick={onOpenWardrobe}
            className="flex items-center gap-1.5 bg-pink-600/90 hover:bg-pink-500 backdrop-blur-md text-white px-3 py-1.5 rounded-lg border border-pink-400/40 text-xs font-semibold shadow-lg transition-colors"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Garde-Robe & Déshabillage</span>
          </button>
        )}

        {/* Character & Object Bank Trigger Button */}
        {onOpenCharacterBank && (
          <button
            onClick={onOpenCharacterBank}
            className="flex items-center gap-1.5 bg-indigo-600/90 hover:bg-indigo-500 backdrop-blur-md text-white px-3 py-1.5 rounded-lg border border-indigo-400/40 text-xs font-semibold shadow-lg transition-colors"
            title="Ouvrir la banque de personnages et d'objets 3D pour changer de modèle ou équiper des armes"
          >
            <Users className="w-3.5 h-3.5" />
            <span>👥 Banque Personnages & Objets</span>
          </button>
        )}
        {/* Quick Unequip Custom Sword / Weapon from Right Hand */}
        {displayMode === 'procedural' && (customEquippedProp || wardrobeState?.weapon) && onUnequipCustomProp && (
          <button
            onClick={onUnequipCustomProp}
            className="flex items-center gap-1.5 bg-rose-600/90 hover:bg-rose-500 backdrop-blur-md text-white px-3 py-1.5 rounded-lg border border-rose-400/50 text-xs font-bold shadow-lg transition-colors cursor-pointer"
            title="Retirer l'arme ou l'objet forgé de la main droite du combattant"
          >
            <X className="w-3.5 h-3.5" />
            <span>Retirer l’objet en main</span>
          </button>
        )}

        {/* 1-Click Auto-Calibrate on Front Photo */}
        {displayMode === 'procedural' && (
          <button
            onClick={handleAutoCalibrateMannequin}
            disabled={isAutoCalibrating || (!characterImageUrl && !multiViews?.front)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md border border-purple-400/40 transition-all disabled:opacity-50"
            title="Ajuste automatiquement les dimensions, membres et proportions du mannequin 3D d'après votre vue de face"
          >
            <Wand2 className={`w-3.5 h-3.5 ${isAutoCalibrating ? 'animate-spin text-amber-300' : 'text-pink-300'}`} />
            <span>{isAutoCalibrating ? 'Calibrage...' : '🎯 Caler sur Face'}</span>
          </button>
        )}

        {/* Quick Camera Angles Pill (Atelier / Maya standard angles) */}
        <div className="flex items-center bg-slate-900/95 backdrop-blur-md p-0.5 rounded-lg border border-slate-700/70 text-[11px] shadow-lg">
          <button
            onClick={() => setCameraViewPreset('front')}
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-medium"
            title="Vue de Face (Angle 0° Ortho)"
          >
            Face
          </button>
          <button
            onClick={() => setCameraViewPreset('side_r')}
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-medium"
            title="Profil Droit (Angle +90°)"
          >
            Profil D
          </button>
          <button
            onClick={() => setCameraViewPreset('side_l')}
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-medium"
            title="Profil Gauche (Angle -90°)"
          >
            Profil G
          </button>
          <button
            onClick={() => setCameraViewPreset('back')}
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-medium"
            title="Vue Dos (Angle 180°)"
          >
            Dos
          </button>
          <button
            onClick={() => setCameraViewPreset('perspective')}
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-medium"
            title="Perspective Dynamique 3/4"
          >
            3/4
          </button>
        </div>

        {/* Toggle Landmark Guides (Sommet, Menton, Épaules, Hanches, Genoux, Sol) */}
        {displayMode === 'procedural' && (
          <button
            onClick={() => setShowLandmarkGuides(!showLandmarkGuides)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors shadow-sm ${
              showLandmarkGuides
                ? 'bg-indigo-600/40 border-indigo-400 text-white font-medium'
                : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Afficher/masquer les repères de hauteur anatomique (Atelier : Sommet, Menton, Épaules, Hanches, Genoux, Sol)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>📏 Repères</span>
          </button>
        )}
      </div>

      {/* Status & Export Banner when in Reconstructed / Forged 3D Mode */}
      {displayMode === 'reconstructed' && (
        <div className="absolute top-16 left-4 z-10 max-w-xl flex flex-wrap items-center justify-between gap-2.5 bg-emerald-950/90 border border-emerald-500/50 p-2.5 px-3 rounded-xl text-xs text-emerald-200 shadow-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>{activeForgedModel ? activeForgedModel.title : 'Vrai Personnage 3D Sculpté'}</strong>{' '}
              ({activeForgedModel ? activeForgedModel.sourceLabel : 'Surface Nets SDF Multi-Vues + Couleurs HD (sans mannequin)'})
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <button
              onClick={exportGLB}
              disabled={isExportingGlb}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
              title="Télécharger directement le fichier .GLB propre du personnage"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingGlb ? 'Export...' : 'Télécharger .GLB'}</span>
            </button>
            <button
              onClick={() => {
                setInternalMode('character');
                onViewModeChange?.('character');
                setDisplayMode('procedural');
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
              title="Basculer sur le mannequin customisable (Garde-robe, Équipements & Animations)"
            >
              <User className="w-3.5 h-3.5" />
              <span>🥋 Studio Custom & Rig</span>
            </button>
            {activeForgedModel && onClearForgedModel && (
              <button
                onClick={onClearForgedModel}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                title="Supprimer cet objet forgé et revenir au combattant"
              >
                <X className="w-3.5 h-3.5" />
                <span>Fermer l’objet</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input for reloading image on active view */}
      <input
        ref={angleFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleAngleFileChange}
        className="hidden"
      />

      {/* Hidden file input for loading real 3D models (.glb, .gltf, .vrm, .fbx, .obj) */}
      <input
        ref={realModelFileInputRef}
        type="file"
        accept=".glb,.gltf,.vrm,.fbx,.obj"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadModelFile(file);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Camera View Turnaround Angles (Top-Right: 7 Angles Meshy & CharacterAI) */}
      <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-1.5 bg-slate-900/95 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/70 text-xs shadow-lg">
        {(['front', 'left', 'right', 'back', 'top', 'bottom', 'three_quarter'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setCameraAngle(view)}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeView === view
                ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-300/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {view === 'front'
              ? 'Face'
              : view === 'left'
              ? 'Profil G'
              : view === 'right'
              ? 'Profil D'
              : view === 'back'
              ? 'Dos'
              : view === 'top'
              ? 'Dessus'
              : view === 'bottom'
              ? 'Dessous'
              : '3/4'}
          </button>
        ))}

        <div className="w-[1px] h-4 bg-slate-700 mx-1" />

        {/* PROMINENT RE-UPLOAD BUTTON DIRECTLY ON 3D SCREEN */}
        <button
          onClick={() => angleFileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-sm transition-colors text-xs"
          title={`Recharger la bonne image pour la vue ${viewLabels[activeView]}`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>
            Recharger {viewLabels[activeView].split('(')[0].trim()}
          </span>
        </button>

        <button
          onClick={captureSnapshot}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Capture instantanée HD (.PNG)"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>

        {/* Fullscreen / Focus Mode Toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title={isFullscreen ? 'Quitter le Plein Écran (Échap)' : 'Agrandir en Plein Écran'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Prompt Card to Load Real 3D File when in real_mesh mode with no file */}
      {displayMode === 'real_mesh' && !realModelStats && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/85 backdrop-blur-sm pointer-events-auto">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Box className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Visualiser le Vrai Personnage 3D</h4>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Le studio affiche par défaut un <strong>mannequin procédural stylisé</strong> pour tester le squelette et la garde-robe. Pour visualiser votre <strong>vrai personnage 3D complet</strong> généré par <strong>Meshy (.glb)</strong> ou <strong>CharacterAI (.vrm)</strong> avec son maillage haute fidélité exact et ses textures :
              </p>
            </div>
            <button
              onClick={() => realModelFileInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Choisir mon fichier .GLB / .FBX / .VRM / .OBJ</span>
            </button>
            <button
              onClick={loadExampleMannequin}
              disabled={isLoadingModel}
              className="w-full py-2 px-4 bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-400/50 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Essayer avec le Mannequin Exemple CC0 (Idle &amp; Walk)</span>
            </button>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>Glissez-déposez le fichier ici</span>
              <span>•</span>
              <button
                onClick={() => setDisplayMode('procedural')}
                className="text-sky-400 hover:underline"
              >
                Retourner au mannequin stylisé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Card for Visual Hull Reconstruction when in reconstructed mode with no data */}
      {displayMode === 'reconstructed' && !reconstructedStats && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/85 backdrop-blur-sm pointer-events-auto">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500/40 rounded-2xl p-6 text-center flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Générer le Vrai Modèle 3D Multi-Vues</h4>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Notre moteur de reconstruction volumétrique (Visual Hull) découpe et sculpte un véritable maillage 3D à partir des silhouettes de vos vues orthogonales (<strong>Face, Dos, Profils, Dessus, Dessous</strong>) et projette les textures correspondantes directement sur les polygones.
              </p>
            </div>
            <button
              onClick={handleGenerate3DFromViews}
              disabled={isReconstructing}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isReconstructing ? 'animate-spin' : ''}`} />
              <span>{isReconstructing ? 'Sculpture 3D en cours...' : '⚡ Lancer la Reconstruction 3D (Visual Hull)'}</span>
            </button>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <button
                onClick={() => setDisplayMode('procedural')}
                className="text-sky-400 hover:underline"
              >
                Retourner au mannequin stylisé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating 2D Angle Reference Plaque & Instant Re-upload Card */}
      {showReferenceCard && (
        <div className="absolute top-16 right-4 z-10 bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/80 shadow-2xl flex flex-col gap-2.5 w-64 animate-fade-in">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-100">
              <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>Vue : {viewLabels[activeView]}</span>
            </div>
            <button
              onClick={() => setShowReferenceCard(false)}
              className="text-slate-500 hover:text-slate-300 text-[10px]"
              title="Masquer cette vignette"
            >
              ✕
            </button>
          </div>

          {/* Visual preview */}
          <div
            onClick={() => angleFileInputRef.current?.click()}
            className="relative w-full h-36 rounded-lg overflow-hidden bg-slate-950 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] border border-slate-800 flex items-center justify-center cursor-pointer group"
            title="Cliquez pour changer l'image de cette vue"
          >
            {currentAngleImage ? (
              <img
                src={currentAngleImage}
                alt={viewLabels[activeView]}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <div className="text-center p-3 text-slate-400 text-xs flex flex-col items-center gap-1.5">
                <Upload className="w-5 h-5 text-sky-400" />
                <span className="font-semibold text-slate-300">Aucune image pour cette vue</span>
                <span className="text-[10px] text-slate-500">Cliquez pour charger</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-xs text-white font-medium">
              <Upload className="w-4 h-4 text-sky-400" />
              <span>Cliquer pour charger / remplacer</span>
            </div>
          </div>

          {/* Big Action Button to reload the right image */}
          <button
            onClick={() => angleFileInputRef.current?.click()}
            className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors ring-1 ring-sky-400/40"
          >
            <Upload className="w-4 h-4" />
            <span>
              {currentAngleImage
                ? `Remplacer ma vue (${viewLabels[activeView].split('(')[0].trim()})`
                : `Charger ma vue (${viewLabels[activeView].split('(')[0].trim()})`}
            </span>
          </button>
        </div>
      )}

      {/* Main 3D Canvas Viewport */}
      <div ref={mountRef} className="w-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Anatomical Landmark Guide Overlay (Inspired by character-forge atelier.html) */}
      {showLandmarkGuides && displayMode === 'procedural' && (
        <div className="absolute inset-y-16 left-4 right-4 pointer-events-none z-10 flex flex-col justify-between py-4">
          <div className="flex flex-col gap-2 font-mono text-[10px] text-slate-400 select-none">
            <div className="flex items-center gap-2">
              <span className="w-24 text-right font-bold text-sky-400 shrink-0">1.80m · Crâne</span>
              <div className="flex-1 border-b border-dashed border-sky-400/40" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-24 text-right text-indigo-300 shrink-0">1.48m · Menton</span>
              <div className="flex-1 border-b border-dashed border-indigo-400/30" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-24 text-right text-pink-300 shrink-0">1.25m · Épaules</span>
              <div className="flex-1 border-b border-dashed border-pink-400/30" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <span className="w-24 text-right text-amber-300 shrink-0">0.90m · Hanches</span>
              <div className="flex-1 border-b border-dashed border-amber-400/30" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-24 text-right text-emerald-300 shrink-0">0.77m · Entrejambe</span>
              <div className="flex-1 border-b border-dashed border-emerald-400/30" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <span className="w-24 text-right text-cyan-300 shrink-0">0.45m · Genoux</span>
              <div className="flex-1 border-b border-dashed border-cyan-400/30" />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <span className="w-24 text-right font-bold text-white shrink-0">0.00m · Sol</span>
              <div className="flex-1 border-b border-solid border-slate-500/60" />
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {exportedStatus && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-emerald-600 text-white text-xs px-4 py-2 rounded-lg shadow-xl animate-fade-in flex items-center gap-2">
          <Download className="w-3.5 h-3.5" />
          <span>{exportedStatus}</span>
        </div>
      )}

      {/* Collapsible Bottom Control Dock */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 transition-all duration-300 w-[96%] max-w-3xl ${
          hudCollapsed ? 'translate-y-[calc(100%-36px)]' : 'translate-y-0'
        }`}
      >
        <div className="bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl p-3.5 backdrop-blur-md flex flex-col gap-2.5 max-h-[45vh] overflow-y-auto modal-scroll-body">
          {/* Header & Toggle */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <Box className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {internalMode === 'character'
                  ? 'Banque d’Animations Squelettiques & Shaders 3D'
                  : internalMode === 'prop'
                  ? 'Contrôles d’Inspection 3D Objet / Arme'
                  : 'Contrôles Diorama & Scène Décor'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
                title="Basculer en Plein Écran"
              >
                {isFullscreen ? <Minimize2 className="w-3 h-3 text-amber-400" /> : <Maximize2 className="w-3 h-3" />}
                <span>{isFullscreen ? 'Fenêtré' : 'Plein Écran'}</span>
              </button>
              <button
                onClick={() => setHudCollapsed(!hudCollapsed)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800"
              >
                {hudCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                <span>{hudCollapsed ? 'Afficher Dock' : 'Masquer'}</span>
              </button>
            </div>
          </div>

          {/* Row 1: Embedded Clips (for imported GLB/FBX) OR Enriched Procedural Animation Bank */}
          {displayMode === 'real_mesh' && loadedClips.length > 0 ? (
            <div className="flex flex-col gap-1.5 pt-0.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-300 font-semibold">
                    Clips du fichier ({loadedClips.length}) :
                  </span>
                  <button
                    onClick={() => setIsAnimationPlaying(!isAnimationPlaying)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                      isAnimationPlaying
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {isAnimationPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{isAnimationPlaying ? 'Lecture' : 'Pause'}</span>
                  </button>
                  <button
                    onClick={() => realModelFileInputRef.current?.click()}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px]"
                  >
                    Changer de fichier…
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 modal-scroll-body">
                {loadedClips.map((clip, idx) => (
                  <button
                    key={`${clip.name}_${idx}`}
                    onClick={() => handleSelectLoadedClip(idx)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      selectedLoadedClipIdx === idx
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {clip.name || `Clip ${idx + 1}`} ({clip.duration.toFixed(1)}s)
                  </button>
                ))}
              </div>
            </div>
          ) : (
            internalMode === 'character' && displayMode !== 'reconstructed' && (
              <div className="flex flex-col gap-1.5 pt-0.5 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                      <span>Animations ({TRANSFERABLE_ANIMATIONS.length}) :</span>
                    </span>
                    {/* Play / Pause Toggle */}
                    <button
                      onClick={() => setIsAnimationPlaying(!isAnimationPlaying)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                        isAnimationPlaying
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                      title={isAnimationPlaying ? 'Mettre en pause' : 'Reprendre la lecture'}
                    >
                      {isAnimationPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{isAnimationPlaying ? 'Lecture' : 'Pause'}</span>
                    </button>

                    {/* Speed Multiplier */}
                    <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px]">
                      {[0.5, 1.0, 1.5, 2.0].map((s) => (
                        <button
                          key={s}
                          onClick={() => setAnimationSpeed(s)}
                          className={`px-1.5 py-0.5 rounded transition-colors ${
                            animationSpeed === s
                              ? 'bg-sky-500 text-white font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Squelette & Animation Transfer / Export Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setShowSkeleton(!showSkeleton)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] transition-colors ${
                        showSkeleton
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                      title="Afficher les os et articulations 3D du squelette"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Squelette 3D</span>
                    </button>

                    {/* Transfer to other character */}
                    {onTransferAnimation && (
                      <button
                        onClick={() => {
                          const currentAnim = TRANSFERABLE_ANIMATIONS.find((a) => a.id === activeAnimation);
                          onTransferAnimation(activeAnimation, currentAnim?.name || activeAnimation);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors"
                        title="Appliquer cette animation à un autre personnage de la banque"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>Transférer Animation</span>
                      </button>
                    )}

                    {/* Export JSON Animation */}
                    <button
                      onClick={handleExportAnimation}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] transition-colors"
                      title="Exporter les keyframes de l'animation en fichier JSON"
                    >
                      <FileCode className="w-3 h-3 text-amber-400" />
                      <span>Export JSON</span>
                    </button>
                  </div>
                </div>

                {/* Scrollable Animation Pills List */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 modal-scroll-body">
                  {TRANSFERABLE_ANIMATIONS.map((anim) => {
                    const isSelected = !isPoseModeActive && activeAnimation === anim.id;
                    return (
                      <button
                        key={anim.id}
                        onClick={() => {
                          onTogglePoseMode?.(false);
                          setActiveAnimation(anim.id);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                          isSelected
                            ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-300/50'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                        }`}
                        title={anim.description}
                      >
                        <span>{anim.icon}</span>
                        <span>{anim.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* Row 2: Shading Modes & Export */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-slate-800/80 shrink-0">
            {/* Shaders */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Shader :</span>
              <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setMaterialMode('pbr')}
                  className={`px-2 py-1 rounded transition-colors ${
                    materialMode === 'pbr' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  PBR Studio
                </button>
                <button
                  onClick={() => setMaterialMode('toon')}
                  className={`px-2 py-1 rounded transition-colors ${
                    materialMode === 'toon' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Toon / Anime
                </button>
                <button
                  onClick={() => setMaterialMode('normal')}
                  className={`px-2 py-1 rounded transition-colors ${
                    materialMode === 'normal' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Normales
                </button>
                <button
                  onClick={() => setMaterialMode('clay')}
                  className={`px-2 py-1 rounded transition-colors ${
                    materialMode === 'clay' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Clay Argile
                </button>
              </div>
            </div>

            {/* Wireframe & Auto-Rotate */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWireframe(!wireframe)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded border transition-colors ${
                  wireframe
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Fil de fer</span>
              </button>

              <button
                onClick={() => setAutoRotate(!autoRotate)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded border transition-colors ${
                  autoRotate
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rotation</span>
              </button>
            </div>

            {/* 3D -> 2D Multi-Directional Spritesheet Generator (from modele.html + Bayer/Godot/Unity) */}
            <button
              onClick={() => setIsSpriteRendererOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg font-bold shadow-md transition-all text-xs ring-1 ring-sky-400/40 cursor-pointer"
              title="Convertir le modèle 3D affiché en planche de sprites 1 à 8 directions (PNG, Godot .tres, Aseprite JSON, Gamebuino RGB565)"
            >
              <Film className="w-3.5 h-3.5" />
              <span>🎞️ Sprites 3D → 2D</span>
            </button>

            {/* Export Clean 3D GLB (Zero Subscription) */}
            <button
              onClick={exportGLB}
              disabled={isExportingGlb}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-bold shadow-md shadow-emerald-950/40 transition-all text-xs ring-1 ring-emerald-400/40 cursor-pointer disabled:opacity-50"
              title="Télécharger directement le modèle 3D propre au format standard binaire .GLB (sans aucun abonnement requis)"
            >
              <Download className={`w-3.5 h-3.5 ${isExportingGlb ? 'animate-bounce' : ''}`} />
              <span>{isExportingGlb ? 'Génération GLB...' : '📦 Exporter en GLB (.glb)'}</span>
            </button>

            {/* Export 3D Wavefront OBJ */}
            <button
              onClick={exportOBJ}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg font-medium shadow-sm transition-colors text-xs"
              title="Exporter au format Wavefront .OBJ"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>OBJ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified 3D -> 2D Spritesheet Renderer Modal */}
      <Sprite3DRendererModal
        isOpen={isSpriteRendererOpen}
        onClose={() => setIsSpriteRendererOpen(false)}
        targetGroup={
          displayMode === 'reconstructed'
            ? reconstructedGroupRef.current
            : displayMode === 'real_mesh'
            ? realModelGroupRef.current
            : internalMode === 'prop'
            ? propGroupRef.current
            : internalMode === 'diorama'
            ? dioramaGroupRef.current
            : characterGroupRef.current
        }
        sourceLabel={
          displayMode === 'reconstructed'
            ? 'Vrai Perso 3D Sculpté HD'
            : displayMode === 'real_mesh'
            ? realModelStats?.fileName || 'Modèle .GLB/.FBX'
            : internalMode === 'prop'
            ? 'Objet 3D'
            : internalMode === 'diorama'
            ? 'Diorama 3D'
            : 'Mannequin Rig + Garde-Robe'
        }
        characterName={characterName}
        clips={displayMode === 'real_mesh' ? loadedClips : []}
        mixer={displayMode === 'real_mesh' ? mixerRef.current : null}
        proceduralBones={displayMode === 'procedural' && internalMode === 'character' ? bonesRef.current : null}
        proceduralAnimId={activeAnimation}
        onSendSheetToWorkspace={onSendSpriteSheetToWorkspace}
      />
    </div>
  );
};

// Shading mode applicator
function applyShaderMode(mesh: THREE.Mesh, mode: 'pbr' | 'toon' | 'normal' | 'clay', wireframe: boolean) {
  if (!mesh.userData.originalMaterial) {
    mesh.userData.originalMaterial = mesh.material;
  }

  if (mode === 'normal') {
    mesh.material = new THREE.MeshNormalMaterial({ wireframe });
  } else if (mode === 'clay') {
    mesh.material = new THREE.MeshStandardMaterial({
      color: 0xd9c5b2,
      roughness: 0.85,
      metalness: 0.05,
      wireframe,
    });
  } else {
    mesh.material = mesh.userData.originalMaterial;
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => {
        if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
      });
    } else if (mesh.material && 'wireframe' in mesh.material) {
      (mesh.material as THREE.MeshStandardMaterial).wireframe = wireframe;
    }
  }
}

// Builds the Sculpted Anatomical Humanoid Base Body with organic proportions
function buildAnatomicalBaseBody(
  group: THREE.Group,
  skelGroup: THREE.Group,
  bones: CharacterRigBones,
  proportions: AnatomicalProportions = DEFAULT_PROPORTIONS,
  style: 'studio' | 'skin' | 'wireframe' = 'studio',
  frontTexture?: THREE.Texture | null
) {
  // Clear any existing body meshes from group
  const toRemove: THREE.Object3D[] = [];
  group.children.forEach((c) => {
    if (
      c.name === 'TorsoBase' ||
      c.name === 'HeadBase' ||
      c.name.includes('Arm') ||
      c.name.includes('Leg') ||
      c.name.includes('Foot') ||
      c.name.includes('Briefs') ||
      c.name.includes('Assembly')
    ) {
      toRemove.push(c);
    }
  });
  toRemove.forEach((c) => group.remove(c));

  // Clear previous skeleton visualization
  while (skelGroup.children.length > 0) {
    skelGroup.remove(skelGroup.children[0]);
  }

  const p = proportions;
  const skinColor = style === 'studio' ? 0xe2e8f0 : 0xe8d7c3;
  const undergarmentColor = 0x1e293b;

  const sculpted = createSculptedHumanoidMeshes(p, skinColor, undergarmentColor, frontTexture);

  // 1. Torso
  const torso = sculpted.torsoGroup as unknown as THREE.Mesh;
  torso.name = 'TorsoBase';
  const torsoBaseY = p.legLength + p.torsoHeight * 0.42;
  torso.position.set(0, torsoBaseY, 0);
  torso.userData.baseY = torsoBaseY;
  group.add(torso);
  bones.torso = torso;

  // Mounts on Torso
  const armorMount = new THREE.Group();
  armorMount.name = 'ArmorMount';
  torso.add(armorMount);
  bones.armorMount = armorMount;

  const beltMount = new THREE.Group();
  beltMount.name = 'BeltMount';
  beltMount.position.set(0, -0.15, 0);
  torso.add(beltMount);
  bones.beltMount = beltMount;

  const cloakMount = new THREE.Group();
  cloakMount.name = 'CloakMount';
  cloakMount.position.set(0, 0.15, -0.16);
  torso.add(cloakMount);
  bones.cloakMount = cloakMount;

  // 2. Head
  const head = sculpted.headGroup as unknown as THREE.Mesh;
  head.name = 'HeadBase';
  const headBaseY = torsoBaseY + p.torsoHeight * 0.52 + 0.16 * p.headScale;
  head.position.set(0, headBaseY, 0);
  head.userData.baseY = headBaseY;
  group.add(head);
  bones.head = head;

  const hairMount = new THREE.Group();
  hairMount.name = 'HairMount';
  head.add(hairMount);
  bones.hairMount = hairMount;

  const eyewearMount = new THREE.Group();
  eyewearMount.name = 'EyewearMount';
  head.add(eyewearMount);
  bones.eyewearMount = eyewearMount;

  // 3. Arms (with articulated elbow & hand pivots)
  const armL = sculpted.armL.armGroup as unknown as THREE.Mesh;
  const armR = sculpted.armR.armGroup as unknown as THREE.Mesh;
  const shoulderY = torsoBaseY + p.torsoHeight * 0.32;
  const shoulderX = p.shoulderWidth * 0.52;

  armL.position.set(-shoulderX, shoulderY, 0);
  armL.userData.baseX = shoulderX;
  armL.userData.baseY = shoulderY;
  armL.rotation.z = p.armPoseAngle;
  group.add(armL);
  bones.armLeft = armL;
  bones.elbowLeft = sculpted.armL.elbowGroup;
  bones.handLeft = sculpted.armL.handGroup;

  armR.position.set(shoulderX, shoulderY, 0);
  armR.userData.baseX = shoulderX;
  armR.userData.baseY = shoulderY;
  armR.rotation.z = -p.armPoseAngle;
  group.add(armR);
  bones.armRight = armR;
  bones.elbowRight = sculpted.armR.elbowGroup;
  bones.handRight = sculpted.armR.handGroup;

  const glovesLeftMount = new THREE.Group();
  glovesLeftMount.name = 'GlovesLeftMount';
  sculpted.armL.handGroup.add(glovesLeftMount);
  bones.glovesLeftMount = glovesLeftMount;

  const glovesRightMount = new THREE.Group();
  glovesRightMount.name = 'GlovesRightMount';
  sculpted.armR.handGroup.add(glovesRightMount);
  bones.glovesRightMount = glovesRightMount;

  const weaponMount = new THREE.Group();
  weaponMount.name = 'WeaponMount';
  weaponMount.position.set(0, -0.04, 0.08);
  sculpted.armR.handGroup.add(weaponMount);
  bones.weaponMount = weaponMount;

  // 4. Legs (with articulated knee & foot pivots)
  const legL = sculpted.legL.legGroup as unknown as THREE.Mesh;
  const legR = sculpted.legR.legGroup as unknown as THREE.Mesh;
  const hipX = p.hipWidth * 0.38;
  const hipY = p.legLength * 0.98;

  legL.position.set(-hipX, hipY, 0);
  legL.userData.baseX = hipX;
  legL.userData.baseY = hipY;
  group.add(legL);
  bones.legLeft = legL;
  bones.kneeLeft = sculpted.legL.kneeGroup;

  legR.position.set(hipX, hipY, 0);
  legR.userData.baseX = hipX;
  legR.userData.baseY = hipY;
  group.add(legR);
  bones.legRight = legR;
  bones.kneeRight = sculpted.legR.kneeGroup;

  // Feet
  bones.footLeft = sculpted.legL.footGroup as unknown as THREE.Mesh;
  bones.footRight = sculpted.legR.footGroup as unknown as THREE.Mesh;

  // Wireframe style support
  if (style === 'wireframe') {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if ('wireframe' in m) m.wireframe = true;
          });
        } else if ('wireframe' in mat) {
          (mat as THREE.MeshStandardMaterial).wireframe = true;
        }
      }
    });
  }

  // 5. Dynamic Live Skeleton Rig visualizer (16 joints + 15 bone segments updated in real time)
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const ptsMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.065, sizeAttenuation: true });
  const ptsObj = new THREE.Points(ptsGeo, ptsMat);
  ptsObj.name = 'SkeletonDynamicJoints';
  ptsObj.frustumCulled = false;
  skelGroup.add(ptsObj);

  const linesGeo = new THREE.BufferGeometry();
  linesGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
  const linesMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.9 });
  const lineSegments = new THREE.LineSegments(linesGeo, linesMat);
  lineSegments.name = 'SkeletonDynamicLines';
  lineSegments.frustumCulled = false;
  skelGroup.add(lineSegments);
}

// Dynamically attaches/updates the 3D meshes for each equipped wardrobe slot
function updateWardrobeMeshes(
  bones: CharacterRigBones,
  wardrobe: CharacterWardrobeState,
  customWardrobeItems: WardrobeItem[] = [],
  customEquippedProp?: THREE.Group | null
) {
  // Clear previous slot attachments
  if (bones.hairMount) bones.hairMount.clear();
  if (bones.eyewearMount) bones.eyewearMount.clear();
  if (bones.armorMount) bones.armorMount.clear();
  if (bones.beltMount) bones.beltMount.clear();
  if (bones.glovesLeftMount) bones.glovesLeftMount.clear();
  if (bones.glovesRightMount) bones.glovesRightMount.clear();
  if (bones.weaponMount) bones.weaponMount.clear();
  if (bones.cloakMount) bones.cloakMount.clear();

  // Remove existing footwear if any
  bones.footLeft?.parent?.getObjectByName('FootwearLeft')?.removeFromParent();
  bones.footRight?.parent?.getObjectByName('FootwearRight')?.removeFromParent();

  // 1. HAIR SLOT
  if (wardrobe.hair && bones.hairMount) {
    if (wardrobe.hair === 'hair_spiky_bandeau') {
      // Meshy / Shonen anime spiky hair + blue headband
      const hairMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.65 });
      // Hair crown spikes
      for (let i = 0; i < 9; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.06, 0.22, 5);
        const spike = new THREE.Mesh(spikeGeo, hairMat);
        const angle = (i / 9) * Math.PI * 1.8 - Math.PI * 0.9;
        spike.position.set(Math.sin(angle) * 0.14, 0.14 + Math.cos(angle) * 0.05, Math.cos(angle) * 0.08);
        spike.rotation.z = -angle * 0.55;
        spike.rotation.x = 0.2;
        bones.hairMount.add(spike);
      }
      // Top spike clump
      const topSpikeGeo = new THREE.ConeGeometry(0.08, 0.26, 6);
      const topSpike = new THREE.Mesh(topSpikeGeo, hairMat);
      topSpike.position.set(0, 0.22, 0);
      bones.hairMount.add(topSpike);

      // Blue headband ring around forehead
      const headbandMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
      const bandGeo = new THREE.TorusGeometry(0.162, 0.024, 8, 24);
      const band = new THREE.Mesh(bandGeo, headbandMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.04, 0);
      bones.hairMount.add(band);

      // Rear knot and hanging ribbon tails
      const knotGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const knot = new THREE.Mesh(knotGeo, headbandMat);
      knot.position.set(0, 0.04, -0.165);
      bones.hairMount.add(knot);

      const ribbonMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, side: THREE.DoubleSide });
      const ribbonGeo = new THREE.PlaneGeometry(0.04, 0.28);
      const ribbon1 = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon1.position.set(-0.03, -0.1, -0.17);
      ribbon1.rotation.z = 0.2;
      ribbon1.rotation.y = 0.1;
      const ribbon2 = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon2.position.set(0.03, -0.09, -0.17);
      ribbon2.rotation.z = -0.3;
      ribbon2.rotation.y = -0.1;
      bones.hairMount.add(ribbon1, ribbon2);
    } else if (wardrobe.hair === 'hair_braids') {
      const braidMat = new THREE.MeshStandardMaterial({ color: 0xd4d8dd, roughness: 0.7 });
      const braidGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.45, 8);
      const bL = new THREE.Mesh(braidGeo, braidMat);
      bL.position.set(-0.16, -0.12, 0.05);
      bL.rotation.z = 0.15;
      const bR = new THREE.Mesh(braidGeo, braidMat);
      bR.position.set(0.16, -0.12, 0.05);
      bR.rotation.z = -0.15;
      bones.hairMount.add(bL, bR);
    } else if (wardrobe.hair === 'hair_warrior_short') {
      const shortMat = new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.8 });
      const capGeo = new THREE.SphereGeometry(0.165, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.Mesh(capGeo, shortMat);
      cap.position.y = 0.01;
      bones.hairMount.add(cap);
    } else if (wardrobe.hair === 'hair_anime_spiky') {
      const spikyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 });
      for (let i = 0; i < 7; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.05, 0.18, 5);
        const spike = new THREE.Mesh(spikeGeo, spikyMat);
        const angle = (i / 7) * Math.PI * 1.6 - Math.PI * 0.8;
        spike.position.set(Math.sin(angle) * 0.14, 0.14 + Math.cos(angle) * 0.04, Math.cos(angle) * 0.08);
        spike.rotation.z = -angle * 0.6;
        bones.hairMount.add(spike);
      }
    } else if (wardrobe.hair === 'hair_viking_bun') {
      const bunMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 });
      const bunGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const bun = new THREE.Mesh(bunGeo, bunMat);
      bun.position.set(0, 0.18, -0.06);
      bones.hairMount.add(bun);
    } else {
      // User custom extracted hair piece
      const customItem = customWardrobeItems.find((i) => i.id === wardrobe.hair);
      if (customItem) {
        const hairMat = new THREE.MeshStandardMaterial({ color: customItem.color || 0x1e293b, roughness: 0.6 });
        const capGeo = new THREE.SphereGeometry(0.17, 12, 12);
        const cap = new THREE.Mesh(capGeo, hairMat);
        cap.position.y = 0.02;
        bones.hairMount.add(cap);
      }
    }
  }

  // 2. EYEWEAR SLOT
  if (wardrobe.eyewear && bones.eyewearMount) {
    if (wardrobe.eyewear === 'eyewear_cyber_visor') {
      const visorGeo = new THREE.BoxGeometry(0.24, 0.06, 0.08);
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.6,
        roughness: 0.1,
      });
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.02, 0.14);
      bones.eyewearMount.add(visor);
    } else if (wardrobe.eyewear === 'eyewear_aviator') {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.2 });
      const frameGeo = new THREE.TorusGeometry(0.04, 0.01, 8, 16);
      const leftLens = new THREE.Mesh(frameGeo, glassMat);
      leftLens.position.set(-0.06, 0.02, 0.15);
      const rightLens = new THREE.Mesh(frameGeo, glassMat);
      rightLens.position.set(0.06, 0.02, 0.15);
      bones.eyewearMount.add(leftLens, rightLens);
    } else if (wardrobe.eyewear === 'eyewear_monocle') {
      const monoMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9 });
      const monoGeo = new THREE.TorusGeometry(0.045, 0.008, 8, 16);
      const monocle = new THREE.Mesh(monoGeo, monoMat);
      monocle.position.set(0.06, 0.02, 0.15);
      bones.eyewearMount.add(monocle);
    }
  }

  // 3. ARMOR & CLOTHING SLOT (Kimonos, Haori, Cuirass, Robes)
  if (bones.armorMount) {
    if (wardrobe.clothing === 'clothing_karate_gi') {
      // White karate dogi with crossed collar
      const giMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.75 });
      const giGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.48, 14);
      const gi = new THREE.Mesh(giGeo, giMat);
      gi.position.y = 0.01;
      bones.armorMount.add(gi);

      // Folded V-lapels on chest
      const lapelGeo = new THREE.BoxGeometry(0.05, 0.25, 0.03);
      const lapelL = new THREE.Mesh(lapelGeo, giMat);
      lapelL.position.set(-0.06, 0.08, 0.15);
      lapelL.rotation.z = -0.4;
      const lapelR = new THREE.Mesh(lapelGeo, giMat);
      lapelR.position.set(0.06, 0.08, 0.15);
      lapelR.rotation.z = 0.4;
      bones.armorMount.add(lapelL, lapelR);

      // Flared sleeves
      if (bones.armLeft && bones.armRight) {
        const sleeveGeo = new THREE.CylinderGeometry(0.085, 0.07, 0.20, 10);
        const sL = new THREE.Mesh(sleeveGeo, giMat);
        sL.position.set(0, 0.05, 0);
        const sR = new THREE.Mesh(sleeveGeo, giMat);
        sR.position.set(0, 0.05, 0);
        bones.armorMount.add(sL, sR);
      }
    } else if (wardrobe.clothing === 'clothing_kimono') {
      const kimonoMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.65 });
      const kimonoGeo = new THREE.CylinderGeometry(0.25, 0.32, 0.58, 14);
      const kimono = new THREE.Mesh(kimonoGeo, kimonoMat);
      kimono.position.y = -0.04;
      bones.armorMount.add(kimono);
    } else if (wardrobe.clothing === 'clothing_haori') {
      const haoriMat = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.7 });
      const haoriGeo = new THREE.CylinderGeometry(0.26, 0.33, 0.52, 14);
      const haori = new THREE.Mesh(haoriGeo, haoriMat);
      haori.position.y = 0;
      bones.armorMount.add(haori);
    } else if (wardrobe.armor === 'armor_leather_cuirass') {
      const cuirassGeo = new THREE.CylinderGeometry(0.25, 0.22, 0.44, 14);
      const cuirassMat = new THREE.MeshStandardMaterial({ color: 0x5a3e2b, roughness: 0.65, metalness: 0.25 });
      const cuirass = new THREE.Mesh(cuirassGeo, cuirassMat);
      cuirass.position.y = 0.02;
      bones.armorMount.add(cuirass);

      const pauldronGeo = new THREE.SphereGeometry(0.12, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const pauldronMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.8, roughness: 0.3 });
      const pauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
      pauldron.position.set(-0.28, 0.18, 0);
      pauldron.rotation.z = -Math.PI / 4;
      bones.armorMount.add(pauldron);
    } else if (wardrobe.armor === 'armor_steel_plate') {
      const plateGeo = new THREE.CylinderGeometry(0.26, 0.23, 0.48, 14);
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.92, roughness: 0.18 });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.y = 0.02;
      bones.armorMount.add(plate);
    } else if (wardrobe.clothing === 'clothing_linen_tunic') {
      const tunicGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.52, 14);
      const tunicMat = new THREE.MeshStandardMaterial({ color: 0xd6c7b2, roughness: 0.9 });
      const tunic = new THREE.Mesh(tunicGeo, tunicMat);
      tunic.position.y = -0.02;
      bones.armorMount.add(tunic);
    } else if (wardrobe.clothing === 'clothing_mage_robe') {
      const robeGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.65, 14);
      const robeMat = new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.7 });
      const robe = new THREE.Mesh(robeGeo, robeMat);
      robe.position.y = -0.1;
      bones.armorMount.add(robe);
    }
  }

  // 4. BELT SLOT (Ceintures & Obi)
  if (wardrobe.belt && bones.beltMount) {
    if (wardrobe.belt === 'belt_black_obi') {
      // Black martial arts obi with front knot and hanging straps
      const obiMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
      const obiBandGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.09, 16);
      const obiBand = new THREE.Mesh(obiBandGeo, obiMat);
      bones.beltMount.add(obiBand);

      const knotGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const knot = new THREE.Mesh(knotGeo, obiMat);
      knot.position.set(0, 0, 0.19);
      bones.beltMount.add(knot);

      const strapGeo = new THREE.BoxGeometry(0.04, 0.24, 0.015);
      const strap1 = new THREE.Mesh(strapGeo, obiMat);
      strap1.position.set(-0.025, -0.12, 0.195);
      strap1.rotation.z = 0.1;
      const strap2 = new THREE.Mesh(strapGeo, obiMat);
      strap2.position.set(0.025, -0.11, 0.195);
      strap2.rotation.z = -0.15;
      bones.beltMount.add(strap1, strap2);
    } else if (wardrobe.belt === 'belt_obi_red') {
      const obiMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
      const obiBandGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
      const obiBand = new THREE.Mesh(obiBandGeo, obiMat);
      bones.beltMount.add(obiBand);

      // Rear obi bow knot
      const bowGeo = new THREE.BoxGeometry(0.18, 0.10, 0.06);
      const bow = new THREE.Mesh(bowGeo, obiMat);
      bow.position.set(0, 0, -0.21);
      bones.beltMount.add(bow);
    } else if (wardrobe.belt === 'belt_obi_gold') {
      const obiMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.4, roughness: 0.4 });
      const obiBandGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
      const obiBand = new THREE.Mesh(obiBandGeo, obiMat);
      bones.beltMount.add(obiBand);
    } else if (wardrobe.belt === 'belt_leather') {
      const leatherMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
      const beltGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.06, 16);
      const belt = new THREE.Mesh(beltGeo, leatherMat);
      bones.beltMount.add(belt);

      // Buckle
      const buckleMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85 });
      const buckleGeo = new THREE.BoxGeometry(0.06, 0.07, 0.02);
      const buckle = new THREE.Mesh(buckleGeo, buckleMat);
      buckle.position.set(0, 0, 0.19);
      bones.beltMount.add(buckle);
    }
  }

  // 5. GLOVES SLOT (Gants, Mitaines & Gantelets)
  if (wardrobe.gloves) {
    if (wardrobe.gloves === 'gloves_sparring_blue' && bones.glovesLeftMount && bones.glovesRightMount) {
      const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
      const fistGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const fL = new THREE.Mesh(fistGeo, gloveMat);
      bones.glovesLeftMount.add(fL);
      const fR = new THREE.Mesh(fistGeo, gloveMat);
      bones.glovesRightMount.add(fR);

      // Wrist strap
      const strapGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 10);
      const strapMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8 });
      const sL = new THREE.Mesh(strapGeo, strapMat);
      sL.position.y = 0.06;
      bones.glovesLeftMount.add(sL);
      const sR = new THREE.Mesh(strapGeo, strapMat);
      sR.position.y = 0.06;
      bones.glovesRightMount.add(sR);
    } else if (wardrobe.gloves === 'gloves_leather' && bones.glovesLeftMount && bones.glovesRightMount) {
      const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.7 });
      const cuffGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10);
      const cL = new THREE.Mesh(cuffGeo, gloveMat);
      bones.glovesLeftMount.add(cL);
      const cR = new THREE.Mesh(cuffGeo, gloveMat);
      bones.glovesRightMount.add(cR);
    } else if (wardrobe.gloves === 'gloves_steel_gauntlets' && bones.glovesLeftMount && bones.glovesRightMount) {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
      const gauntletGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.16, 10);
      const gL = new THREE.Mesh(gauntletGeo, steelMat);
      bones.glovesLeftMount.add(gL);
      const gR = new THREE.Mesh(gauntletGeo, steelMat);
      bones.glovesRightMount.add(gR);
    }
  }

  // 6. FOOTWEAR SLOT (Bottes, Sandales, Geta, Baskets)
  const footParent = bones.footLeft?.parent;
  if (footParent) {
    if (wardrobe.footwear === 'footwear_martial_sneakers') {
      const upperMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
      const soleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
      const upperGeo = new THREE.BoxGeometry(0.12, 0.10, 0.22);
      const soleGeo = new THREE.BoxGeometry(0.125, 0.03, 0.23);

      const bL = new THREE.Group();
      bL.name = 'FootwearLeft';
      bL.position.set(-0.13, 0.05, 0.03);
      const upL = new THREE.Mesh(upperGeo, upperMat);
      const soL = new THREE.Mesh(soleGeo, soleMat);
      soL.position.y = -0.04;
      bL.add(upL, soL);

      const bR = new THREE.Group();
      bR.name = 'FootwearRight';
      bR.position.set(0.13, 0.05, 0.03);
      const upR = new THREE.Mesh(upperGeo, upperMat);
      const soR = new THREE.Mesh(soleGeo, soleMat);
      soR.position.y = -0.04;
      bR.add(upR, soR);

      footParent.add(bL, bR);
    } else if (wardrobe.footwear === 'footwear_geta') {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
      const strapMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
      const platGeo = new THREE.BoxGeometry(0.12, 0.035, 0.22);
      const toothGeo = new THREE.BoxGeometry(0.11, 0.06, 0.02);

      const gL = new THREE.Group();
      gL.name = 'FootwearLeft';
      gL.position.set(-0.13, 0.06, 0.03);
      const pL = new THREE.Mesh(platGeo, woodMat);
      const tL1 = new THREE.Mesh(toothGeo, woodMat);
      tL1.position.set(0, -0.045, -0.05);
      const tL2 = new THREE.Mesh(toothGeo, woodMat);
      tL2.position.set(0, -0.045, 0.05);
      gL.add(pL, tL1, tL2);

      const gR = new THREE.Group();
      gR.name = 'FootwearRight';
      gR.position.set(0.13, 0.06, 0.03);
      const pR = new THREE.Mesh(platGeo, woodMat);
      const tR1 = new THREE.Mesh(toothGeo, woodMat);
      tR1.position.set(0, -0.045, -0.05);
      const tR2 = new THREE.Mesh(toothGeo, woodMat);
      tR2.position.set(0, -0.045, 0.05);
      gR.add(pR, tR1, tR2);

      footParent.add(gL, gR);
    } else if (wardrobe.footwear === 'footwear_reinforced_boots') {
      const bootMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.7, metalness: 0.2 });
      const bootGeo = new THREE.BoxGeometry(0.12, 0.32, 0.20);
      const bL = new THREE.Mesh(bootGeo, bootMat);
      bL.name = 'FootwearLeft';
      bL.position.set(-0.13, 0.16, 0.03);
      const bR = new THREE.Mesh(bootGeo, bootMat);
      bR.name = 'FootwearRight';
      bR.position.set(0.13, 0.16, 0.03);
      footParent.add(bL, bR);
    } else if (wardrobe.footwear === 'footwear_knight_boots') {
      const knightMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
      const bootGeo = new THREE.BoxGeometry(0.13, 0.34, 0.21);
      const bL = new THREE.Mesh(bootGeo, knightMat);
      bL.name = 'FootwearLeft';
      bL.position.set(-0.13, 0.16, 0.03);
      const bR = new THREE.Mesh(bootGeo, knightMat);
      bR.name = 'FootwearRight';
      bR.position.set(0.13, 0.16, 0.03);
      footParent.add(bL, bR);
    } else if (wardrobe.footwear === 'footwear_gladiator_sandals') {
      const sandalMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
      const soleGeo = new THREE.BoxGeometry(0.11, 0.03, 0.21);
      const sL = new THREE.Mesh(soleGeo, sandalMat);
      sL.name = 'FootwearLeft';
      sL.position.set(-0.13, 0.02, 0.04);
      const sR = new THREE.Mesh(soleGeo, sandalMat);
      sR.name = 'FootwearRight';
      sR.position.set(0.13, 0.02, 0.04);
      footParent.add(sL, sR);
    } else if (wardrobe.footwear === 'footwear_leather_shoes') {
      const shoeMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 });
      const shoeGeo = new THREE.BoxGeometry(0.11, 0.12, 0.20);
      const sL = new THREE.Mesh(shoeGeo, shoeMat);
      sL.name = 'FootwearLeft';
      sL.position.set(-0.13, 0.06, 0.03);
      const sR = new THREE.Mesh(shoeGeo, shoeMat);
      sR.name = 'FootwearRight';
      sR.position.set(0.13, 0.06, 0.03);
      footParent.add(sL, sR);
    }
  }

  // 7. WEAPON SLOT (Katana, Épée, Bouclier)
  if (wardrobe.weapon && bones.weaponMount) {
    if (wardrobe.weapon === 'weapon_katana') {
      const bladeGeo = new THREE.BoxGeometry(0.04, 0.85, 0.012);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.40;
      blade.rotation.z = 0.05;

      const tsubaMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8 });
      const tsubaGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16);
      const tsuba = new THREE.Mesh(tsubaGeo, tsubaMat);
      tsuba.position.y = -0.02;

      const tsukaMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
      const tsukaGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10);
      const tsuka = new THREE.Mesh(tsukaGeo, tsukaMat);
      tsuka.position.y = -0.13;

      bones.weaponMount.add(blade, tsuba, tsuka);
    } else if (wardrobe.weapon === 'weapon_runic_sword') {
      const bladeGeo = new THREE.BoxGeometry(0.06, 0.75, 0.015);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.9, roughness: 0.2 });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.35;
      blade.castShadow = true;

      const guardGeo = new THREE.BoxGeometry(0.20, 0.03, 0.04);
      const guardMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, metalness: 0.6, roughness: 0.4 });
      const guard = new THREE.Mesh(guardGeo, guardMat);
      guard.position.y = -0.02;

      bones.weaponMount.add(blade, guard);
    } else if (wardrobe.weapon === 'weapon_viking_shield') {
      const shieldGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20);
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.rotation.z = Math.PI / 2;
      shield.position.set(-0.05, 0.1, 0);

      const umboGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const umboMat = new THREE.MeshStandardMaterial({ color: 0xa3a8b0, metalness: 0.9 });
      const umbo = new THREE.Mesh(umboGeo, umboMat);
      umbo.position.set(0, 0.02, 0);
      shield.add(umbo);

      bones.weaponMount.add(shield);
    }
  }

  // 8. CLOAK SLOT
  if (wardrobe.cloak && bones.cloakMount) {
    if (wardrobe.cloak === 'cloak_forest') {
      const cloakGeo = new THREE.PlaneGeometry(0.55, 0.85);
      const cloakMat = new THREE.MeshStandardMaterial({ color: 0x243b2c, roughness: 0.9, side: THREE.DoubleSide });
      const cloak = new THREE.Mesh(cloakGeo, cloakMat);
      cloak.position.set(0, -0.3, 0);
      cloak.rotation.x = -0.08;
      cloak.castShadow = true;
      bones.cloakMount.add(cloak);
    } else if (wardrobe.cloak === 'cloak_fur') {
      const furGeo = new THREE.BoxGeometry(0.58, 0.25, 0.22);
      const furMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 });
      const fur = new THREE.Mesh(furGeo, furMat);
      fur.position.set(0, -0.05, 0);
      bones.cloakMount.add(fur);
    }
  }

  // 9. CUSTOM FORGED 3D PROP ATTACHED TO RIGHT HAND
  if (customEquippedProp && bones.weaponMount) {
    const cloned = customEquippedProp.clone();
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    const targetScale = 0.72 / maxDim;
    cloned.scale.setScalar(targetScale);
    cloned.position.set(0, 0.12, 0.08);
    cloned.rotation.x = Math.PI / 4;
    bones.weaponMount.add(cloned);
  }
}

// Skeletal Pose Animator
function updateSkeletalAnimation(
  bones: CharacterRigBones,
  pose: RigAnimationPose,
  time: number
) {
  if (pose === 'a_pose') {
    if (bones.armLeft) {
      bones.armLeft.rotation.z = 0.55;
      bones.armLeft.rotation.x = 0;
    }
    if (bones.armRight) {
      bones.armRight.rotation.z = -0.55;
      bones.armRight.rotation.x = 0;
    }
    if (bones.legLeft) bones.legLeft.rotation.x = 0;
    if (bones.legRight) bones.legRight.rotation.x = 0;
    if (bones.torso) bones.torso.position.y = 1.05;
  } else if (pose === 't_pose') {
    if (bones.armLeft) {
      bones.armLeft.rotation.z = Math.PI / 2;
      bones.armLeft.rotation.x = 0;
    }
    if (bones.armRight) {
      bones.armRight.rotation.z = -Math.PI / 2;
      bones.armRight.rotation.x = 0;
    }
    if (bones.legLeft) bones.legLeft.rotation.x = 0;
    if (bones.legRight) bones.legRight.rotation.x = 0;
    if (bones.torso) bones.torso.position.y = 1.05;
  } else if (pose === 'idle') {
    const breath = Math.sin(time * 2.2) * 0.02;
    if (bones.torso) bones.torso.position.y = 1.05 + breath;
    if (bones.head) bones.head.position.y = 1.48 + breath * 0.6;
    if (bones.armLeft) bones.armLeft.rotation.z = 0.2 + Math.sin(time * 2.2) * 0.03;
    if (bones.armRight) bones.armRight.rotation.x = -0.3 + Math.sin(time * 2.2) * 0.03;
    if (bones.cloakMount) bones.cloakMount.rotation.x = Math.sin(time * 3) * 0.04;
  } else if (pose === 'walk') {
    const stride = Math.sin(time * 5);
    if (bones.legLeft) bones.legLeft.rotation.x = stride * 0.5;
    if (bones.legRight) bones.legRight.rotation.x = -stride * 0.5;
    if (bones.armLeft) bones.armLeft.rotation.x = -stride * 0.4;
    if (bones.armRight) bones.armRight.rotation.x = stride * 0.4;
    if (bones.torso) bones.torso.position.y = 1.05 + Math.abs(Math.cos(time * 5)) * 0.04;
  } else if (pose === 'attack') {
    const attackPhase = Math.sin(time * 4);
    if (bones.armRight) bones.armRight.rotation.x = -0.8 + attackPhase * 0.6;
    if (bones.weaponMount) {
      bones.weaponMount.rotation.x = 0.5 + attackPhase * 0.8;
      bones.weaponMount.rotation.z = attackPhase * 0.3;
    }
  }
}

// Builds 3D Prop Model
function buildPropModel(group: THREE.Group) {
  const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.2, 24);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.5,
    roughness: 0.4,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = 0.1;
  group.add(pedestal);

  const sword = new THREE.Group();
  sword.position.set(0, 1.1, 0);

  const bladeGeo = new THREE.BoxGeometry(0.12, 1.3, 0.025);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xc4c9d4,
    metalness: 0.95,
    roughness: 0.15,
  });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.castShadow = true;
  sword.add(blade);

  const guardGeo = new THREE.BoxGeometry(0.4, 0.05, 0.06);
  const guardMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.85,
    roughness: 0.3,
  });
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.y = -0.65;
  sword.add(guard);

  const hiltGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12);
  const hiltMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.8 });
  const hilt = new THREE.Mesh(hiltGeo, hiltMat);
  hilt.position.y = -0.8;
  sword.add(hilt);

  group.add(sword);
}

// Builds 3D Diorama Stage
function buildDioramaStage(group: THREE.Group) {
  const baseGeo = new THREE.BoxGeometry(2.4, 0.15, 2.0);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.05;
  group.add(base);

  const wallGeo = new THREE.PlaneGeometry(2.4, 1.4);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 0.8, -0.95);
  group.add(wall);

  const trunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.4, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
  const foliageGeo = new THREE.ConeGeometry(0.25, 0.6, 8);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 });

  [
    [-0.8, 0, -0.5],
    [0.7, 0, -0.4],
  ].forEach(([x, y, z]) => {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.3, z);
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.set(x, 0.65, z);
    group.add(trunk);
    group.add(foliage);
  });
}
