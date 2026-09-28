/**
 * Domain types for 3D Model Splitting & Inlays
 */
import * as THREE from 'three';

export type ToolMode = 'rotate' | 'marker' | 'fill' | 'stamp' | 'lasso';

export type FillMode = 'flood' | 'hatch';

export type StampShape = 'circle' | 'star' | 'heart' | 'hexagon' | 'diamond' | 'flower';

export type PresetType = 'coaster' | 'badge' | 'keyfob' | 'cylinder';

export interface SplitPart {
  id: string;
  name: string;
  type: 'base' | 'inlay';
  geometry: THREE.BufferGeometry;
  color: string;
  visible: boolean;
  volume: number;
  triangleCount: number;
  normal: THREE.Vector3;
  originalPosition: THREE.Vector3;
  manifold?: any;
}

export interface ContourData {
  id: string;
  type: 'marker' | 'polygon' | 'fill_flood' | 'fill_hatch';
  points3D: THREE.Vector3[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  closed: boolean;
  strokeWidth?: number;
  fillSize?: number;
  fillAngle?: number;
  coplanarPoints?: THREE.Vector3[];
  color: string;
}

export interface SplitSettings {
  inlayDepth: number; // 0.6mm to 3.0mm, default 1.5mm
  fitTolerance: number; // 0.0mm to 0.3mm, default 0.08mm
  markerWidth: number; // 1.0mm to 8.0mm, default 2.5mm
  stampRadius: number; // 4mm to 18mm, default 8mm
  fillMode: FillMode; // 'flood' | 'hatch'
  fillSize: number; // 1.0mm to 10.0mm, default 3.0mm
  fillAngle: number; // 0 to 180 degrees, default 45°
  activeColor: string;
  explodeDistance: number; // 0mm to 40mm
  showWireframe: boolean;
}

export interface AppProgress {
  active: boolean;
  title: string;
  step: string;
  percent: number;
}
