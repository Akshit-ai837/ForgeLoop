import React from 'react';
import { X, BarChart3, TrendingDown, Layers, Zap, CheckCircle2 } from 'lucide-react';

export default function BenchmarkModal({ isOpen, onClose, benchmarkData }) {
  if (!isOpen || !benchmarkData) return null;

  const { baseline, forgeLoop, savings, task } = benchmarkData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0e1628] border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/60"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Token Efficiency Benchmark</h2>
            <p className="text-xs text-slate-400">
              Direct empirical comparison between Naive Repository Context vs. ForgeLoop Context Engine
            </p>
          </div>
        </div>

        <div className="bg-[#0a0f1d] p-3 rounded-lg border border-slate-800 mb-5 font-mono text-xs text-slate-300">
          <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">Evaluated Task:</span>
          <span className="text-blue-300">"{task}"</span>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* Baseline Card */}
          <div className="bg-[#121727] p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Baseline Architecture
              </span>
              <h4 className="text-sm font-semibold text-slate-200 mb-2">
                Naive Full Repository Dump
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                Repeatedly sends the entire repository and test suites into prompt context without selective ranking.
              </p>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Repository Files:</span>
                <span className="text-slate-200">{baseline.allFilesCount} files</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Context per Turn:</span>
                <span className="text-slate-200">{baseline.contextTokensPerTurn.toLocaleString()} tok</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Estimated Turns:</span>
                <span className="text-slate-200">{baseline.turnsEstimated} turns</span>
              </div>
              <div className="flex justify-between text-amber-400 font-bold pt-1 border-t border-slate-800/80">
                <span>Total Context:</span>
                <span>{baseline.totalTokens.toLocaleString()} tokens</span>
              </div>
            </div>
          </div>

          {/* ForgeLoop Card */}
          <div className="bg-[#101c3d] p-4 rounded-xl border border-blue-500/40 flex flex-col justify-between relative shadow-lg shadow-blue-500/10">
            <div className="absolute -top-2.5 right-3 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
              ForgeLoop Engine
            </div>

            <div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block mb-1">
                Targeted Harness
              </span>
              <h4 className="text-sm font-semibold text-white mb-2">
                Selective Context + Slicing
              </h4>
              <p className="text-xs text-slate-300 mb-4">
                Searches symbols first, scores relevance, extracts specific function slices, and isolates failure memory.
              </p>
            </div>

            <div className="space-y-2 pt-3 border-t border-blue-900/60 text-xs font-mono">
              <div className="flex justify-between text-slate-300">
                <span>Files Avoided:</span>
                <span className="text-emerald-400 font-bold">{forgeLoop.filesAvoided} files</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Files Targeted:</span>
                <span className="text-blue-300">{forgeLoop.filesSelected} files</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Context per Turn:</span>
                <span className="text-blue-200">{forgeLoop.contextTokensPerTurn.toLocaleString()} tok</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold pt-1 border-t border-blue-900/80">
                <span>Total Context:</span>
                <span>{forgeLoop.totalTokens.toLocaleString()} tokens</span>
              </div>
            </div>
          </div>
        </div>

        {/* Empirical Savings Summary */}
        <div className="bg-gradient-to-r from-emerald-950/40 to-blue-950/40 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Empirical Token Reduction:</span>
                <span className="text-emerald-400 font-mono text-base">{savings.savingsPercent}% Savings</span>
              </div>
              <p className="text-xs text-slate-400">
                Actual measured difference: {savings.tokensSaved.toLocaleString()} fewer tokens transferred ({savings.ratio} efficiency multiplier)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
