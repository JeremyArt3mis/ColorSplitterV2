/**
 * Color Splitter - 3D Model Splitting & Inlays Application
 * Powered by React, Three.js, and Manifold-3D WebAssembly CSG Kernel
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import {
  ToolMode,
  StampShape,
  PresetType,
  SplitPart,
  ContourData,
  SplitSettings,
  AppProgress
} from './types';
import {
  getManifold,
  createPresetModel,
  createUnifiedCutter,
  performBooleanSplit,
  threeToManifold,
  manifoldToThree,
  normalizeGeometry
} from './services/manifoldService';
import { parse3MF } from './services/threeMfService';
import {
  downloadSinglePartSTL,
  downloadAllPartsZip
} from './services/exportService';
import { HeaderBar, FILAMENT_COLORS } from './components/HeaderBar';
import { Viewport3D } from './components/Viewport3D';
import { RightSidebar } from './components/RightSidebar';
import { ProgressModal } from './components/ProgressModal';

export default function App() {
  // Tool & selection state
  const [toolMode, setToolMode] = useState<ToolMode>('marker');
  const [selectedShape, setSelectedShape] = useState<StampShape>('star');
  const [currentPreset, setCurrentPreset] = useState<PresetType>('coaster');

  // CSG & Viewport Settings
  const [settings, setSettings] = useState<SplitSettings>({
    inlayDepth: 1.5,
    fitTolerance: 0.08,
    markerWidth: 3.0,
    stampRadius: 9,
    fillMode: 'hatch',
    fillSize: 3.0,
    fillAngle: 45,
    activeColor: '#f97316',
    explodeDistance: 0,
    showWireframe: false
  });

  // Solid parts list
  const [parts, setParts] = useState<SplitPart[]>([]);
  const baseManifoldRef = useRef<any>(null);
  const wasmRef = useRef<any>(null);

  // Painted colored markings on the 3D surface (color all first, then split!)
  const [coloredMarks, setColoredMarks] = useState<ContourData[]>([]);

  // Progress modal state
  const [progress, setProgress] = useState<AppProgress>({
    active: true,
    title: 'Loading CSG Engine',
    step: 'Initializing Manifold-3D WebAssembly Kernel...',
    percent: 10
  });

  // 1. Initialize Manifold WebAssembly and load default preset model
  const initApp = useCallback(async () => {
    try {
      setProgress({
        active: true,
        title: 'Initializing Manifold-3D Kernel',
        step: 'Fetching WebAssembly binary...',
        percent: 20
      });

      const wasm = await getManifold((step, pct) => {
        setProgress((prev) => ({ ...prev, step, percent: pct }));
      });
      wasmRef.current = wasm;

      setProgress({
        active: true,
        title: 'Building Preset Solid Model',
        step: 'Creating watertight 2-manifold coaster...',
        percent: 75
      });

      const { manifold, geometry } = createPresetModel('coaster', wasm);
      baseManifoldRef.current = manifold;

      const baseVolume = Math.max(0, manifold.volume());
      const baseTris = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;

      const basePart: SplitPart = {
        id: 'base-housing',
        name: 'Base Housing',
        type: 'base',
        geometry,
        color: '#1e293b',
        visible: true,
        volume: baseVolume,
        triangleCount: baseTris,
        normal: new THREE.Vector3(0, 1, 0),
        originalPosition: new THREE.Vector3(0, 0, 0),
        manifold
      };

      setParts([basePart]);
      setCurrentPreset('coaster');
      setColoredMarks([]);

      setProgress({
        active: false,
        title: 'Ready',
        step: 'Complete',
        percent: 100
      });
    } catch (err) {
      console.error('Initialization error:', err);
      setProgress({
        active: true,
        title: 'Initialization Error',
        step: String(err),
        percent: 100
      });
    }
  }, []);

  useEffect(() => {
    initApp();
  }, [initApp]);

  // 2. Switch Model Preset
  const handleSelectPreset = async (preset: PresetType) => {
    if (!wasmRef.current) return;
    try {
      setProgress({
        active: true,
        title: 'Loading Preset Model',
        step: `Generating watertight solid ${preset}...`,
        percent: 40
      });

      const { manifold, geometry } = createPresetModel(preset, wasmRef.current);
      baseManifoldRef.current = manifold;

      const baseVolume = Math.max(0, manifold.volume());
      const baseTris = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;

      const basePart: SplitPart = {
        id: 'base-housing',
        name: `${preset.charAt(0).toUpperCase() + preset.slice(1)} Base`,
        type: 'base',
        geometry,
        color: '#1e293b',
        visible: true,
        volume: baseVolume,
        triangleCount: baseTris,
        normal: new THREE.Vector3(0, 1, 0),
        originalPosition: new THREE.Vector3(0, 0, 0),
        manifold
      };

      setParts([basePart]);
      setCurrentPreset(preset);
      setColoredMarks([]);
      setSettings((prev) => ({ ...prev, explodeDistance: 0 }));

      setProgress({
        active: false,
        title: 'Ready',
        step: 'Complete',
        percent: 100
      });
    } catch (err) {
      console.error('Preset loading error:', err);
      setProgress({ active: false, title: '', step: '', percent: 0 });
    }
  };

  // 3. Import STL or Precolored 3MF File
  const handleImportFile = async (file: File) => {
    if (!wasmRef.current) return;
    const is3mf = file.name.toLowerCase().endsWith('.3mf');

    try {
      if (is3mf) {
        setProgress({
          active: true,
          title: 'Importing Precolored 3MF File',
          step: 'Unzipping archive and extracting 3D model XML...',
          percent: 20
        });

        const arrayBuffer = await file.arrayBuffer();
        const parsed = await parse3MF(arrayBuffer);

        if (parsed.parts.length === 0) {
          throw new Error('No 3D objects found in 3MF archive');
        }

        setProgress({
          active: true,
          title: 'Constructing Watertight Solid Bodies',
          step: `Processing ${parsed.parts.length} colored solid parts...`,
          percent: 55
        });

        const newPartsList: SplitPart[] = [];
        let combinedBaseManifold: any = null;

        for (let i = 0; i < parsed.parts.length; i++) {
          const p = parsed.parts[i];
          const normalized = normalizeGeometry(p.geometry, 45);
          const partManifold = threeToManifold(normalized, wasmRef.current);
          const cleanGeom = manifoldToThree(partManifold, 30);
          const vol = Math.max(0, partManifold.volume());
          const tris = cleanGeom.index ? cleanGeom.index.count / 3 : cleanGeom.attributes.position.count / 3;

          const isPrimary = i === 0;
          if (isPrimary) combinedBaseManifold = partManifold;

          newPartsList.push({
            id: `3mf-part-${Date.now()}-${i}`,
            name: p.name || `Part ${i + 1}`,
            type: isPrimary ? 'base' : 'inlay',
            geometry: cleanGeom,
            color: p.color,
            visible: true,
            volume: vol,
            triangleCount: tris,
            normal: new THREE.Vector3(0, 1, 0),
            originalPosition: new THREE.Vector3(0, 0, 0),
            manifold: partManifold
          });
        }

        baseManifoldRef.current = combinedBaseManifold;
        setParts(newPartsList);
        setColoredMarks([]);
        setSettings((prev) => ({ ...prev, explodeDistance: 0 }));

        setProgress({
          active: false,
          title: '3MF Import Complete',
          step: `Imported ${newPartsList.length} precolored solid bodies`,
          percent: 100
        });
      } else {
        // Standard STL Import
        setProgress({
          active: true,
          title: 'Importing STL Model',
          step: 'Parsing binary/ASCII triangle mesh...',
          percent: 25
        });

        const arrayBuffer = await file.arrayBuffer();
        const loader = new STLLoader();
        const rawGeometry = loader.parse(arrayBuffer);

        setProgress({
          active: true,
          title: 'Normalizing 3D Geometry',
          step: 'Centering, scaling to ~42mm, placing bottom on ground...',
          percent: 50
        });

        const normalizedGeom = normalizeGeometry(rawGeometry, 42);

        setProgress({
          active: true,
          title: 'Constructing 2-Manifold Mesh',
          step: 'Spatial-hash vertex welding & topology verification...',
          percent: 75
        });

        const manifold = threeToManifold(normalizedGeom, wasmRef.current);
        baseManifoldRef.current = manifold;
        const cleanGeometry = manifoldToThree(manifold, 30);

        const baseVolume = Math.max(0, manifold.volume());
        const baseTris = cleanGeometry.index
          ? cleanGeometry.index.count / 3
          : cleanGeometry.attributes.position.count / 3;

        const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
        const basePart: SplitPart = {
          id: 'base-housing',
          name: cleanFileName,
          type: 'base',
          geometry: cleanGeometry,
          color: '#1e293b',
          visible: true,
          volume: baseVolume,
          triangleCount: baseTris,
          normal: new THREE.Vector3(0, 1, 0),
          originalPosition: new THREE.Vector3(0, 0, 0),
          manifold
        };

        setParts([basePart]);
        setColoredMarks([]);
        setSettings((prev) => ({ ...prev, explodeDistance: 0 }));

        setProgress({
          active: false,
          title: 'Ready',
          step: 'Complete',
          percent: 100
        });
      }
    } catch (err) {
      console.error('File Import error:', err);
      alert(`Could not import file: ${err instanceof Error ? err.message : String(err)}`);
      setProgress({ active: false, title: '', step: '', percent: 0 });
    }
  };

  // Mark management: color all of it first, then split!
  const handleMarkAdded = (mark: ContourData) => {
    setColoredMarks((prev) => [...prev, mark]);
  };

  const handleUndoLastMark = () => {
    setColoredMarks((prev) => prev.slice(0, -1));
  };

  const handleClearAllMarks = () => {
    setColoredMarks([]);
  };

  // 4. Execute Watertight CSG Boolean Inlay Split (Processes all painted colored marks)
  const handleSplitPart = async () => {
    if (coloredMarks.length === 0 || !baseManifoldRef.current || !wasmRef.current) {
      return;
    }

    try {
      const wasm = wasmRef.current;
      let currentBaseManifold = baseManifoldRef.current;
      const newInlayParts: SplitPart[] = [];
      const total = coloredMarks.length;

      for (let i = 0; i < total; i++) {
        const mark = coloredMarks[i];
        setProgress({
          active: true,
          title: total > 1 ? `Computing Solid Split (${i + 1} of ${total})` : 'Computing 3D Solid Split',
          step: `Extruding watertight solid cutter for ${mark.color} (${mark.type === 'marker' ? 'Ribbon' : mark.type === 'fill_hatch' ? 'Angled Hatch' : 'Shape'})...`,
          percent: Math.round(((i + 0.3) / total) * 90)
        });

        await new Promise((r) => setTimeout(r, 30));

        const { cutterInlay, cutterPocket, normal } = createUnifiedCutter(
          mark,
          settings.inlayDepth,
          settings.fitTolerance,
          wasm
        );

        setProgress({
          active: true,
          title: total > 1 ? `Evaluating Boolean CSG (${i + 1} of ${total})` : 'Evaluating Boolean CSG',
          step: 'Computing Watertight Intersection (Inlay) and Difference (Housing)...',
          percent: Math.round(((i + 0.7) / total) * 90)
        });

        await new Promise((r) => setTimeout(r, 30));

        const {
          inlayManifold,
          newBaseManifold,
          inlayGeometry,
          volumeInlay
        } = performBooleanSplit(currentBaseManifold, cutterInlay, cutterPocket, wasm);

        if (volumeInlay > 0.005) {
          currentBaseManifold = newBaseManifold;
          const inlayTris = inlayGeometry.index
            ? inlayGeometry.index.count / 3
            : inlayGeometry.attributes.position.count / 3;

          const existingInlaysCount = parts.filter((p) => p.type === 'inlay').length;
          newInlayParts.push({
            id: `inlay-${Date.now()}-${i}`,
            name: `Inlay #${existingInlaysCount + newInlayParts.length + 1}`,
            type: 'inlay',
            geometry: inlayGeometry,
            color: mark.color,
            visible: true,
            volume: volumeInlay,
            triangleCount: inlayTris,
            normal: normal.clone(),
            originalPosition: new THREE.Vector3(0, 0, 0),
            manifold: inlayManifold
          });
        }
      }

      if (newInlayParts.length === 0) {
        alert('The cutting contours did not intersect the model solid. Please ensure marks touch the model surface.');
        setProgress({ active: false, title: '', step: '', percent: 0 });
        return;
      }

      baseManifoldRef.current = currentBaseManifold;
      const baseGeometry = manifoldToThree(currentBaseManifold, 35);
      const baseTris = baseGeometry.index ? baseGeometry.index.count / 3 : baseGeometry.attributes.position.count / 3;
      const volumeBase = Math.max(0, currentBaseManifold.volume());

      setParts((prev) => {
        const updated = prev.map((p) => {
          if (p.type === 'base') {
            return {
              ...p,
              geometry: baseGeometry,
              volume: volumeBase,
              triangleCount: baseTris,
              manifold: currentBaseManifold
            };
          }
          return p;
        });
        const nextParts = [...updated, ...newInlayParts];
        return nextParts;
      });

      // Clear the colored markings now that they are solid bodies!
      setColoredMarks([]);

      // Auto explode slightly so user immediately sees their cleanly separated inlays!
      setSettings((prev) => ({ ...prev, explodeDistance: Math.max(prev.explodeDistance, 14) }));

      setProgress({
        active: false,
        title: 'Complete',
        step: `Solid split completed: ${newInlayParts.length} watertight inlays created!`,
        percent: 100
      });
    } catch (err) {
      console.error('Boolean Split error:', err);
      alert(`Split operation failed: ${err instanceof Error ? err.message : String(err)}`);
      setProgress({ active: false, title: '', step: '', percent: 0 });
    }
  };

  // 5. Parts list actions
  const handleTogglePartVisibility = (id: string) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
    );
  };

  const handleChangePartColor = (id: string, color: string) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, color } : p))
    );
  };

  const handleUpdateSettings = (patch: Partial<SplitSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleResetModel = () => {
    handleSelectPreset(currentPreset);
  };

  const handleExportAll = () => {
    downloadAllPartsZip(parts, `${currentPreset}_model`);
  };

  const canSplit = coloredMarks.length > 0;

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* Top Header Bar */}
      <HeaderBar
        toolMode={toolMode}
        onSetToolMode={setToolMode}
        selectedShape={selectedShape}
        onSetSelectedShape={setSelectedShape}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        coloredMarksCount={coloredMarks.length}
        coloredMarksColors={coloredMarks.map((m) => m.color)}
        onUndoLastMark={handleUndoLastMark}
        onClearAllMarks={handleClearAllMarks}
        canSplit={canSplit}
        onSplitPart={handleSplitPart}
        onResetModel={handleResetModel}
        onImportFile={handleImportFile}
        onExportAll={handleExportAll}
        partsCount={parts.length}
      />

      {/* Main Workspace: 3D Viewport + Right Parameters & Parts Sidebar */}
      <div className="flex flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden relative">
        <Viewport3D
          parts={parts}
          toolMode={toolMode}
          selectedShape={selectedShape}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          coloredMarks={coloredMarks}
          onMarkAdded={handleMarkAdded}
          onClearMarks={handleClearAllMarks}
        />

        <RightSidebar
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          parts={parts}
          onTogglePartVisibility={handleTogglePartVisibility}
          onChangePartColor={handleChangePartColor}
          onDownloadPart={downloadSinglePartSTL}
          currentPreset={currentPreset}
          onSelectPreset={handleSelectPreset}
        />
      </div>

      {/* Step-by-Step Progress Modal */}
      <ProgressModal progress={progress} />
    </div>
  );
}
