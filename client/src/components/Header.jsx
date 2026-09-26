import React from 'react';
import { Cpu, Activity, ShieldCheck, Zap, RefreshCw } from 'lucide-react';

export default function Header({ state, isConnected, onReset, isResetting }) {
  const getStateColor = (s) => {
    switch (s) {
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'FAILED':
      case 'BLOCKED_NEEDS_REVIEW':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      case 'TESTING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'FAILURE_ANALYSIS':
      case 'RECOVERING':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40 animate-pulse';
      case 'IMPLEMENTING':
      case 'SEARCHING':
      case 'PLANNING':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <header className="border-b border-slate-800/80 bg-[#0c1222]/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-xl tracking-tight text-white flex items-center gap-1.5">
              Forge<span className="text-blue-400 font-extrabold">Loop</span>
            </span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Autonomous Harness MVP
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Token-Efficient Context • Failure Recovery • Evidence-Based Self-Verification
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Reset Repos button */}
        <button
          onClick={onReset}
          disabled={isResetting}
          title="Reset demo repos to clean unpatched state"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700/80 hover:border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
          <span>Reset Repos</span>
        </button>

        {/* Live SSE status */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
          <span className="text-slate-400">{isConnected ? 'Harness Live' : 'Disconnected'}</span>
        </div>

        {/* State Badge */}
        <div className={`px-3.5 py-1 rounded-lg border text-xs font-mono font-semibold tracking-wide flex items-center gap-2 ${getStateColor(state)}`}>
          <Activity className="w-3.5 h-3.5" />
          <span>{state}</span>
        </div>
      </div>
    </header>
  );
}
