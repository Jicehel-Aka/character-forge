import * as THREE from 'three';
import { MultiViewAngle } from '../types/wardrobe';

export interface VisualHullParams {
  views: Partial<Record<MultiViewAngle, string | null>>;
  resolutionY?: number;
  radialSegments?: number;
  depthRatio?: number;
  smoothNormals?: boolean;
}

export interface Reconstructed3DResult {
  mesh: THREE.Object3D;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  vertexCount: number;
  triangleCount: number;
  atlasDataUrl: string;
  exportObj: (characterName?: string) => string;
  exportGlbBlob: () => Promise<Blob>;
}

/**
 * Exports any Three.js Object3D into a binary .GLB Blob
 */
export async function exportObjectToGLBBlob(object: THREE.Object3D): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          resolve(new Blob([gltf], { type: 'model/gltf-binary' }));
        } else {
          // If JSON returned for some reason, convert
          const str = JSON.stringify(gltf);
          resolve(new Blob([str], { type: 'application/json' }));
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });
}

/**
 * Performs true multi-view 3D character mesh reconstruction directly from the user's fixed photos
 * using anisotropic 2D SDF carving, Surface Nets smoothing, and seamless multi-view color blending
 * (no hardcoded mannequin primitives or faceted UV patches).
 */
export async function reconstructCharacter3DMesh(params: VisualHullParams): Promise<Reconstructed3DResult> {
  const { reconstructTrueCharacterFromViews } = await import('./trueMultiView3D');
  return reconstructTrueCharacterFromViews({
    views: params.views,
    characterName: 'Personnage_3D_Sculpte',
    gridY: Math.max(108, Math.min(128, Math.round((params.resolutionY || 64) * 1.85))),
    smoothPasses: params.smoothNormals === false ? 0 : 2,
  });
}

