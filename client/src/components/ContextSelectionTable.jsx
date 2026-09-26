import React, { useState } from 'react';
import { Sliders, FileCode, ChevronDown, ChevronUp } from 'lucide-react';

export default function ContextSelectionTable({ rankedContext }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedPath, setExpandedPath] = useState(null);

  const scoredFiles = rankedContext?.scoredFiles || [];

  const selectedCount = scoredFiles.filter(f => f.decision !== 'AVOID').length;
  const displayFiles = showAll ? scoredFiles : scoredFiles.slice(0, 5);
  const remainingCount = scoredFiles.length - 5;

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">
            Context Selection
          </h3>
        </div>
        <div className="px-2.5 py-0.5 rounded-full bg-slate-800 text-[11px] font-semibold text-slate-300 border border-slate-700">
          {selectedCount} files selected
        </div>
      </div>

      {scoredFiles.length === 0 ? (
        <div className="flex-1 py-12 text-center text-xs text-slate-500">
          No context selection data available yet. Run a task to see ranked files.
        </div>
      ) : <>
        <div className="grid grid-cols-12 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 px-2 border-b border-slate-800/60">
          <div className="col-span-7">File</div>
          <div className="col-span-3 text-center">Relevance</div>
          <div className="col-span-2 text-right">Tokens</div>
        </div>

        <div className="space-y-1.5 py-2 flex-1 overflow-y-auto max-h-[300px]">
        {displayFiles.map((file) => {
          const isSelected = file.decision !== 'AVOID';
          const score = file.relevanceScore;
          const isExpanded = expandedPath === file.path;

          return (
            <div key={file.path} className="space-y-1">
              <div
                onClick={() => setExpandedPath(isExpanded ? null : file.path)}
                className={`grid grid-cols-12 items-center px-2 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                  isSelected ? 'bg-slate-900/60 hover:bg-slate-900 text-slate-200' : 'bg-transparent hover:bg-slate-900/30 text-slate-400 opacity-70'
                }`}
              >
                {/* File with Checkbox */}
                <div className="col-span-7 flex items-center gap-2 min-w-0 pr-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="rounded border-slate-700 text-blue-500 focus:ring-0 bg-slate-800 cursor-pointer"
                  />
                  <FileCode className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span className="font-mono text-[11px] truncate" title={file.path}>
                    {file.path}
                  </span>
                </div>

                {/* Relevance Bar & Percentage */}
                <div className="col-span-3 flex items-center gap-2 px-1">
                  <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-slate-600'}`}
                      style={{ width: `${score || 0}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] font-medium text-slate-300 w-8 text-right">
                    {score === undefined ? '—' : `${score}%`}
                  </span>
                </div>

                {/* Tokens */}
                <div className="col-span-2 text-right font-mono text-[11px] text-slate-400">
                  {file.tokens === undefined ? '—' : file.tokens}
                </div>
              </div>

              {/* Explainable Reasons Drawer */}
              {isExpanded && (
                <div className="px-3 py-2 ml-6 rounded-lg bg-[#070b14] border border-slate-800/80 text-[11px] text-slate-300 space-y-1 font-mono">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Reason for {isSelected ? 'Inclusion' : 'Exclusion'}:
                  </div>
                  {file.reasons && file.reasons.length > 0 ? (
                    file.reasons.map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-slate-300">
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span>{r}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">
                      No explanation provided by the context engine.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
        {remainingCount > 0 && (
          <div className="pt-2 text-center border-t border-slate-800/80">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 font-medium transition-colors"
            >
              <span>{showAll ? 'Show fewer files' : `Show more files (${remainingCount})`}</span>
              {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </>}
    </div>
  );
}
