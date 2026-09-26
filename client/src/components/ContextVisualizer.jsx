import React from 'react';
import { Layers, FileCode, CheckCircle2, XCircle, Info, Sparkles } from 'lucide-react';

export default function ContextVisualizer({ rankedContext }) {
  if (!rankedContext || !rankedContext.scoredFiles || rankedContext.scoredFiles.length === 0) {
    return (
      <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm h-full flex flex-col justify-center items-center text-center">
        <Layers className="w-10 h-10 text-slate-700 mb-3" />
        <h4 className="text-sm font-semibold text-slate-400">Context Engine Idle</h4>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          When you click "RUN AGENT", ForgeLoop will search before reading, score relevance, and extract only necessary slices.
        </p>
      </div>
    );
  }

  const { scoredFiles = [], totalFiles = 0, selectedFiles = [], avoidedFiles = [] } = rankedContext;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 50) return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    if (score >= 30) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-slate-400 bg-slate-800/50 border-slate-700/50';
  };

  const getBarColor = (score) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-blue-500';
    if (score >= 30) return 'bg-amber-500';
    return 'bg-slate-700';
  };

  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Context Engine & Relevance Scoring
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
            {selectedFiles.length} Selected
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
            {avoidedFiles.length} Avoided
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        ForgeLoop analyzes repository structure, searches relevant symbols, and filters out noise before passing context to the foundation model.
      </p>

      <div className="space-y-3 overflow-y-auto pr-1 flex-1 max-h-[380px]">
        {scoredFiles.map((file) => {
          const isSelected = file.decision !== 'AVOID';

          return (
            <div
              key={file.path}
              className={`p-3.5 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-[#121c36] border-blue-500/30'
                  : 'bg-slate-900/40 border-slate-800/50 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-mono font-medium text-slate-200 truncate">
                    {file.path}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getScoreColor(file.relevanceScore)}`}>
                    Relevance: {file.relevanceScore}%
                  </span>
                  {isSelected ? (
                    <span className="text-[10px] uppercase font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" /> Selected
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      <XCircle className="w-3 h-3 text-slate-500" /> Avoided
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getBarColor(file.relevanceScore)}`}
                  style={{ width: `${file.relevanceScore}%` }}
                />
              </div>

              {/* Explainable Reasons */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                  Reason for {isSelected ? 'Inclusion' : 'Exclusion'}:
                </span>
                <ul className="text-xs text-slate-300 space-y-0.5">
                  {file.reasons && file.reasons.length > 0 ? (
                    file.reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-blue-400' : 'bg-slate-600'}`}></span>
                        <span>{reason}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-500">Unrelated to current task requirements</li>
                  )}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
