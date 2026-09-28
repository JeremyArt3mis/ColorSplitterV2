/**
 * Progress Modal for Wasm Loading & Boolean CSG Operations
 */
import React from 'react';
import { AppProgress } from '../types';
import { Cpu, ShieldCheck } from 'lucide-react';

interface ProgressModalProps {
  progress: AppProgress;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({ progress }) => {
  if (!progress.active) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-[380px] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 relative overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              {progress.title}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Manifold-3D WebAssembly CSG Kernel
            </p>
          </div>
        </div>

        {/* Step label */}
        <div className="flex items-center justify-between text-xs text-slate-300 font-mono mb-2">
          <span className="truncate pr-2">{progress.step}</span>
          <span className="text-cyan-400 font-semibold">{Math.round(progress.percent)}%</span>
        </div>

        {/* Animated Progress Bar */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-4 p-[1px]">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-orange-400 to-amber-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.max(5, Math.min(100, progress.percent))}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950/60 rounded-lg px-3 py-2 border border-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Guaranteeing 100% watertight 2-manifold solid topology</span>
        </div>
      </div>
    </div>
  );
};
