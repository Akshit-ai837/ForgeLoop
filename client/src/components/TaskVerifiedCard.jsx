import React from 'react';
import { Check, ExternalLink, RotateCcw, Wrench, Loader2 } from 'lucide-react';

export default function TaskVerifiedCard({ onOpenDiff, onRunAgain, currentState, isRunning, verification }) {
  const isRecovering = currentState === 'FAILURE_ANALYSIS' || currentState === 'RECOVERING';
  const isComplete = currentState === 'COMPLETED';
  const isFailed = currentState === 'FAILED' || currentState === 'BLOCKED_NEEDS_REVIEW';

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col items-center justify-between text-center h-full">
      <div className="flex flex-col items-center justify-center my-auto">
        {isRecovering ? (
          <>
            <div className="w-14 h-14 rounded-full bg-purple-500/10 border-2 border-purple-500/40 flex items-center justify-center text-purple-400 mb-3 shadow-lg shadow-purple-500/20 ring-4 ring-purple-500/10 animate-pulse">
              <Wrench className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-purple-400 tracking-wide uppercase mb-1">
              RECOVERING FROM FAILURE
            </h3>
            <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
              Targeted failure diagnosis active. Applying minimal repair patch...
            </p>
          </>
        ) : isRunning ? (
          <>
            <div className="w-14 h-14 rounded-full bg-blue-500/10 border-2 border-blue-500/40 flex items-center justify-center text-blue-400 mb-3 shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-base font-extrabold text-blue-400 tracking-wide uppercase mb-1">
              SELF-VERIFYING...
            </h3>
            <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
              Running automated test suite, inspecting git diff, and proving completion.
            </p>
          </>
        ) : isFailed ? (
          <>
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center text-rose-400 mb-3">
              <Wrench className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-rose-400 tracking-wide uppercase mb-1">
              TASK NOT COMPLETED
            </h3>
            <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
              The run did not complete successfully or verification failed.
            </p>
          </>
        ) : isComplete ? (
          verification?.status === 'IMPLEMENTATION_NOT_VERIFIED' || (verification?.evidence?.gitDiff?.totalFilesChanged === 0) ? (
            <>
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mb-3 shadow-lg shadow-amber-500/20 ring-4 ring-amber-500/10">
                <Wrench className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-amber-400 tracking-wide uppercase mb-1">
                IMPLEMENTATION NOT VERIFIED
              </h3>
              <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
                No code changes were produced or verified for this task.
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-500/20 ring-4 ring-emerald-500/10">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>
              <h3 className="text-base font-extrabold text-emerald-400 tracking-wide uppercase mb-1">
                TASK VERIFIED
              </h3>
              <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
                The implementation is complete and all checks passed.
              </p>
            </>
          )
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-400 mb-3">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-300 tracking-wide uppercase mb-1">
              READY
            </h3>
            <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
              Run a task to see its verification status here.
            </p>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 w-full pt-3 border-t border-slate-800/80">
        <button
          onClick={onOpenDiff}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-md shadow-blue-600/25 transition-all"
        >
          <span>View Changes</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onRunAgain}
          disabled={isRunning}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl bg-[#0a0f1d] hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-all disabled:opacity-40"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-slate-400 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Running...' : 'Run Again'}</span>
        </button>
      </div>
    </div>
  );
}
