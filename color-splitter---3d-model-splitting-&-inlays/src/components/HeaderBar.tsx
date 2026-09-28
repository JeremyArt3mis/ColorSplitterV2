/**
 * Top Header Navigation Bar
 * Implements Mode Toggles (Rotate, Marker, Fill, Shape Stamp, Lasso),
 * Fill Size & Angle Settings, Color Palette, and Split Actions
 */
import React, { useRef } from 'react';
import {
  RotateCcw,
  Scissors,
  Upload,
  Download,
  MousePointer,
  Brush,
  PaintBucket,
  Shapes,
  LassoSelect,
  Sparkles,
  Trash2,
  Undo2
} from 'lucide-react';
import { ToolMode, StampShape, SplitSettings } from '../types';

interface HeaderBarProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  selectedShape: StampShape;
  onSetSelectedShape: (shape: StampShape) => void;
  settings: SplitSettings;
  onUpdateSettings: (patch: Partial<SplitSettings>) => void;
  coloredMarksCount: number;
  coloredMarksColors: string[];
  onUndoLastMark: () => void;
  onClearAllMarks: () => void;
  canSplit: boolean;
  onSplitPart: () => void;
  onResetModel: () => void;
  onImportFile: (file: File) => void;
  onExportAll: () => void;
  partsCount: number;
}

export const FILAMENT_COLORS = [
  { name: 'Signal Amber', hex: '#f97316' },
  { name: 'Electric Cyan', hex: '#06b6d4' },
  { name: 'Crimson Red', hex: '#ef4444' },
  { name: 'Emerald Jade', hex: '#10b981' },
  { name: 'Sunburst Gold', hex: '#eab308' },
  { name: 'Royal Violet', hex: '#8b5cf6' },
  { name: 'Cobalt Blue', hex: '#3b82f6' },
  { name: 'Magenta Pink', hex: '#ec4899' },
  { name: 'Pure White', hex: '#f8fafc' },
  { name: 'Onyx Black', hex: '#1e293b' },
];

export const HeaderBar: React.FC<HeaderBarProps> = ({
  toolMode,
  onSetToolMode,
  selectedShape,
  onSetSelectedShape,
  settings,
  onUpdateSettings,
  coloredMarksCount,
  coloredMarksColors,
  onUndoLastMark,
  onClearAllMarks,
  canSplit,
  onSplitPart,
  onResetModel,
  onImportFile,
  onExportAll,
  partsCount
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 shadow-xs px-4 flex items-center justify-between select-none z-30 shrink-0">
      {/* Zone 1: Brand & Mode Toggles */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 via-pink-500 to-cyan-500 p-[1.5px] shadow-sm shadow-orange-500/20">
            <div className="w-full h-full bg-white rounded-[6px] flex items-center justify-center">
              <Scissors className="w-4 h-4 text-orange-500" />
            </div>
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900 flex items-center gap-1.5">
            Color Splitter
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium hidden sm:inline-block border border-slate-200">
              CSG Wasm
            </span>
          </span>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

        {/* Primary Tool Mode Toggles */}
        <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 shadow-inner">
          <button
            type="button"
            onClick={() => onSetToolMode('rotate')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              toolMode === 'rotate'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Inspect & rotate model with left-click orbit"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Rotate</span>
          </button>

          {/* Marker Pen Tool */}
          <button
            type="button"
            onClick={() => onSetToolMode('marker')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              toolMode === 'marker'
                ? 'bg-cyan-100 text-cyan-800 border border-cyan-300 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Marker Pen: Paint continuous solid ribbon strokes with circular brush"
          >
            <Brush className="w-3.5 h-3.5 text-cyan-600" />
            <span>Marker</span>
          </button>

          {/* Fill Tool */}
          <button
            type="button"
            onClick={() => onSetToolMode('fill')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              toolMode === 'fill'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Fill Tool: Flood fill surface faces or generate angled hatched inlays"
          >
            <PaintBucket className="w-3.5 h-3.5 text-emerald-600" />
            <span>Fill</span>
          </button>

          {/* Shape Stamp Tool */}
          <button
            type="button"
            onClick={() => onSetToolMode('stamp')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              toolMode === 'stamp'
                ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Stamp geometric shapes onto surface"
          >
            <Shapes className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Stamp</span>
          </button>

          {/* Lasso Tool */}
          <button
            type="button"
            onClick={() => onSetToolMode('lasso')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              toolMode === 'lasso'
                ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Draw closed boundary polygon loops"
          >
            <LassoSelect className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden md:inline">Lasso</span>
          </button>
        </div>

        {/* Fill Tool Controls: Size & Fill Angle */}
        {toolMode === 'fill' && (
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs animate-fadeIn">
            {/* Fill Mode: Hatch vs Solid Flood */}
            <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ fillMode: 'hatch' })}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  settings.fillMode === 'hatch'
                    ? 'bg-white text-emerald-800 border border-emerald-300 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hatch Inlay
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ fillMode: 'flood' })}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  settings.fillMode === 'flood'
                    ? 'bg-white text-emerald-800 border border-emerald-300 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Solid Face
              </button>
            </div>

            {settings.fillMode === 'hatch' && (
              <>
                {/* Size setting */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[11px]">Size:</span>
                  {[2.0, 3.5, 5.0].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onUpdateSettings({ fillSize: sz })}
                      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
                        Math.abs(settings.fillSize - sz) < 0.2
                          ? 'bg-emerald-600 text-white font-bold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
                      }`}
                    >
                      {sz}mm
                    </button>
                  ))}
                </div>

                {/* Fill Angle setting */}
                <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200">
                  <span className="text-slate-500 text-[11px]">Angle:</span>
                  {[0, 45, 90, 135].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => onUpdateSettings({ fillAngle: deg })}
                      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
                        settings.fillAngle === deg
                          ? 'bg-cyan-600 text-white font-bold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Marker Nib Size Controls */}
        {toolMode === 'marker' && (
          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5 animate-fadeIn">
            <span className="text-[11px] text-slate-500 pl-1.5 pr-0.5 font-medium">Circle:</span>
            {[
              { label: 'Fine', w: 1.5 },
              { label: 'Med', w: 3.0 },
              { label: 'Bold', w: 5.0 },
              { label: 'Chisel', w: 7.0 }
            ].map((nib) => (
              <button
                key={nib.label}
                type="button"
                onClick={() => onUpdateSettings({ markerWidth: nib.w })}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  Math.abs(settings.markerWidth - nib.w) < 0.2
                    ? 'bg-cyan-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                title={`Brush diameter: ${nib.w} mm`}
              >
                {nib.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zone 2: Color Palette Swatches & Painted Marks Status */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-medium hidden xl:inline-block">Filament:</span>
        <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg p-1 shadow-xs">
          {FILAMENT_COLORS.map((c) => {
            const isSelected = settings.activeColor.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => onUpdateSettings({ activeColor: c.hex })}
                className={`w-5 h-5 rounded-full transition-transform relative border border-black/15 ${
                  isSelected ? 'scale-115 ring-2 ring-slate-900 ring-offset-2 ring-offset-white' : 'hover:scale-105 opacity-85 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            );
          })}
        </div>

        {/* Painted Marks indicator: Color all of it first! */}
        {coloredMarksCount > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 shadow-xs animate-fadeIn">
            <span className="text-[11px] font-semibold text-slate-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 animate-pulse" />
              <span>{coloredMarksCount} {coloredMarksCount === 1 ? 'Mark' : 'Marks'}</span>
            </span>

            <div className="flex items-center gap-0.5">
              {coloredMarksColors.slice(0, 4).map((clr, idx) => (
                <div
                  key={idx}
                  className="w-2.5 h-2.5 rounded-full border border-black/20"
                  style={{ backgroundColor: clr }}
                />
              ))}
            </div>

            <div className="h-3 w-[1px] bg-slate-300 mx-0.5" />

            <button
              type="button"
              onClick={onUndoLastMark}
              className="p-0.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
              title="Undo last painted mark"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onClearAllMarks}
              className="p-0.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 rounded transition-colors"
              title="Clear all painted marks"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Zone 3: Actions (Split CTA, Import STL/3MF, Export STLs, Reset) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSplitPart}
          disabled={!canSplit}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all whitespace-nowrap ${
            canSplit
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-orange-500/25 active:scale-97 cursor-pointer'
              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
          title={canSplit ? `Cut & split ${coloredMarksCount} colored parts into solid bodies` : 'Color the model first with marker, fill, or stamps'}
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>{coloredMarksCount > 1 ? `Split ${coloredMarksCount} Colors` : 'Split Colors'}</span>
        </button>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Hidden File Input accepting STL and 3MF */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.3mf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Import STL / 3MF */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition-colors"
          title="Import STL or precolored multi-body 3MF file"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-600" />
          <span className="hidden md:inline">Import STL / 3MF</span>
        </button>

        {/* Export STLs */}
        <button
          type="button"
          onClick={onExportAll}
          disabled={partsCount === 0}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            partsCount > 0
              ? 'text-cyan-800 hover:text-cyan-900 bg-cyan-50 hover:bg-cyan-100 border-cyan-200 shadow-xs'
              : 'text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed'
          }`}
          title="Export all solid parts as zipped binary STLs"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Export STLs</span>
        </button>

        {/* Reset Model */}
        <button
          type="button"
          onClick={onResetModel}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
          title="Reset model"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
