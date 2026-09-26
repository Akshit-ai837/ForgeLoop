import React, { useState } from 'react';
import { 
  FileText, 
  FolderGit2, 
  Cpu, 
  SlidersHorizontal, 
  Eraser, 
  Play,
  RotateCcw,
  Key
} from 'lucide-react';

export default function NewTaskCard({
  task,
  setTask,
  repos = [],
  selectedRepoId,
  setSelectedRepoId,
  modelProvider,
  setModelProvider,
  apiKey,
  setApiKey,
  onRunAgent,
  isRunning,
  onResetRepos
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleClear = () => {
    setTask('');
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3.5">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
          <FileText className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">New Task</h2>
          <p className="text-xs text-slate-400">
            Describe what you want the agent to do. It will search, plan, code, test and verify.
          </p>
        </div>
      </div>

      {/* Task Input Box */}
      <div className="mb-4">
        <textarea
          rows={2}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={isRunning}
          placeholder="Describe the coding task to run..."
          className="w-full bg-[#0a0f1d] border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors resize-none disabled:opacity-50"
        />
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Repository Dropdown */}
          <div className="relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0a0f1d] border border-slate-800 text-xs text-slate-300 font-medium hover:border-slate-700 transition-colors">
              <FolderGit2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-slate-400">Repository:</span>
              <select
                value={selectedRepoId}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                disabled={isRunning}
                className="bg-transparent text-slate-100 focus:outline-none cursor-pointer pr-1"
              >
                {repos.map(r => (
                  <option key={r.id} value={r.id} className="bg-slate-900 text-slate-100">
                    {r.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Model Dropdown */}
          <div className="relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0a0f1d] border border-slate-800 text-xs text-slate-300 font-medium hover:border-slate-700 transition-colors">
              <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-slate-400">Model:</span>
              <select
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value)}
                disabled={isRunning}
                className="bg-transparent text-slate-100 focus:outline-none cursor-pointer pr-1"
              >
                <option value="deepseek" className="bg-slate-900 text-slate-100">DeepSeek (V3 / R1)</option>
                <option value="qwen" className="bg-slate-900 text-slate-100">Qwen (2.5 Coder / Plus)</option>
                <option value="gemini" className="bg-slate-900 text-slate-100">Google Gemini</option>
                <option value="openai" className="bg-slate-900 text-slate-100">OpenAI / Compatible</option>
              </select>
            </div>
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              showAdvanced ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Advanced Options</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={isRunning || !task}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-all disabled:opacity-40"
          >
            <Eraser className="w-3.5 h-3.5 text-slate-400" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={onRunAgent}
            disabled={isRunning || !task.trim() || !selectedRepoId}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-white ${isRunning ? 'animate-pulse' : ''}`} />
            <span>{isRunning ? 'Running...' : 'Run Agent'}</span>
          </button>
        </div>
      </div>

      {/* Advanced Options Drawer */}
      {showAdvanced && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0f1d] border border-slate-800">
            <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <input
              type="password"
              placeholder={`${modelProvider.toUpperCase()}_API_KEY (optional override)`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-transparent text-slate-200 text-xs w-full focus:outline-none font-mono"
            />
          </div>

          <button
            type="button"
            onClick={onResetRepos}
            className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-[#0a0f1d] hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Demo Repositories to Clean</span>
          </button>
        </div>
      )}
    </div>
  );
}
