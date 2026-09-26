import React from 'react';
import { 
  Layers, 
  FileText, 
  Folder, 
  Wrench, 
  Search, 
  FileCode, 
  FastForward, 
  Zap
} from 'lucide-react';

export default function TokenEfficiencyCard({ tokenMetrics }) {
  if (!tokenMetrics) {
    return (
      <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
        <h3 className="text-sm font-bold text-white tracking-tight">Token Efficiency</h3>
        <p className="mt-4 text-xs text-slate-400">No run token measurements available yet.</p>
      </div>
    );
  }

  const metrics = tokenMetrics;

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800/80">
        <Layers className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-bold text-white tracking-tight">
          Token Efficiency
        </h3>
      </div>
      <p className="mb-3 text-[10px] text-slate-400">
        {metrics.usageType === 'provider' ? 'Provider-reported usage is available; context figures are estimates.' : 'All token figures are internal estimates; provider usage was not reported.'}
      </p>

      {/* Top 4 Metric Cards */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {/* Task tokens */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Task tokens</span>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-white">
              {metrics.taskTokens.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Context tokens */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Context tokens</span>
          <div className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-white">
              {metrics.contextTokens.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Recovery tokens */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Recovery tokens</span>
          <div className="flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-white">
              {metrics.recoveryTokens.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Total tokens */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Estimated total</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs font-bold">∑</span>
            <span className="font-mono text-sm font-bold text-white">
              {metrics.totalTokens.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom 4 Metric Cards */}
      <div className="grid grid-cols-4 gap-2">
        {/* Files searched */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Files searched</span>
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-white">
              {metrics.filesSearched}
            </span>
          </div>
        </div>

        {/* Files read */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Files read</span>
          <div className="flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-white">
              {metrics.filesRead}
            </span>
          </div>
        </div>

        {/* Files avoided */}
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-[10px] text-slate-400 block mb-1">Files avoided</span>
          <div className="flex items-center gap-1.5">
            <FastForward className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-white">
              {metrics.filesAvoided}
            </span>
          </div>
        </div>

        {/* Provider-reported usage */}
        <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-2.5 flex flex-col justify-between">
          <span className="text-[10px] font-semibold text-emerald-400 block mb-1">Provider tokens</span>
          <div className="flex items-center gap-1 text-emerald-400 font-mono font-bold text-sm">
            <Zap className="w-3.5 h-3.5" />
            <span>{metrics.providerTotalTokens ? metrics.providerTotalTokens.toLocaleString() : 'Not reported'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
