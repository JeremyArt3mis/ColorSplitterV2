/**
 * Manifold-3D WebAssembly Computational Geometry Engine & Three.js Bridge
 * Full support for Marker ribbons, Polygon stamps, Angled Hatch Inlays,
 * Flood-fills, and Watertight CSG Boolean Inlay Solid Splitting.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import Module from 'manifold-3d';
import {
  PresetType,
  StampShape,
  ContourData
} from '../types';

let wasmInstance: any = null;
let initPromise: Promise<any> | null = null;

/**
 * Initializes the Manifold-3D WASM module
 */
export async function getManifold(onProgress?: (step: string, pct: number) => void): Promise<any> {
  if (wasmInstance) return wasmInstance;
  if (!initPromise) {
    initPromise = (async () => {
      onProgress?.('Loading Manifold WebAssembly Binary...', 15);
      const mod = await (Module as any)({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return '/manifold.wasm';
          }
          return path;
        }
      });
      onProgress?.('Initializing Manifold CSG Kernel...', 50);
      mod.setup();
      onProgress?.('WASM Kernel Ready', 100);
      wasmInstance = mod;
      return mod;
    })();
  }
  return initPromise;
}

/**
 * Welds vertices and converts Three.js BufferGeometry into a valid 2-Manifold mesh
 */
export function threeToManifold(geometry: THREE.BufferGeometry, wasm: any): any {
  const posAttr = geometry.attributes.position;
  if (!posAttr) {
    throw new Error('Geometry has no position attribute');
  }

  // Decompose into flat triangle positions
  const rawPositions: number[] = [];
  if (geometry.index) {
    const indices = geometry.index.array;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      rawPositions.push(
        posAttr.getX(idx),
        posAttr.getY(idx),
        posAttr.getZ(idx)
      );
    }
  } else {
    for (let i = 0; i < posAttr.count; i++) {
      rawPositions.push(
        posAttr.getX(i),
        posAttr.getY(i),
        posAttr.getZ(i)
      );
    }
  }

  // Spatial hashing vertex welding with high precision (0.0001 mm resolution)
  const precision = 10000;
  const vertMap = new Map<string, number>();
  const weldedPos: number[] = [];
  const triVerts: number[] = [];

  for (let i = 0; i < rawPositions.length; i += 9) {
    const triangleIndices: number[] = [];
    for (let j = 0; j < 3; j++) {
      const x = rawPositions[i + j * 3];
      const y = rawPositions[i + j * 3 + 1];
      const z = rawPositions[i + j * 3 + 2];

      const kx = Math.round(x * precision);
      const ky = Math.round(y * precision);
      const kz = Math.round(z * precision);
      const key = `${kx},${ky},${kz}`;

      let vIdx = vertMap.get(key);
      if (vIdx === undefined) {
        vIdx = weldedPos.length / 3;
        weldedPos.push(x, y, z);
        vertMap.set(key, vIdx);
      }
      triangleIndices.push(vIdx);
    }

    // Skip degenerate triangles where vertices collapse
    if (
      triangleIndices[0] !== triangleIndices[1] &&
      triangleIndices[1] !== triangleIndices[2] &&
      triangleIndices[2] !== triangleIndices[0]
    ) {
      triVerts.push(triangleIndices[0], triangleIndices[1], triangleIndices[2]);
    }
  }

  const manifoldMesh = {
    numProp: 3,
    vertProperties: new Float32Array(weldedPos),
    triVerts: new Uint32Array(triVerts)
  };

  const manifold = new wasm.Manifold(manifoldMesh);
  const status = manifold.status();
  if (status !== 'NoError' && status !== 0) {
    console.warn('Manifold status warning:', status);
  }
  return manifold;
}

/**
 * Converts a Manifold instance back into a Three.js BufferGeometry with clean creased normals
 * Prevents bumpy shading on flat surfaces while smoothing cylindrical walls.
 */
export function manifoldToThree(manifold: any, creaseAngleDeg: number = 32): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  let geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(mesh.vertProperties, 3)
  );

  geometry.setIndex(
    new THREE.BufferAttribute(mesh.triVerts, 1)
  );

  try {
    geometry = toCreasedNormals(geometry, THREE.MathUtils.degToRad(creaseAngleDeg));
  } catch (err) {
    geometry.computeVertexNormals();
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Normalizes any loaded geometry: centers (X, Z), scales to ~40mm, bottom placed at Y=0
 */
export function normalizeGeometry(geometry: THREE.BufferGeometry, targetSize: number = 40): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? targetSize / maxDim : 1;

  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const newBox = geometry.boundingBox!;
  const newCenter = new THREE.Vector3();
  newBox.getCenter(newCenter);

  geometry.translate(-newCenter.x, -newBox.min.y, -newCenter.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  try {
    geometry = toCreasedNormals(geometry, THREE.MathUtils.degToRad(35));
  } catch {
    geometry.computeVertexNormals();
  }

  return geometry;
}

/**
 * Generates solid built-in 3D model presets with high segment count for smooth surfaces
 */
export function createPresetModel(preset: PresetType, wasm: any): { manifold: any; geometry: THREE.BufferGeometry } {
  let manifold: any;

  if (preset === 'coaster') {
    // Clean smooth round coaster disc (48mm diameter, 5.5mm thickness) with 64 smooth segments
    manifold = wasm.Manifold.cylinder(5.5, 24, 24, 64);
  } else if (preset === 'badge') {
    const hexRadius = 22;
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      pts.push([Math.cos(angle) * hexRadius, Math.sin(angle) * hexRadius]);
    }
    const cs = new wasm.CrossSection([pts]);
    manifold = cs.extrude(5.0);
  } else if (preset === 'keyfob') {
    const r = 12;
    const l = 20;
    const pts: [number, number][] = [];
    const arcSegs = 24;
    for (let i = -arcSegs; i <= arcSegs; i++) {
      const th = (i / arcSegs) * (Math.PI / 2);
      pts.push([l / 2 + Math.cos(th) * r, Math.sin(th) * r]);
    }
    for (let i = arcSegs; i >= -arcSegs; i--) {
      const th = Math.PI - (i / arcSegs) * (Math.PI / 2);
      pts.push([-l / 2 + Math.cos(th) * r, Math.sin(th) * r]);
    }
    const csTag = new wasm.CrossSection([pts]);
    const tagSolid = csTag.extrude(4.5);
    const hole = wasm.Manifold.cylinder(6.0, 2.5, 2.5, 36).translate([-13, 0, -0.5]);
    manifold = wasm.Manifold.difference(tagSolid, hole);
  } else {
    manifold = wasm.Manifold.cylinder(7.0, 20, 20, 64);
  }

  manifold = manifold.rotate([90, 0, 0]);
  const bb = manifold.boundingBox();
  manifold = manifold.translate([0, -bb.min[1], 0]);

  const geometry = manifoldToThree(manifold, 35);
  return { manifold, geometry };
}

/**
 * Computes an orthonormal local tangent frame (U, V) perpendicular to surface normal N
 */
export function computeTangentBasis(normal: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const norm = normal.clone().normalize();
  const up = Math.abs(norm.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(up, norm).normalize();
  const v = new THREE.Vector3().crossVectors(norm, u).normalize();
  return { u, v };
}

/**
 * Generates closed 3D boundary points for standard geometric stamps
 */
export function generateShapeContour(
  shape: StampShape,
  center: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number
): THREE.Vector3[] {
  const { u, v } = computeTangentBasis(normal);
  const points2D: [number, number][] = [];

  if (shape === 'circle') {
    const segments = 48;
    for (let i = 0; i < segments; i++) {
      const th = (i / segments) * Math.PI * 2;
      points2D.push([Math.cos(th) * radius, Math.sin(th) * radius]);
    }
  } else if (shape === 'star') {
    const points = 5;
    const innerRadius = radius * 0.45;
    for (let i = 0; i < points * 2; i++) {
      const th = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? radius : innerRadius;
      points2D.push([Math.cos(th) * r, Math.sin(th) * r]);
    }
  } else if (shape === 'heart') {
    const segments = 40;
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const scale = radius / 18;
      points2D.push([x * scale, y * scale]);
    }
  } else if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * Math.PI * 2 - Math.PI / 6;
      points2D.push([Math.cos(th) * radius, Math.sin(th) * radius]);
    }
  } else if (shape === 'diamond') {
    points2D.push([0, radius]);
    points2D.push([radius * 0.7, 0]);
    points2D.push([0, -radius]);
    points2D.push([-radius * 0.7, 0]);
  } else if (shape === 'flower') {
    const petals = 6;
    const segments = 48;
    for (let i = 0; i < segments; i++) {
      const th = (i / segments) * Math.PI * 2;
      const r = radius * (0.65 + 0.35 * Math.cos(petals * th));
      points2D.push([Math.cos(th) * r, Math.sin(th) * r]);
    }
  }

  return points2D.map(([px, py]) => {
    return center.clone()
      .addScaledVector(u, px)
      .addScaledVector(v, py);
  });
}

/**
 * Smooths stroke points for marker painting
 */
export function smoothStrokePoints(points: THREE.Vector3[], iterations: number = 2): THREE.Vector3[] {
  if (points.length < 3) return points;
  let current = [...points];

  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: THREE.Vector3[] = [];
    smoothed.push(current[0].clone());
    for (let i = 1; i < current.length - 1; i++) {
      const prev = current[i - 1];
      const curr = current[i];
      const next = current[i + 1];

      smoothed.push(
        new THREE.Vector3(
          prev.x * 0.25 + curr.x * 0.5 + next.x * 0.25,
          prev.y * 0.25 + curr.y * 0.5 + next.y * 0.25,
          prev.z * 0.25 + curr.z * 0.5 + next.z * 0.25
        )
      );
    }
    smoothed.push(current[current.length - 1].clone());
    current = smoothed;
  }
  return current;
}

/**
 * Creates 2D ribbon mesh points for 3D marker stroke preview
 */
export function generateMarkerRibbonVertices(
  points: THREE.Vector3[],
  normal: THREE.Vector3,
  width: number
): THREE.Vector3[] {
  if (points.length < 2) return [];
  const ribbon: THREE.Vector3[] = [];
  const radius = width / 2;
  const norm = normal.clone().normalize();

  for (let i = 0; i < points.length; i++) {
    let tangent: THREE.Vector3;
    if (i === 0) {
      tangent = points[1].clone().sub(points[0]).normalize();
    } else if (i === points.length - 1) {
      tangent = points[i].clone().sub(points[i - 1]).normalize();
    } else {
      tangent = points[i + 1].clone().sub(points[i - 1]).normalize();
    }

    const side = new THREE.Vector3().crossVectors(norm, tangent).normalize().multiplyScalar(radius);
    const elevated = points[i].clone().addScaledVector(norm, 0.12);
    ribbon.push(elevated.clone().add(side));
    ribbon.push(elevated.clone().sub(side));
  }
  return ribbon;
}

/**
 * Generates 3D Hatch lines for viewport preview at specific size and angle
 */
export function generateHatchLines(
  center: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  size: number,
  angleDeg: number
): THREE.Vector3[] {
  const { u, v } = computeTangentBasis(normal);
  const rad = THREE.MathUtils.degToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Direction along hatch lines and perpendicular
  const dirU = u.clone().multiplyScalar(cos).addScaledVector(v, sin);
  const dirV = u.clone().multiplyScalar(-sin).addScaledVector(v, cos);

  const lines: THREE.Vector3[] = [];
  const spacing = Math.max(1.0, size);
  const count = Math.ceil(radius / spacing) * 2;

  for (let i = -count; i <= count; i++) {
    const offset = i * spacing;
    if (Math.abs(offset) > radius * 1.2) continue;

    // Line span across circle
    const halfSpan = Math.sqrt(Math.max(0, radius * radius * 1.4 - offset * offset));
    const p1 = center.clone().addScaledVector(dirV, offset).addScaledVector(dirU, -halfSpan).addScaledVector(normal, 0.12);
    const p2 = center.clone().addScaledVector(dirV, offset).addScaledVector(dirU, halfSpan).addScaledVector(normal, 0.12);
    lines.push(p1, p2);
  }
  return lines;
}

/**
 * Creates 3D Cutting Manifolds from an Angled Hatch pattern
 */
export function createHatchCutterManifolds(
  center: THREE.Vector3,
  surfaceNormal: THREE.Vector3,
  radius: number,
  fillSize: number,
  fillAngleDeg: number,
  depth: number,
  fitTolerance: number,
  wasm: any
): { cutterInlay: any; cutterPocket: any; center: THREE.Vector3; normal: THREE.Vector3 } {
  const normal = surfaceNormal.clone().normalize();
  const { u, v } = computeTangentBasis(normal);

  const rad = THREE.MathUtils.degToRad(fillAngleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const stripeWidth = Math.max(0.6, fillSize * 0.55);
  const pitch = Math.max(1.2, fillSize);
  const boundR = radius * 1.3;
  const numStripes = Math.ceil(boundR / pitch) * 2;

  let hatchCS: any = null;

  for (let i = -numStripes; i <= numStripes; i++) {
    const offset = i * pitch;
    if (Math.abs(offset) > boundR) continue;

    const halfSpan = boundR * 1.1;
    // 2D box in (rotated u, rotated v) coords:
    // width: 2*halfSpan along U', height: stripeWidth along V'
    const x0 = -halfSpan;
    const x1 = halfSpan;
    const y0 = offset - stripeWidth / 2;
    const y1 = offset + stripeWidth / 2;

    // Rotate (x, y) back by angle
    const p1: [number, number] = [x0 * cos - y0 * sin, x0 * sin + y0 * cos];
    const p2: [number, number] = [x1 * cos - y0 * sin, x1 * sin + y0 * cos];
    const p3: [number, number] = [x1 * cos - y1 * sin, x1 * sin + y1 * cos];
    const p4: [number, number] = [x0 * cos - y1 * sin, x0 * sin + y1 * cos];

    const quadCS = new wasm.CrossSection([[p1, p2, p3, p4]]);
    hatchCS = hatchCS ? wasm.CrossSection.union(hatchCS, quadCS) : quadCS;
  }

  const csPocket = hatchCS;
  let csInlay = csPocket;

  if (fitTolerance > 0.001) {
    try {
      const offsetCs = csPocket.offset(-fitTolerance);
      if (offsetCs.area() > 0.05) csInlay = offsetCs;
    } catch (e) {
      console.warn('Tolerance offset failed:', e);
    }
  }

  const overshoot = 1.2;
  const totalHeight = depth + overshoot;
  const extPocket = csPocket.extrude(totalHeight);
  const extInlay = csInlay.extrude(totalHeight);

  const origin = center.clone().addScaledVector(normal, overshoot);
  const inwardZ = normal.clone().negate();

  const mat4: number[] = [
    u.x, u.y, u.z, 0,
    v.x, v.y, v.z, 0,
    inwardZ.x, inwardZ.y, inwardZ.z, 0,
    origin.x, origin.y, origin.z, 1
  ];

  return {
    cutterInlay: extInlay.transform(mat4),
    cutterPocket: extPocket.transform(mat4),
    center,
    normal
  };
}

/**
 * Creates 3D Cutting Manifolds from a Marker Stroke
 */
export function createMarkerCutterManifolds(
  strokePoints: THREE.Vector3[],
  surfaceNormal: THREE.Vector3,
  strokeWidth: number,
  depth: number,
  fitTolerance: number,
  wasm: any
): { cutterInlay: any; cutterPocket: any; center: THREE.Vector3; normal: THREE.Vector3 } {
  if (strokePoints.length < 2) {
    throw new Error('Marker stroke must contain at least 2 points');
  }

  const center = new THREE.Vector3();
  for (const pt of strokePoints) center.add(pt);
  center.divideScalar(strokePoints.length);

  const normal = surfaceNormal.clone().normalize();
  const { u, v } = computeTangentBasis(normal);

  const pts2D: [number, number][] = strokePoints.map((p) => {
    const rel = p.clone().sub(center);
    return [rel.dot(u), rel.dot(v)];
  });

  const r = Math.max(0.4, strokeWidth / 2);
  const circleSegs = 16;
  let strokeCS: any = null;

  for (let i = 0; i < pts2D.length; i++) {
    const circle = wasm.CrossSection.circle(r, circleSegs).translate(pts2D[i]);
    strokeCS = strokeCS ? wasm.CrossSection.union(strokeCS, circle) : circle;

    if (i < pts2D.length - 1) {
      const p1 = pts2D[i];
      const p2 = pts2D[i + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        const nx = (-dy / len) * r;
        const ny = (dx / len) * r;
        const quad: [number, number][] = [
          [p1[0] + nx, p1[1] + ny],
          [p2[0] + nx, p2[1] + ny],
          [p2[0] - nx, p2[1] - ny],
          [p1[0] - nx, p1[1] - ny]
        ];
        const quadCS = new wasm.CrossSection([quad]);
        strokeCS = wasm.CrossSection.union(strokeCS, quadCS);
      }
    }
  }

  const csPocket = strokeCS;
  let csInlay = csPocket;

  if (fitTolerance > 0.001) {
    try {
      const offsetCs = csPocket.offset(-fitTolerance);
      if (offsetCs.area() > 0.05) csInlay = offsetCs;
    } catch (err) {
      console.warn('Tolerance offset failed:', err);
    }
  }

  const overshoot = 1.2;
  const totalHeight = depth + overshoot;
  const extPocket = csPocket.extrude(totalHeight);
  const extInlay = csInlay.extrude(totalHeight);

  const origin = center.clone().addScaledVector(normal, overshoot);
  const inwardZ = normal.clone().negate();

  const mat4: number[] = [
    u.x, u.y, u.z, 0,
    v.x, v.y, v.z, 0,
    inwardZ.x, inwardZ.y, inwardZ.z, 0,
    origin.x, origin.y, origin.z, 1
  ];

  return {
    cutterInlay: extInlay.transform(mat4),
    cutterPocket: extPocket.transform(mat4),
    center,
    normal
  };
}

/**
 * Creates 3D Cutting Manifolds from a closed boundary polygon
 */
export function createPolygonCutterManifolds(
  contourPoints: THREE.Vector3[],
  surfaceNormal: THREE.Vector3,
  depth: number,
  fitTolerance: number,
  wasm: any
): { cutterInlay: any; cutterPocket: any; center: THREE.Vector3; normal: THREE.Vector3 } {
  if (contourPoints.length < 3) {
    throw new Error('Contour must contain at least 3 points');
  }

  const center = new THREE.Vector3();
  for (const pt of contourPoints) center.add(pt);
  center.divideScalar(contourPoints.length);

  const normal = surfaceNormal.clone().normalize();
  const { u, v } = computeTangentBasis(normal);

  const pts2D: [number, number][] = contourPoints.map((p) => {
    const rel = p.clone().sub(center);
    return [rel.dot(u), rel.dot(v)];
  });

  let signedArea = 0;
  for (let i = 0; i < pts2D.length; i++) {
    const [x1, y1] = pts2D[i];
    const [x2, y2] = pts2D[(i + 1) % pts2D.length];
    signedArea += x1 * y2 - x2 * y1;
  }
  if (signedArea < 0) pts2D.reverse();

  const csPocket = new wasm.CrossSection([pts2D]);
  let csInlay = csPocket;

  if (fitTolerance > 0.001) {
    try {
      const offsetCs = csPocket.offset(-fitTolerance);
      if (offsetCs.area() > 0.1) csInlay = offsetCs;
    } catch (err) {
      console.warn('Tolerance offset failed:', err);
    }
  }

  const overshoot = 1.2;
  const totalHeight = depth + overshoot;
  const extPocket = csPocket.extrude(totalHeight);
  const extInlay = csInlay.extrude(totalHeight);

  const origin = center.clone().addScaledVector(normal, overshoot);
  const inwardZ = normal.clone().negate();

  const mat4: number[] = [
    u.x, u.y, u.z, 0,
    v.x, v.y, v.z, 0,
    inwardZ.x, inwardZ.y, inwardZ.z, 0,
    origin.x, origin.y, origin.z, 1
  ];

  return {
    cutterInlay: extInlay.transform(mat4),
    cutterPocket: extPocket.transform(mat4),
    center,
    normal
  };
}

/**
 * Unified cutter creator handling Marker, Stamp, Hatch Fill, and Flood Fill
 */
export function createUnifiedCutter(
  contour: ContourData,
  depth: number,
  fitTolerance: number,
  wasm: any
): { cutterInlay: any; cutterPocket: any; center: THREE.Vector3; normal: THREE.Vector3 } {
  if (contour.type === 'marker') {
    return createMarkerCutterManifolds(
      contour.points3D,
      contour.normal,
      contour.strokeWidth || 2.5,
      depth,
      fitTolerance,
      wasm
    );
  }

  if (contour.type === 'fill_hatch') {
    return createHatchCutterManifolds(
      contour.center,
      contour.normal,
      25.0, // Region radius
      contour.fillSize || 3.0,
      contour.fillAngle || 45,
      depth,
      fitTolerance,
      wasm
    );
  }

  return createPolygonCutterManifolds(
    contour.points3D,
    contour.normal,
    depth,
    fitTolerance,
    wasm
  );
}

/**
 * Performs watertight CSG Boolean operations:
 * - Inlay Solid = Manifold.intersection(Model, CutterInlay)
 * - Base Housing = Manifold.difference(Model, CutterPocket)
 */
export function performBooleanSplit(
  baseManifold: any,
  cutterInlay: any,
  cutterPocket: any,
  wasm: any
): {
  inlayManifold: any;
  newBaseManifold: any;
  inlayGeometry: THREE.BufferGeometry;
  baseGeometry: THREE.BufferGeometry;
  volumeInlay: number;
  volumeBase: number;
} {
  const inlayManifold = wasm.Manifold.intersection(baseManifold, cutterInlay);
  const newBaseManifold = wasm.Manifold.difference(baseManifold, cutterPocket);

  const inlayGeometry = manifoldToThree(inlayManifold, 30);
  const baseGeometry = manifoldToThree(newBaseManifold, 30);

  const volumeInlay = Math.max(0, inlayManifold.volume());
  const volumeBase = Math.max(0, newBaseManifold.volume());

  return {
    inlayManifold,
    newBaseManifold,
    inlayGeometry,
    baseGeometry,
    volumeInlay,
    volumeBase
  };
}

