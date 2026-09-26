import React, { useState } from 'react';

const panelClass = 'bg-[#0f172a] border border-slate-800/90 rounded-2xl p-5 shadow-xl';

function PageTitle({ title, description }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-white">{title}</h1>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </div>
  );
}

function EmptyState({ children }) {
  return <div className={`${panelClass} text-sm text-slate-400`}>{children}</div>;
}

function RunDetails({ run, onOpenDiff }) {
  const tests = run.tests || run.verification?.evidence?.tests;
  const changedFiles = run.filesChanged || run.verification?.evidence?.gitDiff?.fileDiffs?.map(file => file.file) || [];
  const tokens = run.tokenMetrics;
  const contextFiles = run.contextFiles || [];
  const recoveryAttempts = run.recoveryAttempts || [];

  return (
    <section className={`${panelClass} space-y-5`} aria-label="Run details">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
              ID: {run.id}
            </span>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${run.status === 'COMPLETED' || run.status === 'TASK_VERIFIED'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : run.status === 'FAILED'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse'
              }`}>
              {run.status}
            </span>
          </div>
          <h2 className="font-bold text-base text-white mt-2 leading-snug">{run.task}</h2>
        </div>
      </div>

      {/* Grid of Key Properties */}
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0a0f1d] p-3 rounded-xl border border-slate-800/80">
          <dt className="text-slate-400 text-[11px]">Repository</dt>
          <dd className="text-slate-100 font-mono font-semibold mt-1 truncate">{run.repoId || run.repository}</dd>
        </div>
        <div className="bg-[#0a0f1d] p-3 rounded-xl border border-slate-800/80">
          <dt className="text-slate-400 text-[11px]">Current Stage</dt>
          <dd className="text-slate-100 font-mono font-semibold mt-1">{run.currentStage || run.status}</dd>
        </div>
        <div className="bg-[#0a0f1d] p-3 rounded-xl border border-slate-800/80">
          <dt className="text-slate-400 text-[11px]">Started At</dt>
          <dd className="text-slate-100 font-mono text-[11px] mt-1">{formatDate(run.startTime || run.createdAt)}</dd>
        </div>
        <div className="bg-[#0a0f1d] p-3 rounded-xl border border-slate-800/80">
          <dt className="text-slate-400 text-[11px]">Completed At</dt>
          <dd className="text-slate-100 font-mono text-[11px] mt-1">{run.endTime || run.completedAt ? formatDate(run.endTime || run.completedAt) : 'In progress'}</dd>
        </div>
      </dl>

      {/* Verification Evidence Banner */}
      <div className={`p-4 rounded-xl border ${run.verification?.verified || run.verificationStatus === 'TASK_VERIFIED'
          ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
          : run.verificationStatus === 'MODEL_NOT_CONFIGURED' || run.error?.includes('MODEL')
            ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
            : 'bg-slate-900 border-slate-800 text-slate-300'
        }`}>
        <div className="text-xs font-bold uppercase tracking-wider mb-1">Verification Evidence</div>
        <p className="text-xs leading-relaxed">
          {run.verification?.summary || run.finalResult || run.error || 'No verification evidence recorded for this execution.'}
        </p>
      </div>

      {/* Execution Timeline & Test Results */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Test Results */}
        <div className="bg-[#0a0f1d] p-4 rounded-xl border border-slate-800/80 space-y-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Test Suite Results</h3>
          {tests ? (
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-300">
                <span>Status:</span>
                <span className={tests.passed ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                  {tests.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Passed / Total:</span>
                <span>{tests.passedCount} / {tests.totalCount}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Command:</span>
                <span>{tests.command || 'npm test'}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No test results recorded.</p>
          )}
        </div>

        {/* Token Metrics */}
        <div className="bg-[#0a0f1d] p-4 rounded-xl border border-slate-800/80 space-y-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Token Metrics ({tokens?.usageType || 'estimate'})</h3>
          {tokens ? (
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-300">
                <span>Task & Context:</span>
                <span>{(tokens.taskTokens + tokens.contextTokens).toLocaleString()} tokens</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Generation / Repair:</span>
                <span>{((tokens.generationTokens || 0) + (tokens.recoveryTokens || 0)).toLocaleString()} tokens</span>
              </div>
              <div className="flex justify-between text-slate-300 font-bold border-t border-slate-800 pt-1">
                <span>Total Tokens:</span>
                <span className="text-emerald-400">{tokens.totalTokens.toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No token metrics recorded.</p>
          )}
        </div>
      </div>

      {/* Selected Context Files with Explainable Reasons */}
      {contextFiles.length > 0 && (
        <div className="bg-[#0a0f1d] p-4 rounded-xl border border-slate-800/80 space-y-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Selected Context Files ({contextFiles.length})
          </h3>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-xs">
            {contextFiles.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/60">
                <span className="text-blue-300 truncate">{c.path || c.file}</span>
                <span className="text-slate-400 text-[11px]">{c.relevanceScore ? `${c.relevanceScore}% match` : ''} {c.tokens ? `· ${c.tokens} tok` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Changed Files & Unified Diff */}
      {changedFiles.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-blue-950/20 border border-blue-500/30">
          <span className="text-xs text-blue-300 font-mono">
            {changedFiles.length} file(s) modified: {changedFiles.join(', ')}
          </span>
          <button
            type="button"
            onClick={() => onOpenDiff?.(run)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition-colors"
          >
            Inspect Git Diff
          </button>
        </div>
      )}

      {/* Failure Recovery Attempts */}
      {recoveryAttempts.length > 0 && (
        <div className="bg-[#0a0f1d] p-4 rounded-xl border border-slate-800/80 space-y-2">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
            Failure Recovery Attempts ({recoveryAttempts.length}/3)
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto text-xs font-mono text-slate-300">
            {recoveryAttempts.map((att, i) => (
              <div key={i} className="p-2 rounded bg-slate-900/80 border border-slate-800">
                <div className="font-bold text-amber-300">Attempt #{att.attempt_number}: {att.action}</div>
                <div className="text-slate-400 text-[11px] mt-1">{att.failure_text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution Logs */}
      {run.logs?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-300 font-semibold p-2 bg-slate-900 rounded-lg border border-slate-800">
            Execution Log Timeline ({run.logs.length} events)
          </summary>
          <ol className="mt-3 space-y-2 max-h-64 overflow-auto font-mono p-3 bg-[#0a0f1d] rounded-xl border border-slate-800">
            {run.logs.map((log, index) => (
              <li key={log.id || index} className="text-slate-400 flex items-start gap-2">
                <time className="text-slate-500 shrink-0 select-none">
                  {log.timeFormatted || formatDate(log.timestamp)}
                </time>
                <span className="text-slate-300">{log.message}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString();
}

function TaskTable({ runs, selectedRunId, onSelect }) {
  return (
    <div className={`${panelClass} overflow-x-auto`}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th className="pb-3 font-semibold">Run ID</th>
            <th className="pb-3 font-semibold">Task</th>
            <th className="pb-3 font-semibold">Repository</th>
            <th className="pb-3 font-semibold">Status</th>
            <th className="pb-3 font-semibold">Verification</th>
            <th className="pb-3 font-semibold">Submitted</th>
            <th className="pb-3 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 font-mono">
          {runs.map(run => {
            const isSelected = selectedRunId === run.id;
            const isVerified = run.verification?.verified || run.verificationStatus === 'TASK_VERIFIED';
            const isModelMissing = run.verificationStatus === 'MODEL_NOT_CONFIGURED' || run.error?.includes('MODEL');
            return (
              <tr key={run.id} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-blue-900/20' : ''}`}>
                <td className="py-3 text-blue-400 font-mono text-[11px] truncate max-w-[120px]">{run.id.slice(0, 8)}...</td>
                <td className="py-3 text-slate-100 font-sans font-medium max-w-[280px] truncate">{run.task}</td>
                <td className="py-3 text-slate-300">{run.repoId || run.repository}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${run.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                      run.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                        'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                    }`}>
                    {run.status}
                  </span>
                </td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isVerified ? 'bg-emerald-500/10 text-emerald-400' :
                      isModelMissing ? 'bg-amber-500/10 text-amber-400' :
                        'bg-slate-800 text-slate-400'
                    }`}>
                    {isVerified ? 'VERIFIED' : isModelMissing ? 'MODEL MISSING' : run.verificationStatus || 'NOT VERIFIED'}
                  </span>
                </td>
                <td className="py-3 text-slate-400 text-[11px]">{formatDate(run.startTime || run.createdAt)}</td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(run.id)}
                    className="rounded bg-blue-600/80 px-2.5 py-1 text-[11px] font-sans font-semibold text-white hover:bg-blue-500 transition-colors"
                  >
                    {isSelected ? 'Viewing' : 'Inspect'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunList({ runs, selectedRunId, onSelect }) {
  return (
    <div className="space-y-3">
      {runs.map(run => {
        const isSelected = selectedRunId === run.id;
        const isVerified = run.verification?.verified || run.verificationStatus === 'TASK_VERIFIED';
        const isModelMissing = run.verificationStatus === 'MODEL_NOT_CONFIGURED' || run.error?.includes('MODEL');
        const filesCount = run.filesChanged?.length || 0;
        const totalTokens = run.tokenMetrics?.totalTokens;

        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            aria-pressed={isSelected}
            className={`${panelClass} w-full text-left hover:border-blue-500/50 transition-colors ${isSelected ? 'border-blue-500 ring-1 ring-blue-500/40' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                  {run.id.slice(0, 8)}
                </span>
                <span className="font-semibold text-white text-sm">{run.task}</span>
              </div>
              <div className="flex items-center gap-2">
                {isVerified && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    VERIFIED
                  </span>
                )}
                {isModelMissing && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    NO MODEL
                  </span>
                )}
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${run.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                    run.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                      'bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse'
                  }`}>
                  {run.status}
                </span>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-mono text-slate-300">{run.repoId || run.repository}</span>
              <span>{formatDate(run.startTime || run.createdAt)}</span>
              {filesCount > 0 && <span className="text-blue-300">{filesCount} file(s) changed</span>}
              {totalTokens > 0 && <span className="text-emerald-400 font-mono">{totalTokens.toLocaleString()} tokens</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ApplicationPages({
  route,
  repos = [],
  runs = [],
  benchmarks = [],
  dataStatus = {},
  selectedRepoId,
  onSelectRepo,
  onRunBenchmark,
  modelProvider,
  setModelProvider,
  apiKey,
  setApiKey,
  geminiKeyConfigured = false,
  geminiKeySaveStatus = '',
  isSavingGeminiKey = false,
  onSaveGeminiKey,
  modelSettings = { activeProvider: 'deepseek', modelName: '', providers: [] },
  onSaveModelConfig,
  githubStatus = { configured: false, connected: false, account: null },
  githubRepos = [],
  githubReposLoading = false,
  githubReposError = '',
  githubMessage = '',
  onConnectGithub,
  onDisconnectGithub,
  onOpenDiff,
  task,
  setTask
}) {
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRepoPageId, setSelectedRepoPageId] = useState(null);
  const [benchmarkError, setBenchmarkError] = useState('');
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const selectedRun = runs.find(run => run.id === selectedRunId) || runs[0];
  const selectedRepo = repos.find(repo => repo.id === selectedRepoPageId) || repos.find(repo => repo.id === selectedRepoId);
  const completedRuns = runs.filter(run => run.endTime || run.completedAt);
  const measuredRuns = completedRuns.filter(run => run.tokenMetrics);
  const totalTokens = measuredRuns.reduce((total, run) => total + (run.tokenMetrics.totalTokens || 0), 0);
  const verifiedRuns = completedRuns.filter(run => run.verification?.verified || run.verificationStatus === 'TASK_VERIFIED').length;

  if (route === '/tasks') {
    return (
      <div className="space-y-6">
        <PageTitle title="Tasks" description="Tasks submitted to the agent and their execution results." />
        {dataStatus.runs === 'loading' ? <EmptyState>Loading task history…</EmptyState> : dataStatus.runs === 'error' ? <EmptyState>Task history could not be loaded. Check the server connection and retry.</EmptyState> : runs.length === 0 ? <EmptyState>No tasks yet. Submit a task from the Dashboard to see it here.</EmptyState> : (
          <>
            <TaskTable runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
            {selectedRun && <RunDetails run={selectedRun} onOpenDiff={onOpenDiff} />}
          </>
        )}
      </div>
    );
  }

  if (route === '/runs') {
    return (
      <div className="space-y-6">
        <PageTitle title="Runs" description="Actual agent executions, status, evidence, and token usage." />
        {dataStatus.runs === 'loading' ? <EmptyState>Loading run history…</EmptyState> : dataStatus.runs === 'error' ? <EmptyState>Run history could not be loaded. Check the server connection and retry.</EmptyState> : runs.length === 0 ? <EmptyState>No runs yet. Run your first coding task from the Dashboard to see execution results here.</EmptyState> : (
          <>
            <RunList runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
            {selectedRun && <RunDetails run={selectedRun} onOpenDiff={onOpenDiff} />}
          </>
        )}
      </div>
    );
  }

  if (route === '/repositories') {
    return (
      <div className="space-y-6">
        <PageTitle title="Repositories" description="Configured local repositories and repositories available from your connected GitHub account." />
        {dataStatus.repos === 'loading' ? <EmptyState>Loading repositories…</EmptyState> : dataStatus.repos === 'error' ? <EmptyState>Repositories could not be loaded. Check the server connection and retry.</EmptyState> : repos.length === 0 ? <EmptyState>No repositories are configured.</EmptyState> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {repos.map(repo => (
                <button key={repo.id} type="button" onClick={() => setSelectedRepoPageId(repo.id)} aria-pressed={selectedRepo?.id === repo.id} className={`${panelClass} w-full text-left hover:border-blue-500/50 ${selectedRepo?.id === repo.id ? 'border-blue-500/50' : ''}`}>
                  <div className="font-semibold text-white">{repo.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{repo.id}</div>
                </button>
              ))}
            </div>
            {selectedRepo && (
              <section className={`${panelClass} space-y-3`}>
                <h2 className="font-semibold text-white">{selectedRepo.name}</h2>
                <p className="text-xs text-slate-400">{selectedRepo.description}</p>
                <dl className="space-y-3 text-xs">
                  <div><dt className="text-slate-500">Path</dt><dd className="text-slate-200 mt-1 break-all">{selectedRepo.path}</dd></div>
                  <div><dt className="text-slate-500">Test command</dt><dd className="text-slate-200 mt-1">{selectedRepo.testCommand || 'No package test script configured'}</dd></div>
                  <div><dt className="text-slate-500">Working tree</dt><dd className="text-slate-200 mt-1">{selectedRepo.status?.isGitRepo ? selectedRepo.status.clean ? 'Clean' : `${selectedRepo.status.files.length} changed file(s)` : 'Not a Git repository'}</dd></div>
                  {selectedRepo.status?.files?.length > 0 && <div className="text-slate-400">{selectedRepo.status.files.map(file => `${file.status || 'modified'} ${file.path}`).join(', ')}</div>}
                </dl>
                <button type="button" onClick={() => onSelectRepo?.(selectedRepo.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
                  {selectedRepoId === selectedRepo.id ? 'Selected for new tasks' : 'Use for new tasks'}
                </button>
              </section>
            )}
          </div>
        )}
        <section className={`${panelClass} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">GitHub repositories</h2>
              <p className="mt-1 text-xs text-slate-400">
                {githubStatus.connected
                  ? `Connected as ${githubStatus.account?.login || 'GitHub user'} · ${githubRepos.length} repositories`
                  : 'Connect GitHub in Settings to view repositories you can access.'}
              </p>
            </div>
            {!githubStatus.connected && (
              <button type="button" onClick={onConnectGithub} disabled={!githubStatus.configured} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                Connect GitHub
              </button>
            )}
          </div>
          {githubReposLoading && <p className="text-sm text-slate-400">Loading GitHub repositories…</p>}
          {githubReposError && <p role="alert" className="text-sm text-rose-300">{githubReposError}</p>}
          {githubStatus.connected && !githubReposLoading && !githubReposError && githubRepos.length === 0 && (
            <p className="text-sm text-slate-400">No GitHub repositories are available to this account.</p>
          )}
          {githubRepos.length > 0 && (
            <ul className="grid gap-3 md:grid-cols-2">
              {githubRepos.map(repo => (
                <li key={repo.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <a href={repo.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-300 hover:text-blue-200">{repo.fullName}</a>
                  <p className="mt-2 text-xs text-slate-400">{repo.description || 'No description provided.'}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>{repo.private ? 'Private' : 'Public'}</span>
                    {repo.defaultBranch && <span>Default branch: {repo.defaultBranch}</span>}
                    {repo.updatedAt && <span>Updated {formatDate(repo.updatedAt)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  if (route === '/benchmarks') {
    const runBenchmark = async () => {
      setBenchmarkBusy(true);
      setBenchmarkError('');
      try {
        await onRunBenchmark();
      } catch (error) {
        setBenchmarkError(error.message || 'Benchmark could not be completed.');
      } finally {
        setBenchmarkBusy(false);
      }
    };
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageTitle title="Benchmarks" description="Measured repository-context comparisons run by this instance." />
          <button type="button" onClick={runBenchmark} disabled={benchmarkBusy || !selectedRepoId} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">
            {benchmarkBusy ? 'Running benchmark…' : 'Run benchmark'}
          </button>
        </div>
        <section className={`${panelClass} grid gap-4 sm:grid-cols-2`}>
          <label className="text-xs font-semibold text-slate-300">
            Repository
            <select value={selectedRepoId || ''} onChange={event => onSelectRepo?.(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
              {repos.map(repo => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">
            Benchmark task
            <textarea value={task || ''} onChange={event => setTask?.(event.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          </label>
        </section>
        {benchmarkError && <p role="alert" className="text-sm text-rose-300">{benchmarkError}</p>}
        {dataStatus.benchmarks === 'loading' ? <EmptyState>Loading benchmark history…</EmptyState> : dataStatus.benchmarks === 'error' ? <EmptyState>Benchmark history could not be loaded. Check the server connection and retry.</EmptyState> : benchmarks.length === 0 ? <EmptyState>No benchmarks available yet.</EmptyState> : (
          <div className="space-y-4">
            {benchmarks.map(benchmark => (
              <article key={benchmark.id} className={panelClass}>
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold text-white">{benchmark.repoId}</h2>
                  <time className="text-xs text-slate-400">{formatDate(benchmark.createdAt)}</time>
                </div>
                <p className="mt-2 text-sm text-slate-300">{benchmark.task}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                  <div className="rounded-lg bg-slate-900/70 p-3"><span className="text-slate-400">Baseline context</span><div className="mt-1 font-mono text-white">{benchmark.baseline.totalTokens.toLocaleString()} tokens</div></div>
                  <div className="rounded-lg bg-slate-900/70 p-3"><span className="text-slate-400">ForgeLoop context</span><div className="mt-1 font-mono text-white">{benchmark.forgeLoop.totalTokens.toLocaleString()} tokens</div></div>
                  <div className="rounded-lg bg-slate-900/70 p-3"><span className="text-slate-400">Measured reduction</span><div className="mt-1 font-mono text-emerald-300">{benchmark.savings.savingsPercent}% · {benchmark.savings.tokensSaved.toLocaleString()} tokens</div></div>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">Token counts are estimates measured by the benchmark context calculation.</p>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (route === '/settings') {
    const activeProviderObj = modelSettings?.providers?.find(p => p.id === modelProvider) || {
      id: modelProvider,
      name: modelProvider.toUpperCase(),
      envKey: `${modelProvider.toUpperCase()}_API_KEY`,
      defaultModel: modelProvider === 'deepseek' ? 'deepseek-chat' : modelProvider === 'qwen' ? 'qwen-plus' : 'gemini-1.5-flash',
      isConfigured: false
    };

    const handleSaveCurrent = () => {
      if (onSaveModelConfig) {
        onSaveModelConfig({ provider: modelProvider, apiKey });
      } else {
        onSaveGeminiKey?.();
      }
    };

    return (
      <div className="space-y-6">
        <PageTitle title="Settings" description="Model provider configuration (DeepSeek, Qwen, Gemini, OpenAI) and environment setup." />
        <section className={`${panelClass} max-w-2xl space-y-5`}>
          <div>
            <label htmlFor="settings-model" className="block text-xs font-semibold text-slate-300 mb-2">Model Provider</label>
            <select
              id="settings-model"
              value={modelProvider}
              onChange={event => setModelProvider(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="deepseek">DeepSeek (V3 / R1) [Evaluation Ready]</option>
              <option value="qwen">Qwen (2.5 Coder / Plus) [Evaluation Ready]</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI / Compatible</option>
            </select>
          </div>

          <div>
            <label htmlFor="settings-api-key" className="block text-xs font-semibold text-slate-300 mb-2">
              {activeProviderObj.name} API Key ({activeProviderObj.envKey})
            </label>
            <input
              id="settings-api-key"
              type="password"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
              placeholder={activeProviderObj.isConfigured ? `Key configured on server (enter to replace)` : `Enter ${activeProviderObj.envKey}`}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 font-mono"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveCurrent}
                disabled={isSavingGeminiKey || !apiKey.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isSavingGeminiKey ? 'Saving…' : activeProviderObj.isConfigured ? 'Replace Saved Key' : 'Save Key'}
              </button>
              <span role="status" className="text-xs text-slate-400">
                {activeProviderObj.isConfigured ? `Configured on server via ${activeProviderObj.envKey}.` : 'No key configured yet.'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Keys are stored in a private server-side file or environment variable, never exposed in browser storage.
            </p>
            {geminiKeySaveStatus && <p role="status" className="mt-2 text-xs text-slate-300">{geminiKeySaveStatus}</p>}
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-2 text-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Provider Status</div>
            {(modelSettings?.providers || [
              { id: 'deepseek', label: 'DeepSeek (V3 / R1)', isConfigured: false },
              { id: 'qwen', label: 'Qwen (2.5 Coder / Plus)', isConfigured: false },
              { id: 'gemini', label: 'Google Gemini', isConfigured: geminiKeyConfigured },
              { id: 'openai', label: 'OpenAI / Compatible', isConfigured: false }
            ]).map(p => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-300 font-medium">{p.label || p.name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${p.isConfigured || (p.id === 'gemini' && geminiKeyConfigured)
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-500'
                  }`}>
                  {p.isConfigured || (p.id === 'gemini' && geminiKeyConfigured) ? 'CONFIGURED' : 'NOT CONFIGURED'}
                </span>
              </div>
            ))}
          </div>

          <dl className="border-t border-slate-800 pt-4 space-y-3 text-xs">
            <div className="flex justify-between gap-4"><dt className="text-slate-400">Default Model</dt><dd className="text-slate-200 font-mono">{activeProviderObj.defaultModel}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-400">Repositories configured</dt><dd className="text-slate-200">{dataStatus.repos === 'error' ? 'Unavailable' : repos.length}</dd></div>
          </dl>
        </section>
        <section className={`${panelClass} max-w-2xl space-y-4`}>
          <div>
            <h2 className="font-semibold text-white">GitHub account</h2>
            <p className="mt-1 text-xs text-slate-400">
              OAuth credentials are configured on the server. Access tokens are kept in server memory and are never sent to the browser.
            </p>
          </div>
          {githubMessage && <p role="status" className="text-sm text-slate-300">{githubMessage}</p>}
          {!githubStatus.configured && (
            <p className="text-sm text-amber-300">
              GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL on the server.
            </p>
          )}
          {githubStatus.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-200">Connected as {githubStatus.account?.login || 'GitHub user'}.</p>
              <button type="button" onClick={onDisconnectGithub} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
                Disconnect GitHub
              </button>
            </div>
          ) : (
            <button type="button" onClick={onConnectGithub} disabled={!githubStatus.configured} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              Connect GitHub
            </button>
          )}
          <p className="text-[11px] text-slate-500">
            GitHub OAuth requests the repo scope to list private repositories as well as public repositories. Revoke the grant from your GitHub account settings when you no longer want ForgeLoop to access it.
          </p>
          {githubReposError && <p role="alert" className="text-sm text-rose-300">{githubReposError}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Dashboard" description="Overview of actual agent activity, repository status, and verification outcomes." />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Tasks submitted', dataStatus.runs === 'error' ? 'Unavailable' : dataStatus.runs === 'loading' ? 'Loading…' : runs.length],
          ['Completed runs', dataStatus.runs === 'loading' ? 'Loading…' : dataStatus.runs === 'error' ? 'Unavailable' : completedRuns.length],
          ['Verified runs', dataStatus.runs === 'loading' ? 'Loading…' : dataStatus.runs === 'error' ? 'Unavailable' : verifiedRuns],
          ['Tokens used', dataStatus.runs === 'loading' ? 'Loading…' : dataStatus.runs === 'error' ? 'Unavailable' : totalTokens.toLocaleString()]
        ].map(([label, value]) => <div key={label} className={panelClass}><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-white">{value}</div></div>)}
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <div className={panelClass}>
          <h2 className="font-semibold text-white">Repository status</h2>
          {dataStatus.repos === 'loading' ? <p className="mt-3 text-sm text-slate-400">Loading repositories…</p> : dataStatus.repos === 'error' ? <p className="mt-3 text-sm text-rose-300">Repository status could not be loaded.</p> : repos.length === 0 ? <p className="mt-3 text-sm text-slate-400">No repositories are configured.</p> : (
            <ul className="mt-3 space-y-3">{repos.map(repo => <li key={repo.id} className="flex justify-between gap-3 text-sm"><span className="text-slate-200">{repo.name}</span><span className="text-xs text-slate-400">{repo.status?.isGitRepo ? repo.status.clean ? 'Clean' : `${repo.status.files.length} changed` : 'Not a Git repository'}</span></li>)}</ul>
          )}
        </div>
        <div className={panelClass}>
          <h2 className="font-semibold text-white">Token efficiency summary</h2>
          {dataStatus.runs === 'error' ? <p className="mt-3 text-sm text-rose-300">Run measurements could not be loaded.</p> : measuredRuns.length === 0 ? <p className="mt-3 text-sm text-slate-400">No completed runs with token measurements yet.</p> : (
            <p className="mt-3 text-sm text-slate-300">{totalTokens.toLocaleString()} total tokens across {measuredRuns.length} measured run(s).</p>
          )}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold text-white">Recent runs</h2>
          {dataStatus.runs === 'loading' ? <EmptyState>Loading run history…</EmptyState> : dataStatus.runs === 'error' ? <EmptyState>Run history could not be loaded. Check the server connection and retry.</EmptyState> : runs.length ? <RunList runs={runs.slice(0, 5)} selectedRunId={selectedRunId} onSelect={setSelectedRunId} /> : <EmptyState>No runs yet. Run your first coding task below to see it here.</EmptyState>}
        </div>
        <div className={panelClass}>
          <h2 className="font-semibold text-white">Recent verification results</h2>
          {dataStatus.runs === 'error' ? <p className="mt-3 text-sm text-rose-300">Verification history could not be loaded.</p> : completedRuns.filter(run => run.verification).length === 0 ? <p className="mt-3 text-sm text-slate-400">No verification results yet.</p> : (
            <ul className="mt-3 space-y-3">{completedRuns.filter(run => run.verification).slice(0, 5).map(run => <li key={run.id} className="flex justify-between gap-3 text-sm"><span className="text-slate-300">{run.task}</span><span className={run.verification.verified ? 'text-emerald-300' : 'text-rose-300'}>{run.verification.verified ? 'Verified' : 'Failed'}</span></li>)}</ul>
          )}
        </div>
      </section>
      {selectedRun && <RunDetails run={selectedRun} onOpenDiff={onOpenDiff} />}
    </div>
  );
}
