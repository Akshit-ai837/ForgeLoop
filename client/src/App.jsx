import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ApplicationPages from './components/ApplicationPages.jsx';
import NewTaskCard from './components/NewTaskCard.jsx';
import Stepper from './components/Stepper.jsx';
import ExecutionLog from './components/ExecutionLog.jsx';
import ContextSelectionTable from './components/ContextSelectionTable.jsx';
import TokenEfficiencyCard from './components/TokenEfficiencyCard.jsx';
import VerificationCard from './components/VerificationCard.jsx';
import TaskVerifiedCard from './components/TaskVerifiedCard.jsx';
import DiffModal from './components/DiffModal.jsx';
import { Moon, Sun, ChevronDown } from 'lucide-react';

const validRoutes = new Set(['/dashboard', '/tasks', '/repositories', '/runs', '/benchmarks', '/settings']);

function getRoute() {
  return validRoutes.has(window.location.pathname) ? window.location.pathname : '/dashboard';
}

export default function App() {
  const [theme, setTheme] = useState(() => (
    localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  ));
  const [route, setRoute] = useState(getRoute);
  const [repos, setRepos] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [task, setTask] = useState('');
  const [modelProvider, setModelProvider] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [modelSettings, setModelSettings] = useState({ activeProvider: 'deepseek', modelName: '', providers: [] });
  const [geminiKeyConfigured, setGeminiKeyConfigured] = useState(false);
  const [geminiKeySaveStatus, setGeminiKeySaveStatus] = useState('');
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);

  // Agent State
  const [currentState, setCurrentState] = useState('IDLE');
  const [logs, setLogs] = useState([]);
  const [rankedContext, setRankedContext] = useState(null);
  const [tokenMetrics, setTokenMetrics] = useState(null);
  const [verification, setVerification] = useState(null);
  const [runError, setRunError] = useState('');
  const [diffData, setDiffData] = useState(null);
  const [runs, setRuns] = useState([]);
  const [benchmarks, setBenchmarks] = useState([]);
  const [githubStatus, setGithubStatus] = useState({ configured: false, connected: false, account: null });
  const [githubRepos, setGithubRepos] = useState([]);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState('');
  const [githubMessage, setGithubMessage] = useState('');
  const [dataStatus, setDataStatus] = useState({ repos: 'loading', runs: 'loading', benchmarks: 'loading' });
  const [dashboardStats, setDashboardStats] = useState({ totalRuns: 0, completedRuns: 0, verifiedRuns: 0, tokensUsed: 0 });

  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const activeRunIdRef = useRef(null);
  const eventSourceRef = useRef(null);
  const pendingRunEventsRef = useRef([]);

  // Modals
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!validRoutes.has(window.location.pathname)) {
      window.history.replaceState({}, '', '/dashboard');
    }
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('github') === 'connected') {
      setGithubMessage('GitHub connected.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (query.has('github_error')) {
      setGithubMessage(`GitHub connection failed (${query.get('github_error')}).`);
      window.history.replaceState({}, '', window.location.pathname);
    }

    fetch('/api/github/status')
      .then(res => {
        if (!res.ok) throw new Error(`GitHub status request failed (${res.status})`);
        return res.json();
      })
      .then(status => {
        setGithubStatus(status);
        if (!status.connected) return;
        setGithubReposLoading(true);
        return fetch('/api/github/repos')
          .then(res => res.json().then(data => {
            if (!res.ok) throw new Error(data.error || `GitHub repository request failed (${res.status})`);
            return data;
          }))
          .then(data => setGithubRepos(data.repositories || []))
          .catch(error => setGithubReposError(error.message || 'Could not load GitHub repositories.'))
          .finally(() => setGithubReposLoading(false));
      })
      .catch(error => {
        console.error('Failed to load GitHub connection:', error);
        setGithubReposError(error.message || 'Could not load GitHub connection.');
      });
  }, []);

  useEffect(() => {
    fetch('/api/settings/model')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setModelSettings(data);
          if (data.activeProvider) {
            setModelProvider(data.activeProvider);
          }
        }
      })
      .catch(err => console.error('Failed to load model settings:', err));

    fetch('/api/settings/gemini')
      .then(res => {
        if (!res.ok) throw new Error(`Gemini key status request failed (${res.status})`);
        return res.json();
      })
      .then(data => setGeminiKeyConfigured(Boolean(data.configured)))
      .catch(error => {
        console.error('Failed to load Gemini key status:', error);
        setGeminiKeySaveStatus(error.message || 'Could not load Gemini key status.');
      });
  }, []);

  const navigate = (path) => {
    if (!validRoutes.has(path)) return;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setRoute(path);
  };

  // Load configured repositories and actual process-lifetime history.
  useEffect(() => {
    fetch('/api/repos')
      .then(res => {
        if (!res.ok) throw new Error(`Repository request failed (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (data.repos && data.repos.length > 0) {
          setRepos(data.repos);
          setDataStatus(current => ({ ...current, repos: 'ready' }));
          setSelectedRepoId(current => data.repos.some(repo => repo.id === current) ? current : data.repos[0].id);
        } else {
          setRepos([]);
          setDataStatus(current => ({ ...current, repos: 'ready' }));
        }
      })
      .catch(err => {
        console.error('Failed to load repos:', err);
        setDataStatus(current => ({ ...current, repos: 'error' }));
      });

    fetch('/api/runs')
      .then(res => {
        if (!res.ok) throw new Error(`Run history request failed (${res.status})`);
        return res.json();
      })
      .then(data => {
        setRuns(data.runs || []);
        setDataStatus(current => ({ ...current, runs: 'ready' }));
      })
      .catch(err => {
        console.error('Failed to load run history:', err);
        setDataStatus(current => ({ ...current, runs: 'error' }));
      });

    fetch('/api/agent/benchmarks')
      .then(res => {
        if (!res.ok) throw new Error(`Benchmark history request failed (${res.status})`);
        return res.json();
      })
      .then(data => {
        setBenchmarks(data.benchmarks || []);
        setDataStatus(current => ({ ...current, benchmarks: 'ready' }));
      })
      .catch(err => {
        console.error('Failed to load benchmark history:', err);
        setDataStatus(current => ({ ...current, benchmarks: 'error' }));
      });

    fetch('/api/dashboard')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.stats) setDashboardStats(data.stats);
      })
      .catch(err => console.error('Failed to load dashboard stats:', err));
  }, []);

  // Connect to SSE for real-time harness telemetry
  useEffect(() => {
    let eventSource = null;

    function queueUnassignedRunEvent(type, data) {
      const runId = data.runId || data.run?.id;
      if (activeRunIdRef.current || !runId) return false;
      pendingRunEventsRef.current = [
        ...pendingRunEventsRef.current,
        { type, data, runId }
      ].slice(-200);
      return true;
    }

    function connectSSE() {
      eventSource = new EventSource('/api/agent/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.addEventListener('state', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (queueUnassignedRunEvent('state', data)) return;
          if (!activeRunIdRef.current || data.runId !== activeRunIdRef.current) return;
          if (data.state) setCurrentState(data.state);
          if (data.logs) setLogs(data.logs);
          if (data.runId) {
            setRuns(prev => prev.map(run => run.id === data.runId
              ? { ...run, state: data.state || run.state, logs: data.logs || run.logs }
              : run));
          }
        } catch (err) {
          console.error('Failed to process agent state event:', err);
        }
      });

      eventSource.addEventListener('state_changed', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (queueUnassignedRunEvent('state_changed', data)) return;
          if (!activeRunIdRef.current || data.runId !== activeRunIdRef.current) return;
          setCurrentState(data.state);
          setRuns(prev => prev.map(run => run.id === data.runId ? { ...run, state: data.state } : run));
        } catch (err) {
          console.error('Failed to process agent state change event:', err);
        }
      });

      eventSource.addEventListener('log', (e) => {
        try {
          const logItem = JSON.parse(e.data);
          if (queueUnassignedRunEvent('log', logItem)) return;
          if (!activeRunIdRef.current || logItem.runId !== activeRunIdRef.current) return;
          setLogs(prev => [...prev, logItem]);
          setRuns(prev => prev.map(run => run.id === logItem.runId
            ? {
              ...run,
              logs: [...(run.logs || []), logItem],
              contextFiles: logItem.meta?.ranked || run.contextFiles,
              plan: logItem.meta?.plan || run.plan,
              codeChanges: logItem.meta?.codeChanges
                ? [...(run.codeChanges || []), ...logItem.meta.codeChanges]
                : run.codeChanges
            }
            : run));

          if (logItem.meta?.ranked) {
            setRankedContext(prev => ({
              ...(prev || {}),
              scoredFiles: logItem.meta.ranked
            }));
          }
        } catch (err) {
          console.error('Failed to process agent log event:', err);
        }
      });

      eventSource.addEventListener('completed', (e) => {
        try {
          const result = JSON.parse(e.data);
          if (queueUnassignedRunEvent('completed', result)) return;
          if (!activeRunIdRef.current || result.run?.id !== activeRunIdRef.current) return;
          setIsRunning(false);
          activeRunIdRef.current = null;
          if (result.run) {
            setRuns(prev => [result.run, ...prev.filter(run => run.id !== result.run.id)]);
            setLogs(result.run.logs || []);
            setRunError(result.run.error || '');
            setDiffData(result.run.diffData || result.run.verification?.evidence?.gitDiff || null);
            fetch('/api/repos')
              .then(res => {
                if (!res.ok) throw new Error(`Repository status request failed (${res.status})`);
                return res.json();
              })
              .then(data => {
                setRepos(data.repos || []);
                setDataStatus(current => ({ ...current, repos: 'ready' }));
              })
              .catch(err => {
                console.error('Failed to refresh repository status:', err);
                setDataStatus(current => ({ ...current, repos: 'error' }));
              });
            fetch('/api/dashboard')
              .then(res => res.ok ? res.json() : null)
              .then(data => { if (data?.stats) setDashboardStats(data.stats); })
              .catch(err => console.error('Failed to refresh dashboard stats:', err));
          }
          if (result.state) setCurrentState(result.state);
          if (result.rankedContext) setRankedContext(result.rankedContext);
          if (result.tokenMetrics) setTokenMetrics(result.tokenMetrics);
          if (result.verification) setVerification(result.verification);
          if (result.verification?.evidence?.gitDiff) {
            setDiffData(result.verification.evidence.gitDiff);
          }
        } catch (err) {
          console.error('Failed to process agent completion event:', err);
        }
      });

      eventSource.addEventListener('run_error', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (queueUnassignedRunEvent('run_error', data)) return;
          if (!activeRunIdRef.current || data.runId !== activeRunIdRef.current) return;
          setIsRunning(false);
          activeRunIdRef.current = null;
          setCurrentState(data.run?.state || 'FAILED');
          setRunError(data.error || data.run?.error || 'Agent execution failed.');
          if (data.run) {
            setLogs(data.run.logs || []);
            setTokenMetrics(data.run.tokenMetrics || null);
            setVerification(data.run.verification || null);
            setRuns(prev => [data.run, ...prev.filter(run => run.id !== data.run.id)]);
          }
        } catch (err) {
          console.error('Failed to process run error event:', err);
        }
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        setTimeout(connectSSE, 3000);
      };
    }

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Run the agent
  const handleRunAgent = async () => {
    const submittedTask = task;
    const repository = selectedRepoId;
    if (!submittedTask.trim() || !repository || isRunning) return;

    setIsRunning(true);
    setVerification(null);
    setRunError('');
    setDiffData(null);
    setLogs([]);
    setRankedContext(null);
    setTokenMetrics(null);
    setCurrentState('IDLE');
    activeRunIdRef.current = null;
    pendingRunEventsRef.current = [];

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: submittedTask,
          repository,
          modelProvider,
          modelConfig: { apiKey }
        })
      });

      const data = await res.json();
      if (data.run) {
        activeRunIdRef.current = data.run.id;
        const pendingEvents = pendingRunEventsRef.current;
        pendingRunEventsRef.current = pendingEvents.filter(event => event.runId !== data.run.id);
        pendingEvents
          .filter(event => event.runId === data.run.id)
          .forEach(event => {
            eventSourceRef.current?.dispatchEvent(new MessageEvent(event.type, {
              data: JSON.stringify(event.data)
            }));
          });
        setRuns(prev => {
          const existing = prev.find(run => run.id === data.run.id);
          if (existing?.endTime) return prev;
          return [data.run, ...prev.filter(run => run.id !== data.run.id)];
        });
        if (data.run.status === 'FAILED') {
          setIsRunning(false);
          activeRunIdRef.current = null;
          setCurrentState('FAILED');
          setRunError(data.error || data.run.error || 'Agent execution failed.');
          setLogs(data.run.logs || []);
        }
      }
      if (!res.ok && !data.run) {
        setRunError(data.error || 'Server error');
        setCurrentState('FAILED');
        setIsRunning(false);
      }
    } catch (err) {
      console.error(err);
      setRunError(err.message || 'Network error communicating with ForgeLoop server.');
      setCurrentState('FAILED');
      activeRunIdRef.current = null;
      setIsRunning(false);
    }
  };

  // Run benchmark comparison
  const handleRunBenchmark = async () => {
    try {
      const res = await fetch('/api/agent/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: selectedRepoId,
          task
        })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `Benchmark request failed (${res.status})`);
      }
      const data = await res.json();
      setBenchmarks(prev => [data, ...prev.filter(benchmark => benchmark.id !== data.id)]);
      return data;
    } catch (err) {
      console.error('Failed to run benchmark:', err);
      throw err;
    }
  };

  const handleSaveModelConfig = async ({ provider, apiKey: submittedKey, modelName }) => {
    setIsSavingGeminiKey(true);
    setGeminiKeySaveStatus('');
    try {
      const response = await fetch('/api/settings/model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider || modelProvider,
          apiKey: submittedKey !== undefined ? submittedKey : apiKey,
          modelName
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save model settings.');
      setModelSettings(data);
      if (data.activeProvider) setModelProvider(data.activeProvider);
      setApiKey('');
      setGeminiKeySaveStatus(`Settings saved for ${provider || modelProvider}.`);
    } catch (err) {
      setGeminiKeySaveStatus(err.message || 'Could not save model settings.');
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  const handleSaveGeminiKey = async () => {
    const submittedKey = apiKey.trim();
    if (!submittedKey) {
      setGeminiKeySaveStatus('Enter a Gemini API key before saving.');
      return;
    }

    setIsSavingGeminiKey(true);
    setGeminiKeySaveStatus('');
    try {
      const response = await fetch('/api/settings/gemini', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: submittedKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Gemini key save failed (${response.status})`);
      setApiKey('');
      setGeminiKeyConfigured(Boolean(data.configured));
      setGeminiKeySaveStatus('Gemini API key saved securely on the server.');
    } catch (error) {
      setGeminiKeySaveStatus(error.message || 'Could not save Gemini API key.');
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  const handleDisconnectGithub = async () => {
    try {
      const response = await fetch('/api/github/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error(`GitHub disconnect failed (${response.status})`);
      setGithubStatus(status => ({ ...status, connected: false, account: null }));
      setGithubRepos([]);
      setGithubReposError('');
      setGithubMessage('GitHub disconnected.');
    } catch (error) {
      setGithubMessage(error.message || 'Could not disconnect GitHub.');
    }
  };

  // Reset demo repos
  const handleResetRepos = async () => {
    try {
      const response = await fetch('/api/repos/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: selectedRepoId })
      });
      if (!response.ok) throw new Error(`Repository reset failed (${response.status})`);
      const repoResponse = await fetch('/api/repos');
      if (!repoResponse.ok) throw new Error(`Repository status request failed (${repoResponse.status})`);
      const repoData = await repoResponse.json();
      setRepos(repoData.repos || []);
      setDataStatus(current => ({ ...current, repos: 'ready' }));
      setVerification(null);
      setDiffData(null);
      setCurrentState('IDLE');
    } catch (err) {
      console.error('Failed to reset repositories:', err);
      alert(err.message || 'Failed to reset repositories.');
    }
  };

  const currentRepo = repos.find(r => r.id === selectedRepoId) || repos[0];
  const isDashboard = route === '/dashboard';

  return (
    <div className="flex h-screen bg-[#070b14] text-slate-100 font-sans overflow-hidden">
      <Sidebar
        activeTab={route.slice(1)}
        onNavigate={navigate}
        currentRepo={currentRepo}
        modelProvider={modelProvider}
        isConnected={isConnected}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-14 border-b border-slate-800/80 bg-[#0a0f1d] px-8 flex items-center justify-end gap-4 shrink-0">
          <button
            type="button"
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
            onClick={() => setTheme(currentTheme => currentTheme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            aria-pressed={theme === 'light'}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-purple-600/80 text-white flex items-center justify-center text-xs font-bold ring-2 ring-purple-500/30">
              U
            </div>
            <span className="text-xs font-medium text-slate-300">User</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </div>
        </header>

        <main className="p-8 space-y-6 max-w-[1700px] w-full mx-auto">
          {!isDashboard && (
            <ApplicationPages
              route={route}
              repos={repos}
              runs={runs}
              benchmarks={benchmarks}
              dataStatus={dataStatus}
              selectedRepoId={selectedRepoId}
              onSelectRepo={setSelectedRepoId}
              onRunBenchmark={handleRunBenchmark}
              task={task}
              setTask={setTask}
              modelProvider={modelProvider}
              setModelProvider={setModelProvider}
              apiKey={apiKey}
              setApiKey={setApiKey}
              geminiKeyConfigured={geminiKeyConfigured}
              geminiKeySaveStatus={geminiKeySaveStatus}
              isSavingGeminiKey={isSavingGeminiKey}
              onSaveGeminiKey={handleSaveGeminiKey}
              modelSettings={modelSettings}
              onSaveModelConfig={handleSaveModelConfig}
              githubStatus={githubStatus}
              githubRepos={githubRepos}
              githubReposLoading={githubReposLoading}
              githubReposError={githubReposError}
              githubMessage={githubMessage}
              onConnectGithub={() => window.location.assign('/api/github/login')}
              onDisconnectGithub={handleDisconnectGithub}
              onOpenDiff={(run) => {
                setDiffData(run?.diffData || run?.verification?.evidence?.gitDiff || null);
                setIsDiffOpen(true);
              }}
            />
          )}

          {isDashboard && (
            <>
              {/* Dashboard Summary Statistics from Database */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Tasks</div>
                  <div className="mt-1 text-2xl font-bold text-white font-mono">{dashboardStats.totalRuns || runs.length}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Submitted agent tasks</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Completed</div>
                  <div className="mt-1 text-2xl font-bold text-blue-400 font-mono">{dashboardStats.completedRuns}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Finished executions</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Verified</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-400 font-mono">{dashboardStats.verifiedRuns}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Passed tests & diffs</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tokens Used</div>
                  <div className="mt-1 text-2xl font-bold text-purple-400 font-mono">{(dashboardStats.tokensUsed || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Total model tokens</div>
                </div>
              </div>

              <NewTaskCard
                task={task}
                setTask={setTask}
                repos={repos}
                selectedRepoId={selectedRepoId}
                setSelectedRepoId={setSelectedRepoId}
                modelProvider={modelProvider}
                setModelProvider={setModelProvider}
                apiKey={apiKey}
                setApiKey={setApiKey}
                onRunAgent={handleRunAgent}
                isRunning={isRunning}
                onResetRepos={handleResetRepos}
              />
              {runError && <p role="alert" className="text-sm text-rose-300">{runError}</p>}

              <Stepper currentState={currentState} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[380px]">
                <ExecutionLog logs={logs} isRunning={isRunning} />
                <ContextSelectionTable rankedContext={rankedContext} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[220px]">
                <TokenEfficiencyCard tokenMetrics={tokenMetrics} />
                <VerificationCard
                  verification={verification}
                  onOpenDiff={() => setIsDiffOpen(true)}
                />
                <TaskVerifiedCard
                  onOpenDiff={() => setIsDiffOpen(true)}
                  onRunAgain={handleRunAgent}
                  currentState={isRunning ? currentState : runError ? 'FAILED' : currentState}
                  isRunning={isRunning}
                  verification={verification}
                />
              </div>
            </>
          )}
        </main>
      </div>

      <DiffModal
        isOpen={isDiffOpen}
        onClose={() => setIsDiffOpen(false)}
        diffData={diffData}
      />
    </div>
  );
}
