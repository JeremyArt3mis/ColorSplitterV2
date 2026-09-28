/**
 * Production-Grade 3D Viewport Component
 * Powered by Three.js, OrbitControls, PCFSoftShadowMap, and Raycasting
 * Features:
 * - Fill Tool preview (angled hatch lines and flood fills)
 * - Multi-color surface painting with live filament colors
 * - Marker ribbon painting and shape stamping
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ToolMode,
  StampShape,
  SplitPart,
  ContourData,
  SplitSettings
} from '../types';
import {
  generateShapeContour,
  smoothStrokePoints,
  generateMarkerRibbonVertices,
  generateHatchLines
} from '../services/manifoldService';
import { Sliders } from 'lucide-react';

interface Viewport3DProps {
  parts: SplitPart[];
  toolMode: ToolMode;
  selectedShape: StampShape;
  settings: SplitSettings;
  onUpdateSettings: (patch: Partial<SplitSettings>) => void;
  coloredMarks: ContourData[];
  onMarkAdded: (mark: ContourData) => void;
  onClearMarks: () => void;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  parts,
  toolMode,
  selectedShape,
  settings,
  onUpdateSettings,
  coloredMarks,
  onMarkAdded,
  onClearMarks
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const partsGroupRef = useRef<THREE.Group | null>(null);
  const meshesMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const coloredMarksGroupRef = useRef<THREE.Group | null>(null);

  // Drawing & interaction references
  const drawingPointsRef = useRef<THREE.Vector3[]>([]);
  const drawingNormalsRef = useRef<THREE.Vector3[]>([]);
  const isMouseDownRef = useRef<boolean>(false);
  const lastDrawTimeRef = useRef<number>(0);

  // Overlay elements
  const contourLineRef = useRef<THREE.Line | null>(null);
  const markerRibbonMeshRef = useRef<THREE.Mesh | null>(null);
  const hatchLinesMeshRef = useRef<THREE.LineSegments | null>(null);
  const stampPreviewMeshRef = useRef<THREE.Line | null>(null);
  const hoverMarkerGroupRef = useRef<THREE.Group | null>(null);

  // 1. Initialize Scene, Lights, Shadows, and Camera
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Clean light studio slate-100
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1500);
    camera.position.set(45, 52, 60);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 4, 0);
    // Unrestricted polar angle: full 0 to Math.PI so user can inspect and paint underneath the plane
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minDistance = 10;
    controls.maxDistance = 500;
    controlsRef.current = controls;

    // Ambient light balanced for light background
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    // Hemisphere light providing natural sky and ground illumination
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.65);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // Directional light with soft shadows and minimal bias
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.05);
    dirLight.position.set(40, 70, 35);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 250;
    dirLight.shadow.camera.left = -70;
    dirLight.shadow.camera.right = 70;
    dirLight.shadow.camera.top = 70;
    dirLight.shadow.camera.bottom = -70;
    dirLight.shadow.bias = -0.0001;
    dirLight.shadow.normalBias = 0.002;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.28);
    fillLight.position.set(-30, 25, -45);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, 40, -50);
    scene.add(rimLight);

    // Bottom bounce light so model underside is never in pitch black darkness
    const bottomLight = new THREE.DirectionalLight(0xe2e8f0, 0.55);
    bottomLight.position.set(0, -60, 0);
    scene.add(bottomLight);

    // Ground Grid & Shadow Receiver
    const gridHelper = new THREE.GridHelper(140, 70, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    const groundGeom = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.12, depthWrite: false });
    const groundPlane = new THREE.Mesh(groundGeom, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.02;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Parts Container Group
    const partsGroup = new THREE.Group();
    scene.add(partsGroup);
    partsGroupRef.current = partsGroup;

    // Persistent Painted Colored Marks Group
    const marksGroup = new THREE.Group();
    scene.add(marksGroup);
    coloredMarksGroupRef.current = marksGroup;

    // Hover Marker Reticle Group (Filled circular brush disc + outer border ring + center dot)
    const hoverGroup = new THREE.Group();
    hoverGroup.visible = false;
    hoverGroup.renderOrder = 999;

    const discGeom = new THREE.CircleGeometry(1.5, 40);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.38
    });
    const discMesh = new THREE.Mesh(discGeom, discMat);
    hoverGroup.add(discMesh);

    const borderGeom = new THREE.RingGeometry(1.35, 1.55, 48);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const borderMesh = new THREE.Mesh(borderGeom, borderMat);
    hoverGroup.add(borderMesh);

    const centerGeom = new THREE.CircleGeometry(0.2, 16);
    const centerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const centerMesh = new THREE.Mesh(centerGeom, centerMat);
    hoverGroup.add(centerMesh);

    scene.add(hoverGroup);
    hoverMarkerGroupRef.current = hoverGroup;

    // Marker Ribbon Mesh
    const ribbonGeom = new THREE.BufferGeometry();
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
    ribbonMesh.visible = false;
    ribbonMesh.renderOrder = 996;
    scene.add(ribbonMesh);
    markerRibbonMeshRef.current = ribbonMesh;

    // Hatch Lines LineSegments
    const hatchMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      linewidth: 2,
      depthTest: false
    });
    const hatchMesh = new THREE.LineSegments(new THREE.BufferGeometry(), hatchMat);
    hatchMesh.renderOrder = 995;
    hatchMesh.visible = false;
    scene.add(hatchMesh);
    hatchLinesMeshRef.current = hatchMesh;

    // Contour Line container
    const contourMat = new THREE.LineBasicMaterial({
      color: 0xf97316,
      linewidth: 3,
      depthTest: false
    });
    const contourLine = new THREE.Line(new THREE.BufferGeometry(), contourMat);
    contourLine.renderOrder = 998;
    scene.add(contourLine);
    contourLineRef.current = contourLine;

    // Stamp Preview Line container
    const stampMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.85
    });
    const stampLine = new THREE.Line(new THREE.BufferGeometry(), stampMat);
    stampLine.renderOrder = 997;
    stampLine.visible = false;
    scene.add(stampLine);
    stampPreviewMeshRef.current = stampLine;

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // 2. Configure OrbitControls buttons based on ToolMode
  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    if (toolMode === 'rotate') {
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
      if (hoverMarkerGroupRef.current) hoverMarkerGroupRef.current.visible = false;
      if (stampPreviewMeshRef.current) stampPreviewMeshRef.current.visible = false;
      if (hatchLinesMeshRef.current) hatchLinesMeshRef.current.visible = false;
    } else {
      controls.mouseButtons = {
        LEFT: null as unknown as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      };
    }
  }, [toolMode]);

  // Update circular hover marker size and color based on active mode & filament
  useEffect(() => {
    const group = hoverMarkerGroupRef.current;
    if (!group) return;
    let radius = settings.markerWidth / 2;
    if (toolMode === 'stamp') radius = settings.stampRadius;
    else if (toolMode === 'fill') radius = settings.fillSize * 1.5;

    const disc = group.children[0] as THREE.Mesh;
    const border = group.children[1] as THREE.Mesh;
    const center = group.children[2] as THREE.Mesh;

    const activeHex = toolMode === 'fill' ? '#10b981' : settings.activeColor;

    if (disc) {
      disc.geometry.dispose();
      disc.geometry = new THREE.CircleGeometry(Math.max(0.1, radius), 40);
      (disc.material as THREE.MeshBasicMaterial).color.set(activeHex);
    }
    if (border) {
      border.geometry.dispose();
      border.geometry = new THREE.RingGeometry(Math.max(0.05, radius - 0.18), radius + 0.08, 48);
      (border.material as THREE.MeshBasicMaterial).color.set(activeHex);
    }
    if (center) {
      center.geometry.dispose();
      center.geometry = new THREE.CircleGeometry(Math.min(0.25, Math.max(0.08, radius * 0.15)), 16);
    }
  }, [settings.markerWidth, settings.stampRadius, settings.fillSize, toolMode, settings.activeColor]);

  // 4. Sync SplitParts into Three.js Scene
  useEffect(() => {
    if (!partsGroupRef.current) return;
    const group = partsGroupRef.current;
    const currentMeshes = meshesMapRef.current;

    const partIds = new Set(parts.map((p) => p.id));
    for (const [id, mesh] of currentMeshes.entries()) {
      if (!partIds.has(id)) {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        currentMeshes.delete(id);
      }
    }

    parts.forEach((part) => {
      let mesh = currentMeshes.get(part.id);
      if (!mesh) {
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(part.color),
          roughness: 0.55,
          metalness: 0.0,
          wireframe: settings.showWireframe
        });
        mesh = new THREE.Mesh(part.geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { partId: part.id, partType: part.type };
        group.add(mesh);
        currentMeshes.set(part.id, mesh);
      } else {
        if (mesh.geometry !== part.geometry) {
          mesh.geometry.dispose();
          mesh.geometry = part.geometry;
        }
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(part.color);
        mat.wireframe = settings.showWireframe;
      }
      mesh.visible = part.visible;
    });
  }, [parts, settings.showWireframe]);

  // 5. Update Explode Separation Vectors
  useEffect(() => {
    const explode = settings.explodeDistance;
    const currentMeshes = meshesMapRef.current;

    parts.forEach((part) => {
      const mesh = currentMeshes.get(part.id);
      if (!mesh) return;

      if (part.type === 'inlay') {
        const norm = part.normal && part.normal.lengthSq() > 0.01
          ? part.normal.clone().normalize()
          : new THREE.Vector3(0, 1, 0);
        mesh.position.copy(norm.multiplyScalar(explode));
      } else {
        mesh.position.set(0, -explode * 0.45, 0);
      }
    });
  }, [settings.explodeDistance, parts]);

  // 6. Update Painted Colored Marks Visualization (All marks stay visible in their true filament colors!)
  useEffect(() => {
    const marksGroup = coloredMarksGroupRef.current;
    if (!marksGroup) return;

    // Clear existing marks
    while (marksGroup.children.length > 0) {
      const child = marksGroup.children[0] as THREE.Mesh | THREE.Line | THREE.LineSegments;
      marksGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    coloredMarks.forEach((mark) => {
      const markColor = new THREE.Color(mark.color);

      if (mark.type === 'marker') {
        const ribbonPts = generateMarkerRibbonVertices(
          mark.points3D,
          mark.normal,
          mark.strokeWidth || settings.markerWidth
        );
        if (ribbonPts.length >= 4) {
          const positions = new Float32Array(ribbonPts.length * 3);
          const indices: number[] = [];
          ribbonPts.forEach((p, idx) => {
            positions[idx * 3] = p.x;
            positions[idx * 3 + 1] = p.y;
            positions[idx * 3 + 2] = p.z;
          });
          for (let i = 0; i < ribbonPts.length - 2; i += 2) {
            indices.push(i, i + 1, i + 2);
            indices.push(i + 1, i + 3, i + 2);
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geom.setIndex(indices);
          const mat = new THREE.MeshBasicMaterial({
            color: markColor,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true,
            opacity: 0.95
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.renderOrder = 996;
          marksGroup.add(mesh);
        }
      } else if (mark.type === 'fill_hatch') {
        const hatchPts = generateHatchLines(
          mark.center,
          mark.normal,
          22.0,
          mark.fillSize || settings.fillSize,
          mark.fillAngle || settings.fillAngle
        );
        const pos = new Float32Array(hatchPts.length * 3);
        hatchPts.forEach((p, idx) => {
          pos[idx * 3] = p.x;
          pos[idx * 3 + 1] = p.y;
          pos[idx * 3 + 2] = p.z;
        });
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.LineBasicMaterial({ color: markColor, linewidth: 2, depthTest: false });
        const hatchMesh = new THREE.LineSegments(geom, mat);
        hatchMesh.renderOrder = 995;
        marksGroup.add(hatchMesh);
      } else {
        const pts = [...mark.points3D];
        if (mark.closed && pts.length > 2) {
          pts.push(pts[0].clone());
        }
        const positions = new Float32Array(pts.length * 3);
        pts.forEach((p, idx) => {
          const elevated = p.clone().addScaledVector(mark.normal, 0.15);
          positions[idx * 3] = elevated.x;
          positions[idx * 3 + 1] = elevated.y;
          positions[idx * 3 + 2] = elevated.z;
        });
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({ color: markColor, linewidth: 3, depthTest: false });
        const line = new THREE.Line(geom, mat);
        line.renderOrder = 998;
        marksGroup.add(line);
      }
    });
  }, [coloredMarks, settings.markerWidth, settings.fillSize, settings.fillAngle]);

  // 7. Raycast Helper
  const raycastSurface = useCallback((e: React.MouseEvent | MouseEvent): THREE.Intersection | null => {
    if (!canvasRef.current || !cameraRef.current || !partsGroupRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const visibleMeshes: THREE.Mesh[] = [];
    meshesMapRef.current.forEach((mesh) => {
      if (mesh.visible) visibleMeshes.push(mesh);
    });

    const intersects = raycaster.intersectObjects(visibleMeshes, true);
    return intersects.length > 0 ? intersects[0] : null;
  }, []);

  // 8. Mouse Event Handlers
  const handlePointerDown = (e: React.MouseEvent) => {
    if (toolMode === 'rotate' || e.button !== 0) return;
    isMouseDownRef.current = true;

    const hit = raycastSurface(e);
    if (!hit || !hit.face) return;

    const hitPoint = hit.point.clone();
    const hitNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();

    if (toolMode === 'fill') {
      // Fill Tool Click: Fill Hatched Texture or Flood Island
      const markId = `fill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (settings.fillMode === 'hatch') {
        onMarkAdded({
          id: markId,
          type: 'fill_hatch',
          points3D: [hitPoint],
          normal: hitNormal,
          center: hitPoint,
          closed: true,
          fillSize: settings.fillSize,
          fillAngle: settings.fillAngle,
          color: settings.activeColor
        });
      } else {
        const pts = generateShapeContour('circle', hitPoint, hitNormal, 18.0);
        onMarkAdded({
          id: markId,
          type: 'polygon',
          points3D: pts,
          normal: hitNormal,
          center: hitPoint,
          closed: true,
          color: settings.activeColor
        });
      }
      isMouseDownRef.current = false;
    } else if (toolMode === 'stamp') {
      const points = generateShapeContour(selectedShape, hitPoint, hitNormal, settings.stampRadius);
      const markId = `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      onMarkAdded({
        id: markId,
        type: 'polygon',
        points3D: points,
        normal: hitNormal,
        center: hitPoint,
        closed: true,
        color: settings.activeColor
      });
      isMouseDownRef.current = false;
    } else if (toolMode === 'marker') {
      drawingPointsRef.current = [hitPoint];
      drawingNormalsRef.current = [hitNormal];
      lastDrawTimeRef.current = performance.now();
    } else if (toolMode === 'lasso') {
      drawingPointsRef.current = [hitPoint];
      drawingNormalsRef.current = [hitNormal];
      lastDrawTimeRef.current = performance.now();
    }
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    if (toolMode === 'rotate') {
      if (hoverMarkerGroupRef.current) hoverMarkerGroupRef.current.visible = false;
      if (stampPreviewMeshRef.current) stampPreviewMeshRef.current.visible = false;
      return;
    }

    const hit = raycastSurface(e);
    if (!hit || !hit.face) {
      if (hoverMarkerGroupRef.current) hoverMarkerGroupRef.current.visible = false;
      if (stampPreviewMeshRef.current) stampPreviewMeshRef.current.visible = false;
      return;
    }

    const hitPoint = hit.point.clone();
    const hitNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();

    // Position circular hover marker brush reticle directly on model surface
    if (hoverMarkerGroupRef.current) {
      hoverMarkerGroupRef.current.position.copy(hitPoint).addScaledVector(hitNormal, 0.12);
      hoverMarkerGroupRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hitNormal);
      hoverMarkerGroupRef.current.visible = true;
    }

    // Stamp preview
    if (toolMode === 'stamp' && stampPreviewMeshRef.current) {
      const stampPts = generateShapeContour(selectedShape, hitPoint, hitNormal, settings.stampRadius);
      stampPts.push(stampPts[0].clone());
      const pos = new Float32Array(stampPts.length * 3);
      stampPts.forEach((p, idx) => {
        const elevated = p.clone().addScaledVector(hitNormal, 0.15);
        pos[idx * 3] = elevated.x;
        pos[idx * 3 + 1] = elevated.y;
        pos[idx * 3 + 2] = elevated.z;
      });
      stampPreviewMeshRef.current.geometry.dispose();
      stampPreviewMeshRef.current.geometry = new THREE.BufferGeometry();
      stampPreviewMeshRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      stampPreviewMeshRef.current.visible = true;
    } else if (stampPreviewMeshRef.current) {
      stampPreviewMeshRef.current.visible = false;
    }

    // Continuous Marker Painting - Live Feedback
    if (toolMode === 'marker' && isMouseDownRef.current) {
      const now = performance.now();
      const points = drawingPointsRef.current;
      const lastPoint = points[points.length - 1];

      if (!lastPoint || (lastPoint.distanceTo(hitPoint) > 0.4 && now - lastDrawTimeRef.current > 15)) {
        points.push(hitPoint);
        drawingNormalsRef.current.push(hitNormal);
        lastDrawTimeRef.current = now;

        const avgNormal = new THREE.Vector3();
        drawingNormalsRef.current.forEach((n) => avgNormal.add(n));
        avgNormal.normalize();

        const ribbon = markerRibbonMeshRef.current;
        if (ribbon && points.length >= 2) {
          const ribbonPts = generateMarkerRibbonVertices(points, avgNormal, settings.markerWidth);
          if (ribbonPts.length >= 4) {
            const positions = new Float32Array(ribbonPts.length * 3);
            const indices: number[] = [];
            ribbonPts.forEach((p, idx) => {
              positions[idx * 3] = p.x;
              positions[idx * 3 + 1] = p.y;
              positions[idx * 3 + 2] = p.z;
            });
            for (let i = 0; i < ribbonPts.length - 2; i += 2) {
              indices.push(i, i + 1, i + 2);
              indices.push(i + 1, i + 3, i + 2);
            }
            ribbon.geometry.dispose();
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geom.setIndex(indices);
            ribbon.geometry = geom;
            (ribbon.material as THREE.MeshBasicMaterial).color.set(settings.activeColor);
            ribbon.visible = true;
          }
        }
      }
    }

    // Lasso drawing - Live Feedback
    if (toolMode === 'lasso' && isMouseDownRef.current) {
      const now = performance.now();
      const points = drawingPointsRef.current;
      const lastPoint = points[points.length - 1];

      if (!lastPoint || (lastPoint.distanceTo(hitPoint) > 0.8 && now - lastDrawTimeRef.current > 25)) {
        points.push(hitPoint);
        drawingNormalsRef.current.push(hitNormal);
        lastDrawTimeRef.current = now;

        const line = contourLineRef.current;
        if (line && points.length >= 2) {
          const pos = new Float32Array(points.length * 3);
          points.forEach((p, idx) => {
            const elevated = p.clone().addScaledVector(hitNormal, 0.15);
            pos[idx * 3] = elevated.x;
            pos[idx * 3 + 1] = elevated.y;
            pos[idx * 3 + 2] = elevated.z;
          });
          line.geometry.dispose();
          line.geometry = new THREE.BufferGeometry();
          line.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          (line.material as THREE.LineBasicMaterial).color.set(settings.activeColor);
          line.visible = true;
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false;
      const points = drawingPointsRef.current;

      if (toolMode === 'marker' && points.length >= 2) {
        const smoothed = smoothStrokePoints(points, 2);
        const avgNormal = new THREE.Vector3();
        drawingNormalsRef.current.forEach((n) => avgNormal.add(n));
        avgNormal.normalize();

        const center = new THREE.Vector3();
        smoothed.forEach((p) => center.add(p));
        center.divideScalar(smoothed.length);

        const newMark: ContourData = {
          id: `marker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'marker',
          points3D: smoothed,
          normal: avgNormal,
          center,
          closed: true,
          strokeWidth: settings.markerWidth,
          color: settings.activeColor
        };
        onMarkAdded(newMark);
      } else if (toolMode === 'lasso' && points.length >= 3) {
        const smoothed = smoothStrokePoints(points, 2);
        const avgNormal = new THREE.Vector3();
        drawingNormalsRef.current.forEach((n) => avgNormal.add(n));
        avgNormal.normalize();

        const center = new THREE.Vector3();
        smoothed.forEach((p) => center.add(p));
        center.divideScalar(smoothed.length);

        const newMark: ContourData = {
          id: `lasso-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'polygon',
          points3D: smoothed,
          normal: avgNormal,
          center,
          closed: true,
          color: settings.activeColor
        };
        onMarkAdded(newMark);
      }

      drawingPointsRef.current = [];
      drawingNormalsRef.current = [];
      if (markerRibbonMeshRef.current) markerRibbonMeshRef.current.visible = false;
      if (contourLineRef.current) contourLineRef.current.visible = false;
    }
  };

  const setCameraView = (view: 'top' | 'front' | 'bottom' | 'iso') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const target = new THREE.Vector3(0, 4, 0);

    if (view === 'top') {
      camera.position.set(0, 85, 0.01);
    } else if (view === 'front') {
      camera.position.set(0, 10, 80);
    } else if (view === 'bottom') {
      camera.position.set(0, -85, 0.01);
    } else {
      camera.position.set(45, 52, 60);
    }
    camera.lookAt(target);
    controls.target.copy(target);
    controls.update();
  };

  // Custom circular cursor SVG for canvas paint modes
  const circleCursorSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='14' cy='14' r='10' fill='rgba(6,182,212,0.18)' stroke='%230284c7' stroke-width='1.5'/%3E%3Ccircle cx='14' cy='14' r='1.5' fill='%230f172a'/%3E%3C/svg%3E") 14 14, crosshair`;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full overflow-hidden bg-slate-100 select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => {
        if (toolMode !== 'rotate') e.preventDefault();
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: toolMode === 'rotate' ? 'grab' : circleCursorSvg }}
      />

      {/* Floating Mode Helper Badge - Light Studio Theme */}
      <div className="absolute top-3 left-4 z-10 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200/90 text-xs text-slate-700 shadow-md">
          <span
            className={`w-2 h-2 rounded-full ${
              toolMode === 'rotate'
                ? 'bg-emerald-500'
                : toolMode === 'marker'
                ? 'bg-cyan-500 animate-pulse'
                : toolMode === 'fill'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-amber-500 animate-pulse'
            }`}
          />
          <span className="font-medium">
            {coloredMarks.length > 0
              ? `${coloredMarks.length} Mark${coloredMarks.length === 1 ? '' : 's'} Ready to Split • ${
                  toolMode === 'marker'
                    ? 'Marker Pen: Add more strokes or click Split Colors'
                    : toolMode === 'fill'
                    ? 'Fill Tool: Click to add color fill'
                    : toolMode === 'stamp'
                    ? 'Stamp: Click to add shapes'
                    : 'Lasso: Draw loop boundary'
                }`
              : toolMode === 'rotate'
              ? 'Rotate Mode: Left-click + drag to orbit 360° all around and under'
              : toolMode === 'marker'
              ? `Circle Brush (${settings.markerWidth.toFixed(1)}mm): Click & drag to paint`
              : toolMode === 'fill'
              ? `Fill Tool (${settings.fillMode === 'hatch' ? `Angled Hatch @ ${settings.fillAngle}°` : 'Solid Face'}): Click face to fill`
              : toolMode === 'stamp'
              ? 'Shape Stamp: Click on model to stamp inlay shape'
              : 'Lasso: Click & drag to draw closed loop boundary'}
          </span>
        </div>
      </div>

      {/* Camera View Switcher Buttons (Top Right) */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-lg p-1 shadow-md">
        <button
          type="button"
          onClick={() => setCameraView('top')}
          className="px-2 py-1 text-[11px] font-mono font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
          title="Top View (Y-down)"
        >
          Top
        </button>
        <button
          type="button"
          onClick={() => setCameraView('front')}
          className="px-2 py-1 text-[11px] font-mono font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
          title="Front View"
        >
          Front
        </button>
        <button
          type="button"
          onClick={() => setCameraView('bottom')}
          className="px-2 py-1 text-[11px] font-mono font-medium text-cyan-700 hover:text-cyan-900 hover:bg-cyan-50 rounded transition-colors"
          title="Bottom View (Look up from under the plane)"
        >
          Bottom
        </button>
        <button
          type="button"
          onClick={() => setCameraView('iso')}
          className="px-2 py-1 text-[11px] font-mono font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
          title="Isometric 3D View"
        >
          Iso
        </button>
        <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />
        <button
          type="button"
          onClick={() => onUpdateSettings({ showWireframe: !settings.showWireframe })}
          className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
            settings.showWireframe
              ? 'bg-cyan-100 text-cyan-800 border border-cyan-300 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Toggle mesh wireframe visualization"
        >
          Wire
        </button>
      </div>

      {/* Floating Bottom Explode Bar - Light Studio Theme */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-5 py-2.5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-600" />
          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Explode Distance:
          </span>
        </div>

        <div className="flex items-center gap-3 w-56 sm:w-72">
          <input
            type="range"
            min="0"
            max="40"
            step="1"
            value={settings.explodeDistance}
            onChange={(e) => onUpdateSettings({ explodeDistance: parseInt(e.target.value, 10) })}
            className="w-full accent-cyan-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
          />
          <span className="font-mono text-xs font-bold text-cyan-600 w-12 text-right">
            {settings.explodeDistance} mm
          </span>
        </div>

        {settings.explodeDistance > 0 && (
          <button
            type="button"
            onClick={() => onUpdateSettings({ explodeDistance: 0 })}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:underline whitespace-nowrap"
          >
            Collapse
          </button>
        )}
      </div>
    </div>
  );
};
