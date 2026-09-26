import React from 'react';
import {
  LayoutDashboard,
  ListTodo,
  FolderGit2,
  PlayCircle,
  BarChart2,
  Settings,
  GitBranch
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  onNavigate,
  currentRepo,
  modelProvider,
  isConnected
}) {
  const navItems = [
    { id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks', href: '/tasks', label: 'Tasks', icon: ListTodo },
    { id: 'repositories', href: '/repositories', label: 'Repositories', icon: FolderGit2 },
    { id: 'runs', href: '/runs', label: 'Runs', icon: PlayCircle },
    { id: 'benchmarks', href: '/benchmarks', label: 'Benchmarks', icon: BarChart2 },
    { id: 'settings', href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0a0f1d] border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 select-none">
      {/* Top Section */}
      <div>
        {/* Brand Logo */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-600/30 text-white font-extrabold text-lg">
            F
          </div>
          <div>
            <div className="font-bold text-base text-white tracking-tight leading-tight">
              ForgeLoop
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              AI Coding Agent Harness
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.href)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80 text-xs">
        {/* Current Repository Card */}
        <div className="bg-[#0f172a]/90 border border-slate-800/90 rounded-xl p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Current Repository
          </div>
          <div className="flex items-center gap-2 text-slate-100 font-semibold mb-1">
            <FolderGit2 className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate">{currentRepo?.id || 'No repository selected'}</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate mb-2">
            {currentRepo?.path || 'No repository path available'}
          </div>
          {currentRepo?.status && <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/60 font-mono">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentRepo.status.isGitRepo ? currentRepo.status.clean ? 'Working tree clean' : `${currentRepo.status.files.length} changed file(s)` : 'Not a Git repository'}</span>
          </div>}
        </div>

        {/* Model Connection Status Card */}
        <div className="bg-[#0f172a]/90 border border-slate-800/90 rounded-xl p-3 space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-semibold text-slate-200">
              {isConnected ? 'Model Connected' : 'Connecting...'}
            </span>
          </div>
          <div className="text-slate-400">
            {modelProvider === 'deepseek' ? 'DeepSeek (V3 / R1)' :
              modelProvider === 'qwen' ? 'Qwen (2.5 Coder / Plus)' :
                modelProvider === 'gemini' ? 'Google Gemini' :
                  'OpenAI / Compatible'}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60 font-mono">
            <span>Token Limit: 128K</span>
            <span>Env: Dev</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
