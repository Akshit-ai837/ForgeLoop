import React from 'react';
import { Play, BarChart2, Sparkles, FolderGit2, AlertTriangle, Key } from 'lucide-react';

export default function ControlPanel({
  repos = [],
  selectedRepoId,
  onSelectRepo,
  task,
  onTaskChange,
  modelProvider,
  onModelProviderChange,
  apiKey,
  onApiKeyChange,
  simulateFailureFirst,
  onSimulateFailureChange,
  onRunAgent,
  onRunBenchmark,
  isRunning,
  isBenchmarking
}) {
  const currentRepo = repos.find(r => r.id === selectedRepoId) || repos[0];

  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left Column: Repo & Model selection */}
        <div className="w-full lg:w-1/3 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Target Repository</span>
            </label>
            <select
              value={selectedRepoId}
              onChange={(e) => onSelectRepo(e.target.value)}
              disabled={isRunning}
              className="w-full bg-[#131c33] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {repos.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {currentRepo && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                {currentRepo.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Model Engine</span>
              </label>
              <select
                value={modelProvider}
                onChange={(e) => onModelProviderChange(e.target.value)}
                disabled={isRunning}
                className="w-full bg-[#131c33] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="smart">Smart Engine (Autonomous)</option>
                <option value="gemini">Google Gemini API</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Demo Scenario</span>
              </label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={simulateFailureFirst}
                  onChange={(e) => onSimulateFailureChange(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-slate-700 text-blue-500 focus:ring-0 bg-[#131c33]"
                />
                <span className="text-[11px] font-medium">Trigger Test Failure First</span>
              </label>
            </div>
          </div>

          {modelProvider === 'gemini' && (
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>GEMINI_API_KEY</span>
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className="w-full bg-[#131c33] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Right Column: Task input & Run action */}
        <div className="w-full lg:w-2/3 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Software Engineering Task
              </label>
              {currentRepo?.suggestedTask && (
                <button
                  type="button"
                  onClick={() => onTaskChange(currentRepo.suggestedTask)}
                  disabled={isRunning}
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                >
                  Load Suggested Task
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={task}
              onChange={(e) => onTaskChange(e.target.value)}
              disabled={isRunning}
              placeholder="e.g. Add pagination to the /api/products endpoint and update the tests."
              className="w-full bg-[#131c33] border border-slate-700 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              {currentRepo ? (
                <span>Test harness: <strong className="text-slate-300">{currentRepo.testSuite}</strong></span>
              ) : ''}
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onRunBenchmark}
                disabled={isRunning || isBenchmarking}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-indigo-700/60 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 transition-colors disabled:opacity-50"
              >
                <BarChart2 className="w-4 h-4 text-indigo-400" />
                <span>{isBenchmarking ? 'Computing...' : 'Benchmark vs Baseline'}</span>
              </button>

              <button
                type="button"
                onClick={onRunAgent}
                disabled={isRunning || !task.trim()}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
              >
                <Play className={`w-4 h-4 fill-white ${isRunning ? 'animate-pulse' : ''}`} />
                <span>{isRunning ? 'Agent Executing...' : 'RUN AGENT'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
