import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export default function ExecutionLog({ logs = [], isRunning = false }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Format log tag and message to match screenshot terminal style
  const formatLogEntry = (log) => {
    let tag = 'INFO';
    let tagColor = 'text-cyan-400';
    const text = log.message || '';

    if (text.toLowerCase().startsWith('thinking:')) {
      tag = 'THOUGHT';
      tagColor = 'text-cyan-300 italic';
    } else if (text.toLowerCase().startsWith('action:')) {
      tag = 'ACTION';
      tagColor = 'text-indigo-400 font-bold';
    } else if (text.toLowerCase().startsWith('observation:')) {
      tag = 'OBSERVE';
      tagColor = 'text-emerald-300';
    } else if (text.toLowerCase().includes('search')) {
      tag = 'SEARCH';
      tagColor = 'text-purple-400';
    } else if (text.toLowerCase().includes('scanned') || text.toLowerCase().includes('found')) {
      tag = 'FOUND';
      tagColor = 'text-teal-400';
    } else if (text.toLowerCase().includes('context') || text.toLowerCase().includes('slice')) {
      tag = 'CONTEXT';
      tagColor = 'text-amber-400';
    } else if (text.toLowerCase().includes('plan')) {
      tag = 'PLAN';
      tagColor = 'text-yellow-400';
    } else if (text.toLowerCase().includes('tool:') || text.toLowerCase().includes('edit') || text.toLowerCase().includes('modifying') || text.toLowerCase().includes('applying')) {
      tag = 'CODE';
      tagColor = 'text-blue-400';
    } else if (text.toLowerCase().includes('test failure') || text.toLowerCase().includes('analyzing failure')) {
      tag = 'ANALYZE';
      tagColor = 'text-orange-400';
    } else if (text.toLowerCase().includes('repair') || text.toLowerCase().includes('fix') || text.toLowerCase().includes('recovery')) {
      tag = 'FIX';
      tagColor = 'text-pink-400';
    } else if (text.toLowerCase().includes('re-testing') || text.toLowerCase().includes('test')) {
      tag = 'TEST';
      tagColor = 'text-indigo-400';
    } else if (text.toLowerCase().includes('verif')) {
      tag = 'VERIFY';
      tagColor = 'text-blue-300';
    } else if (text.toLowerCase().includes('task verified') || text.toLowerCase().includes('success')) {
      tag = 'DONE';
      tagColor = 'text-emerald-400';
    }

    const time = log.timeFormatted || (log.timestamp
      ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })
      : '');

    return {
      time,
      tag: tag.padEnd(8, ' '),
      tagColor,
      text
    };
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">
            Agent Execution Log
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{isRunning ? 'Running' : 'Idle'}</span>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="bg-[#0a0f1d] rounded-xl border border-slate-800/80 p-4 font-mono text-xs overflow-y-auto flex-1 max-h-[350px] space-y-1.5 selection:bg-blue-500/30">
        {logs.length === 0 ? (
          <div className="text-slate-500 py-12 text-center">
            Waiting for agent execution... Click "Run Agent" to start.
          </div>
        ) : (
          logs.map((log, idx) => {
            const item = formatLogEntry(log);
            return (
              <div key={log.id || idx} className="flex items-start gap-3 leading-relaxed">
                <span className="text-slate-400 shrink-0 select-none">
                  [{item.time}]
                </span>
                <span className={`font-bold shrink-0 ${item.tagColor}`}>
                  {item.tag}
                </span>
                <span className="text-slate-300 break-words flex-1">
                  {item.text}
                </span>
              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
