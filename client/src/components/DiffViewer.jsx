import React, { useState } from 'react';
import { GitCompare, FileCode, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function DiffViewer({ diffData }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!diffData || !diffData.fileDiffs || diffData.fileDiffs.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Verified Git Diff Inspection
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
            {diffData.totalFilesChanged} File(s) Modified
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {diffData.fileDiffs.map((fd, i) => {
            const lines = fd.diff.split('\n');

            return (
              <div key={i} className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="bg-[#121c36] px-3.5 py-2 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-mono font-semibold text-slate-200">{fd.file}</span>
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-emerald-400 font-bold">+{fd.added}</span>{' '}
                    <span className="text-rose-400 font-bold">-{fd.removed}</span>
                  </div>
                </div>

                <div className="bg-[#090d16] p-3 overflow-x-auto max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed">
                  {lines.map((line, lineIdx) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++');
                    const isRemove = line.startsWith('-') && !line.startsWith('---');
                    const isHeader = line.startsWith('@@');

                    return (
                      <div
                        key={lineIdx}
                        className={`whitespace-pre px-1.5 py-0.5 rounded-sm ${
                          isAdd
                            ? 'bg-emerald-950/40 text-emerald-300 font-medium'
                            : isRemove
                            ? 'bg-rose-950/40 text-rose-300 line-through opacity-80'
                            : isHeader
                            ? 'text-indigo-400 font-bold bg-indigo-950/30'
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
      )}
    </div>
  );
}
