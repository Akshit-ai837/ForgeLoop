import React from 'react';
import { AlertOctagon, Wrench, ArrowRight, ShieldAlert, Cpu } from 'lucide-react';

export default function FailureMemoryCard({ failureMemory = [] }) {
  if (!failureMemory || failureMemory.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#150f24] border border-purple-500/40 rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-900/40">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wider">
            Structured Failure Memory & Targeted Recovery
          </h3>
        </div>
        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/50">
          {failureMemory.length} Recovery Cycle(s) Recorded
        </span>
      </div>

      <div className="space-y-3">
        {failureMemory.map((fail, idx) => (
          <div
            key={fail.id || idx}
            className="bg-[#0f091c] rounded-lg p-3.5 border border-purple-800/40 text-xs font-mono"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                Attempt {fail.attempt} • {fail.type}
              </span>
              <span className="text-slate-400 text-[11px]">{fail.file}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 my-2 text-slate-300">
              <div className="bg-black/30 p-2 rounded">
                <span className="text-slate-500 block text-[10px] uppercase">Failing Test Case:</span>
                <span className="text-rose-400 font-semibold">{fail.test}</span>
              </div>
              <div className="bg-black/30 p-2 rounded">
                <span className="text-slate-500 block text-[10px] uppercase">Assertion Mismatch:</span>
                <span className="text-amber-300">Expected: {fail.expected} | Got: {fail.received}</span>
              </div>
            </div>

            <div className="bg-purple-950/30 p-2 rounded border border-purple-900/30 text-purple-200 mt-2">
              <span className="text-purple-400 block text-[10px] uppercase font-bold">Likely Root Cause Area:</span>
              <span>{fail.likely_area}</span>
            </div>

            {/* Token-efficient recovery note */}
            <div className="mt-2.5 pt-2 border-t border-purple-900/40 text-[11px] text-slate-400 flex items-center gap-1.5 font-sans">
              <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>
                <strong>Token Efficiency Safeguard:</strong> Re-sent ONLY task + failure info + target function snippet (avoided resending full conversation & repo).
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
