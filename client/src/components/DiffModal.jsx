import React from 'react';
import { X, GitCompare, FileCode } from 'lucide-react';

export default function DiffModal({ isOpen, onClose, diffData }) {
  if (!isOpen) return null;

  const fileDiffs = diffData?.fileDiffs || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Inspected Git Diff</h2>
              <p className="text-xs text-slate-400">
                Evidence verified by ForgeLoop Harness
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 my-4 space-y-4 pr-1">
          {fileDiffs.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No file changes were recorded for this run.</p>
          ) : fileDiffs.map((fd, i) => {
            const lines = (fd.diff || '').split('\n');

            return (
              <div key={i} className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-[#0a0f1d] px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-mono font-semibold text-slate-200">{fd.file}</span>
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-emerald-400 font-bold">+{fd.added}</span>{' '}
                    <span className="text-rose-400 font-bold">-{fd.removed}</span>
                  </div>
                </div>

                <div className="bg-[#060a14] p-3.5 overflow-x-auto max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed">
                  {lines.map((line, lineIdx) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++');
                    const isRemove = line.startsWith('-') && !line.startsWith('---');
                    const isHeader = line.startsWith('@@');

                    return (
                      <div
                        key={lineIdx}
                        className={`whitespace-pre px-2 py-0.5 rounded-sm ${
                          isAdd
                            ? 'bg-emerald-950/40 text-emerald-300 font-medium'
                            : isRemove
                            ? 'bg-rose-950/40 text-rose-300 line-through opacity-80'
                            : isHeader
                            ? 'text-indigo-400 font-bold bg-indigo-950/20'
                            : 'text-slate-400'
                        }`}
                      >
                        {line || ' '}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="text-slate-400">
            {fileDiffs.length ? `${diffData.totalFilesChanged ?? fileDiffs.length} file(s) changed in this run` : 'No diff evidence recorded'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
