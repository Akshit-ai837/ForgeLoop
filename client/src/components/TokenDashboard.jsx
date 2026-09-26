import React from 'react';
import { Zap, TrendingDown, Layers, FileCheck, RefreshCw, BarChart } from 'lucide-react';

export default function TokenDashboard({ tokenMetrics }) {
  const metrics = tokenMetrics || {
    taskTokens: 0,
    contextTokens: 0,
    recoveryTokens: 0,
    verificationTokens: 0,
    totalTokens: 0,
    contextReused: 0,
    filesSearched: 0,
    filesRead: 0,
    filesAvoided: 0,
    recoveryAttempts: 0,
    baselineTotalTokens: 0,
    tokensSaved: 0,
    savingsPercent: 0
  };

  const total = metrics.totalTokens || 1; // avoid divide by zero
  const taskPct = Math.round((metrics.taskTokens / total) * 100) || 0;
  const contextPct = Math.round((metrics.contextTokens / total) * 100) || 0;
  const recoveryPct = Math.round((metrics.recoveryTokens / total) * 100) || 0;
  const verifyPct = Math.round((metrics.verificationTokens / total) * 100) || 0;

  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Token Efficiency Dashboard
          </h3>
        </div>
        {metrics.savingsPercent > 0 && (
          <span className="flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <TrendingDown className="w-3.5 h-3.5" />
            {metrics.savingsPercent}% Less Tokens vs Baseline
          </span>
        )}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#121c36] p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Total Tokens</span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {metrics.totalTokens.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500">Actual execution count</span>
        </div>

        <div className="bg-[#121c36] p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Files Avoided</span>
          <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
            {metrics.filesAvoided}
          </span>
          <span className="text-[10px] text-slate-500">Filtered before reading</span>
        </div>

        <div className="bg-[#121c36] p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Context Reused</span>
          <span className="text-xl font-bold font-mono text-blue-400 mt-1 block">
            {metrics.contextReused.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500">Cached tokens saved</span>
        </div>

        <div className="bg-[#121c36] p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Recovery Turns</span>
          <span className="text-xl font-bold font-mono text-purple-400 mt-1 block">
            {metrics.recoveryAttempts}
          </span>
          <span className="text-[10px] text-slate-500">Targeted repair attempts</span>
        </div>
      </div>

      {/* Visual Token Distribution Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>Token Composition</span>
          <span className="font-mono text-slate-300">{metrics.totalTokens} tokens</span>
        </div>
        <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
          <div style={{ width: `${taskPct}%` }} className="bg-blue-500 h-full" title={`Task: ${taskPct}%`} />
          <div style={{ width: `${contextPct}%` }} className="bg-emerald-500 h-full" title={`Context: ${contextPct}%`} />
          <div style={{ width: `${recoveryPct}%` }} className="bg-purple-500 h-full" title={`Recovery: ${recoveryPct}%`} />
          <div style={{ width: `${verifyPct}%` }} className="bg-amber-500 h-full" title={`Verification: ${verifyPct}%`} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span> Task ({taskPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Context ({contextPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span> Recovery ({recoveryPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Verification ({verifyPct}%)
          </span>
        </div>
      </div>

      {/* Actual Measured Metrics Table */}
      <div className="bg-[#0b1020] rounded-lg p-3 border border-slate-800/80 font-mono text-xs text-slate-300 space-y-1.5">
        <div className="flex justify-between pb-1 border-b border-slate-800 text-slate-400 font-semibold">
          <span>Metric</span>
          <span>Actual Measured Value</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Task tokens:</span>
          <span className="text-white font-medium">{metrics.taskTokens}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Context tokens:</span>
          <span className="text-white font-medium">{metrics.contextTokens}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Recovery tokens:</span>
          <span className="text-white font-medium">{metrics.recoveryTokens}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Verification tokens:</span>
          <span className="text-white font-medium">{metrics.verificationTokens}</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-slate-800 text-blue-300 font-semibold">
          <span>Total tokens:</span>
          <span>{metrics.totalTokens}</span>
        </div>
        <div className="pt-2 text-[11px] text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Files searched:</span>
            <span className="text-slate-300">{metrics.filesSearched}</span>
          </div>
          <div className="flex justify-between">
            <span>Files actually read:</span>
            <span className="text-slate-300">{metrics.filesRead}</span>
          </div>
          <div className="flex justify-between">
            <span>Files avoided:</span>
            <span className="text-emerald-400 font-semibold">{metrics.filesAvoided}</span>
          </div>
          <div className="flex justify-between">
            <span>Recovery attempts:</span>
            <span className="text-slate-300">{metrics.recoveryAttempts}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
