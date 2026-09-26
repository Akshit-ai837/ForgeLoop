import React, { useEffect, useRef } from 'react';
import { Terminal, Shield, Wrench, AlertCircle, CheckCircle, Info } from 'lucide-react';

export default function ActivityLog({ logs = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogIcon = (type) => {
    switch (type) {
      case 'tool':
        return <Wrench className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
      case 'success':
        return <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'warn':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />;
    }
  };

  const getLogStyle = (type) => {
    switch (type) {
      case 'tool':
        return 'text-blue-200 bg-blue-950/20 border-blue-900/30';
      case 'success':
        return 'text-emerald-200 bg-emerald-950/20 border-emerald-900/30 font-semibold';
      case 'warn':
        return 'text-amber-200 bg-amber-950/20 border-amber-900/30';
      case 'error':
        return 'text-rose-200 bg-rose-950/20 border-rose-900/30';
      default:
        return 'text-slate-300 bg-slate-900/40 border-slate-800/40';
    }
  };

  return (
    <div className="bg-[#0e1628] border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Live Agent Activity Stream
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{logs.length} events logged</span>
        </div>
      </div>

      <div className="bg-[#090e1a] rounded-lg border border-slate-800/80 p-3.5 flex-1 overflow-y-auto max-h-[380px] font-mono text-xs space-y-2">
        {logs.length === 0 ? (
          <div className="text-slate-500 py-8 text-center flex flex-col items-center">
            <Terminal className="w-8 h-8 text-slate-700 mb-2" />
            <span>Ready. Click "RUN AGENT" to begin execution.</span>
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id || index}
              className={`p-2 rounded border flex items-start gap-2.5 transition-all ${getLogStyle(log.type)}`}
            >
              <span className="text-[10px] text-slate-500 shrink-0 mt-0.5">
                [{log.timeFormatted || new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              {getLogIcon(log.type)}
              <div className="flex-1 break-words">
                <span>{log.message}</span>
                {log.meta?.failureMemory && (
                  <div className="mt-1 p-1.5 rounded bg-black/40 text-[11px] text-amber-300 border border-amber-900/40">
                    Failed Test: {log.meta.failureMemory.test} | Expected: {log.meta.failureMemory.expected} vs Got: {log.meta.failureMemory.received}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
