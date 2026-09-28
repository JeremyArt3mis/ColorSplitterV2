/**
 * Right Sidebar Component
 * Houses Inlay & Color Parameters, 3D Model Presets, and Parts List
 */
import React from 'react';
import {
  Sliders,
  Layers,
  Eye,
  EyeOff,
  Download,
  Box,
  ShieldCheck,
  Disc,
  Hexagon,
  Key,
  Cylinder,
  Brush,
  PaintBucket
} from 'lucide-react';
import {
  SplitPart,
  SplitSettings,
  PresetType
} from '../types';
import { FILAMENT_COLORS } from './HeaderBar';

interface RightSidebarProps {
  settings: SplitSettings;
  onUpdateSettings: (patch: Partial<SplitSettings>) => void;
  parts: SplitPart[];
  onTogglePartVisibility: (id: string) => void;
  onChangePartColor: (id: string, color: string) => void;
  onDownloadPart: (part: SplitPart) => void;
  currentPreset: PresetType;
  onSelectPreset: (preset: PresetType) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  settings,
  onUpdateSettings,
  parts,
  onTogglePartVisibility,
  onChangePartColor,
  onDownloadPart,
  currentPreset,
  onSelectPreset
}) => {
  return (
    <aside className="w-80 bg-slate-950/95 border-l border-slate-800/80 flex flex-col h-full z-20 shrink-0 select-none overflow-hidden backdrop-blur-sm">
      {/* Top Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Split & Inlay Parameters
          </h2>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
          <ShieldCheck className="w-3 h-3" />
          <span>Watertight</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ================= COLOR INLAYS PARAMETERS ================= */}
        <div className="space-y-4">
          {/* Fill & Marker Inlay Settings */}
          <div className="space-y-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            {/* Fill Angle & Size Settings */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <PaintBucket className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Fill Angle ({settings.fillAngle}°) & Size</span>
                </span>
                <span className="font-mono text-emerald-400 font-semibold text-xs">
                  {settings.fillSize.toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="8.0"
                step="0.5"
                value={settings.fillSize}
                onChange={(e) => onUpdateSettings({ fillSize: parseFloat(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
              {/* Angle quick pills */}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-slate-500 mr-1">Angle:</span>
                {[0, 30, 45, 60, 90, 135].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => onUpdateSettings({ fillAngle: deg })}
                    className={`flex-1 py-0.5 text-[10px] rounded transition-colors ${
                      settings.fillAngle === deg
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            {/* Marker Stroke Width */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Brush className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Marker Stroke Width</span>
                </span>
                <span className="font-mono text-cyan-400 font-semibold text-xs">
                  {settings.markerWidth.toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="8.0"
                step="0.5"
                value={settings.markerWidth}
                onChange={(e) => onUpdateSettings({ markerWidth: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
            </div>

            {/* Inlay Depth */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">Inlay Depth</span>
                <span className="font-mono text-cyan-400 font-semibold text-xs">
                  {settings.inlayDepth.toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min="0.6"
                max="3.0"
                step="0.1"
                value={settings.inlayDepth}
                onChange={(e) => onUpdateSettings({ inlayDepth: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
            </div>

            {/* Fit Tolerance */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">Fit Tolerance Gap</span>
                <span className="font-mono text-amber-400 font-semibold text-xs">
                  {settings.fitTolerance.toFixed(2)} mm
                </span>
              </div>
              <input
                type="range"
                min="0.00"
                max="0.30"
                step="0.02"
                value={settings.fitTolerance}
                onChange={(e) => onUpdateSettings({ fitTolerance: parseFloat(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
            </div>
          </div>

          {/* Model Presets */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Box className="w-3.5 h-3.5 text-orange-400" />
              <span>3D Model Presets</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSelectPreset('coaster')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                  currentPreset === 'coaster'
                    ? 'bg-slate-800 border-cyan-500/60 text-white shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Disc className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-medium truncate">Coaster</div>
                  <div className="text-[10px] text-slate-500 font-mono">48mm Round</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSelectPreset('badge')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                  currentPreset === 'badge'
                    ? 'bg-slate-800 border-cyan-500/60 text-white shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Hexagon className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-medium truncate">Hex Badge</div>
                  <div className="text-[10px] text-slate-500 font-mono">42mm Token</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSelectPreset('keyfob')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                  currentPreset === 'keyfob'
                    ? 'bg-slate-800 border-cyan-500/60 text-white shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Key className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-medium truncate">Key Fob</div>
                  <div className="text-[10px] text-slate-500 font-mono">Pill w/ Hole</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSelectPreset('cylinder')}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                  currentPreset === 'cylinder'
                    ? 'bg-slate-800 border-cyan-500/60 text-white shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Cylinder className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-medium truncate">Cylinder</div>
                  <div className="text-[10px] text-slate-500 font-mono">40mm Puck</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Parts List (Always accessible) */}
        <div>
          <div className="flex items-center justify-between mb-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Solid Bodies ({parts.length})</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400 normal-case">
              {parts.filter((p) => p.type === 'inlay').length} Inlays
            </span>
          </div>

          <div className="space-y-2">
            {parts.map((part) => (
              <div
                key={part.id}
                className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3 space-y-2.5 transition-colors hover:border-slate-700/80"
              >
                {/* Part Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative group">
                      <div
                        className="w-4 h-4 rounded-full border border-white/20 shadow cursor-pointer transition-transform group-hover:scale-110"
                        style={{ backgroundColor: part.color }}
                        title="Click to change part filament color"
                      />
                      <input
                        type="color"
                        value={part.color}
                        onChange={(e) => onChangePartColor(part.id, e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>

                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-200 truncate block">
                        {part.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTogglePartVisibility(part.id)}
                      className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                        part.visible ? 'text-slate-300' : 'text-slate-600'
                      }`}
                      title={part.visible ? 'Hide part' : 'Show part'}
                    >
                      {part.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDownloadPart(part)}
                      className="p-1 rounded text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                      title="Download binary .stl for this part"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Quick Color Swatches Row */}
                <div className="flex items-center gap-1.5 pt-1">
                  {FILAMENT_COLORS.slice(0, 7).map((fc) => (
                    <button
                      key={fc.hex}
                      type="button"
                      onClick={() => onChangePartColor(part.id, fc.hex)}
                      className={`w-3.5 h-3.5 rounded-full border border-black/30 transition-transform ${
                        part.color.toLowerCase() === fc.hex.toLowerCase() ? 'scale-125 ring-1 ring-white' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: fc.hex }}
                      title={fc.name}
                    />
                  ))}
                </div>

                {/* Part Metrics */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>{part.triangleCount.toLocaleString()} tris</span>
                  <span>{part.volume > 0 ? `${part.volume.toFixed(1)} mm³` : '< 1 mm³'}</span>
                  <span className="text-[10px] text-emerald-400 font-sans">Watertight</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
