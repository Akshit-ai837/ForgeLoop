import React from 'react';
import { Check, Loader2, AlertCircle, CircleDot } from 'lucide-react';

export default function StatePipeline({ progressSteps = [], currentState }) {
  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Agent Lifecycle & Self-Verification Pipeline
        </h3>
        <span className="text-xs text-blue-400 font-mono">
          State: <span className="font-bold text-white">{currentState}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {progressSteps.map((step, idx) => {
          const isDone = step.status === 'done';
          const isActive = step.status === 'active';
          const isFailed = step.status === 'failed';

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between transition-all duration-300 ${
                isActive
                  ? 'bg-blue-600/15 border-blue-500/60 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/30'
                  : isDone
                  ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                  : isFailed
                  ? 'bg-rose-950/30 border-rose-800/60 text-rose-300'
                  : 'bg-slate-900/40 border-slate-800/60 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono text-slate-400 font-medium">0{idx + 1}</span>
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                ) : isFailed ? (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <CircleDot className="w-3 h-3 text-slate-600" />
                )}
              </div>
              <span className={`font-medium line-clamp-2 ${isActive ? 'text-blue-200 font-semibold' : ''}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
