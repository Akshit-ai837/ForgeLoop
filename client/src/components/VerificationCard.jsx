import React from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';

export default function VerificationCard({ verification, onOpenDiff }) {
  if (!verification) {
    return (
      <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
        <h3 className="text-sm font-bold text-white tracking-tight">Verification</h3>
        <p className="mt-4 text-xs text-slate-400">No verification result available yet.</p>
      </div>
    );
  }

  const tests = verification.evidence?.tests;
  const gitDiff = verification.evidence?.gitDiff;
  const fileCount = gitDiff?.totalFilesChanged;

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800/80">
        <ShieldCheck className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-bold text-white tracking-tight">
          Verification
        </h3>
      </div>

      <div className="space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between text-slate-300">
          <span>Verification</span>
          <span className={verification.verified ? 'text-emerald-400' : 'text-rose-400'}>
            {verification.verified ? 'Verified' : 'Failed'}
          </span>
        </div>
        {tests && <div className="flex items-center justify-between text-slate-300">
          <span>Tests</span>
          <span>{tests.passedCount}/{tests.totalCount} passed ({tests.failedCount} failed)</span>
        </div>}
        {fileCount !== undefined && <div className="flex items-center justify-between text-slate-300">
          <span>Git diff</span>
          <span>{fileCount} files changed</span>
        </div>}
        {verification.summary && <p className="font-sans text-xs text-slate-400">{verification.summary}</p>}
        {gitDiff && (
          <button
            onClick={onOpenDiff}
            className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
          >
            <span>View Diff</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
