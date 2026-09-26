import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, ChevronDown, ChevronUp, Terminal, FileCode, Check } from 'lucide-react';

export default function VerificationPanel({ verification, isRunning }) {
  const [showRawOutput, setShowRawOutput] = useState(false);

  if (!verification) {
    return (
      <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col justify-center items-center text-center h-full">
        <ShieldCheck className="w-10 h-10 text-slate-700 mb-3" />
        <h4 className="text-sm font-semibold text-slate-400">Verification Engine Pending</h4>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Evidence-based verification executes automated test suites, inspects git diffs, and validates changes before issuing a completion certificate.
        </p>
      </div>
    );
  }

  const { verified, checklist = [], evidence = {}, summary } = verification;

  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${verified ? 'text-emerald-400' : 'text-amber-400'}`} />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Evidence-Based Self-Verification
          </h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wide border flex items-center gap-1.5 ${
            verified
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          }`}
        >
          {verified ? (
            <>
              <Check className="w-3.5 h-3.5" />
              TASK VERIFIED ✓
            </>
          ) : (
            'VERIFICATION FAILED'
          )}
        </span>
      </div>

      {/* Checklist */}
      <div className="space-y-2 mb-4">
        {checklist.map((item) => {
          const isPass = item.status === 'PASS';
          return (
            <div
              key={item.id}
              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                isPass
                  ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-200'
                  : 'bg-rose-950/20 border-rose-800/30 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {isPass ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-medium text-slate-200">{item.label}</span>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-black/30">
                {item.detail}
              </span>
            </div>
          );
        })}
      </div>

      {/* Raw Execution Evidence Box */}
      <div className="bg-[#090e1a] rounded-lg border border-slate-800 p-3 font-mono text-xs text-slate-300">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            Execution Evidence
          </span>
          <button
            onClick={() => setShowRawOutput(!showRawOutput)}
            className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            {showRawOutput ? 'Collapse raw log' : 'Expand full output'}
            {showRawOutput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="space-y-2">
          <div className="p-2 rounded bg-black/50 border border-slate-800/60">
            <div className="text-emerald-400 font-semibold mb-1">$ npm test</div>
            <div className="text-slate-300">
              {evidence.tests?.passedCount} passed, {evidence.tests?.failedCount} failed ({evidence.tests?.totalCount} total)
            </div>
            {showRawOutput && evidence.tests?.rawOutput && (
              <pre className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {evidence.tests.rawOutput}
              </pre>
            )}
          </div>

          <div className="p-2 rounded bg-black/50 border border-slate-800/60">
            <div className="text-blue-400 font-semibold mb-1">$ git diff --stat</div>
            <div className="text-slate-300">
              {evidence.gitDiff?.totalFilesChanged} files changed
            </div>
            {evidence.gitDiff?.fileDiffs && (
              <div className="mt-1 space-y-0.5">
                {evidence.gitDiff.fileDiffs.map((fd, i) => (
                  <div key={i} className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="text-slate-300">{fd.file}</span>
                    <span className="text-emerald-400 font-mono">+{fd.added} -{fd.removed}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
