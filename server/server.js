import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { AgentOrchestrator } from './agent/orchestrator.js';
import { gitDiff, gitStatus, gitReset } from './tools/gitTools.js';
import { estimateTokens } from './agent/tokenManager.js';
import { listFiles } from './tools/fileTools.js';
import { getConfiguredCheckCommand } from './tools/commandTools.js';
import { db } from './db/database.js';
import { ModelProviderFactory } from './services/modelProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });
const demoBaseDir = path.resolve(__dirname, '../demo-repos');
const localEnvPath = path.join(__dirname, '.env.local');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Active orchestrator and SSE client connections
let currentOrchestrator = null;
let currentRunId = null;
const sseClients = new Set();
const runHistory = [];
const benchmarkHistory = [];
const githubConnections = new Map();
const githubOAuthStates = new Map();
const githubSessionCookie = 'forgeloop_github_session';

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return null;
}

function setGithubSessionCookie(req, res, sessionId) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader(
    'Set-Cookie',
    `${githubSessionCookie}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`
  );
}

function githubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL
  };
}

function githubOAuthConfigured() {
  const { clientId, clientSecret, callbackUrl } = githubOAuthConfig();
  return Boolean(clientId && clientSecret && callbackUrl);
}

function githubErrorRedirect(res, code) {
  const query = new URLSearchParams({ github_error: code });
  res.redirect(`/settings?${query.toString()}`);
}

function isLoopbackAddress(address = '') {
  const normalizedAddress = address.toLowerCase().replace(/^::ffff:/, '');
  return normalizedAddress === '::1' || normalizedAddress.startsWith('127.');
}

async function githubApiRequest(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ForgeLoop'
    }
  });
  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}));
    throw new Error(responseBody.message || `GitHub API request failed (${response.status}).`);
  }
  return response.json();
}

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// ----------------------------------------------------
// Model Provider Configuration Endpoints
// ----------------------------------------------------
app.get('/api/settings/model', (req, res) => {
  const activeProvider = (process.env.MODEL_PROVIDER || ModelProviderFactory.detectProviderFromEnv() || 'deepseek').toLowerCase();
  res.json({
    activeProvider,
    modelName: process.env.MODEL_NAME || null,
    providers: ModelProviderFactory.getAvailableProviders()
  });
});

app.put('/api/settings/model', (req, res) => {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return res.status(403).json({ error: 'Model settings are available only from this computer.' });
  }

  const { provider = 'deepseek', apiKey, modelName, baseURL } = req.body || {};
  const normalizedProvider = provider.toLowerCase().trim();

  let currentEnv = '';
  if (fs.existsSync(localEnvPath)) {
    try {
      currentEnv = fs.readFileSync(localEnvPath, 'utf8');
    } catch (_) {}
  }

  const envLines = new Map();
  for (const line of currentEnv.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      envLines.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
    }
  }

  envLines.set('MODEL_PROVIDER', JSON.stringify(normalizedProvider));
  if (modelName) envLines.set('MODEL_NAME', JSON.stringify(modelName.trim()));
  if (baseURL) envLines.set('MODEL_BASE_URL', JSON.stringify(baseURL.trim()));

  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    const keyVal = apiKey.trim();
    if (normalizedProvider === 'deepseek') {
      envLines.set('DEEPSEEK_API_KEY', JSON.stringify(keyVal));
      process.env.DEEPSEEK_API_KEY = keyVal;
    } else if (normalizedProvider === 'qwen') {
      envLines.set('QWEN_API_KEY', JSON.stringify(keyVal));
      process.env.QWEN_API_KEY = keyVal;
    } else if (normalizedProvider === 'gemini') {
      envLines.set('GEMINI_API_KEY', JSON.stringify(keyVal));
      process.env.GEMINI_API_KEY = keyVal;
    } else {
      envLines.set('OPENAI_API_KEY', JSON.stringify(keyVal));
      process.env.OPENAI_API_KEY = keyVal;
    }
    process.env.MODEL_API_KEY = keyVal;
  }

  process.env.MODEL_PROVIDER = normalizedProvider;
  if (modelName) process.env.MODEL_NAME = modelName.trim();
  if (baseURL) process.env.MODEL_BASE_URL = baseURL.trim();

  const newEnvContent = [...envLines.entries()].map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  const temporaryPath = `${localEnvPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, newEnvContent, { mode: 0o600 });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, localEnvPath);
    res.json({
      success: true,
      activeProvider: normalizedProvider,
      modelName: process.env.MODEL_NAME || null,
      providers: ModelProviderFactory.getAvailableProviders()
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not save model configuration on the server.' });
  }
});

app.get('/api/settings/gemini', (req, res) => {
  res.json({ configured: Boolean(process.env.GEMINI_API_KEY || process.env.MODEL_API_KEY) });
});

app.put('/api/settings/gemini', (req, res) => {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return res.status(403).json({ error: 'Gemini key settings are available only from this computer.' });
  }

  const origin = req.get('origin');
  if (origin) {
    let originUrl;
    try {
      originUrl = new URL(origin);
    } catch {
      return res.status(403).json({ error: 'Gemini key settings are available only to the local app.' });
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname)) {
      return res.status(403).json({ error: 'Gemini key settings are available only to the local app.' });
    }
  }

  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  if (!apiKey || apiKey.length > 4096) {
    return res.status(400).json({ error: 'A Gemini API key between 1 and 4096 characters is required.' });
  }

  const temporaryPath = `${localEnvPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `GEMINI_API_KEY=${JSON.stringify(apiKey)}\n`, { mode: 0o600 });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, localEnvPath);
    process.env.GEMINI_API_KEY = apiKey;
    res.json({ configured: true });
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch (cleanupError) {
      console.error('Failed to clean up temporary Gemini configuration:', cleanupError.message);
    }
    console.error('Failed to save Gemini API key:', error.message);
    res.status(500).json({ error: 'Could not save Gemini API key on the server.' });
  }
});

app.get('/api/github/status', (req, res) => {
  const sessionId = getCookie(req, githubSessionCookie);
  const connection = sessionId ? githubConnections.get(sessionId) : null;
  res.json({
    configured: githubOAuthConfigured(),
    connected: Boolean(connection),
    account: connection ? {
      login: connection.user.login,
      name: connection.user.name,
      avatarUrl: connection.user.avatar_url
    } : null
  });
});

app.get('/api/github/login', (req, res) => {
  const { clientId, callbackUrl } = githubOAuthConfig();
  if (!githubOAuthConfigured()) {
    return res.status(503).send('GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL on the server.');
  }

  const previousSessionId = getCookie(req, githubSessionCookie);
  if (previousSessionId) githubConnections.delete(previousSessionId);
  const sessionId = randomBytes(32).toString('hex');
  const state = randomBytes(32).toString('hex');
  for (const [existingState, pending] of githubOAuthStates) {
    if (pending.expiresAt < Date.now()) githubOAuthStates.delete(existingState);
  }
  githubOAuthStates.set(state, {
    sessionId,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  setGithubSessionCookie(req, res, sessionId);

  const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizationUrl.searchParams.set('scope', 'repo read:user');
  authorizationUrl.searchParams.set('state', state);
  res.redirect(authorizationUrl.toString());
});

app.get('/api/github/callback', async (req, res) => {
  const { clientId, clientSecret } = githubOAuthConfig();
  if (!githubOAuthConfigured()) {
    return githubErrorRedirect(res, 'oauth_not_configured');
  }
  const { code, state, error } = req.query;
  if (error) return githubErrorRedirect(res, 'authorization_denied');
  if (typeof code !== 'string' || typeof state !== 'string') {
    return githubErrorRedirect(res, 'invalid_callback');
  }

  const pending = githubOAuthStates.get(state);
  githubOAuthStates.delete(state);
  const sessionId = getCookie(req, githubSessionCookie);
  if (!pending || pending.expiresAt < Date.now() || pending.sessionId !== sessionId) {
    return githubErrorRedirect(res, 'invalid_or_expired_state');
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: githubOAuthConfig().callbackUrl
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokenData.access_token !== 'string') {
      throw new Error('GitHub did not issue an access token.');
    }
    if (typeof tokenData.scope === 'string' && !tokenData.scope.split(',').includes('repo')) {
      throw new Error('The GitHub authorization did not grant the repo scope required to list private repositories.');
    }

    const user = await githubApiRequest('https://api.github.com/user', tokenData.access_token);
    if (typeof user.login !== 'string') {
      throw new Error('GitHub returned an invalid account profile.');
    }
    githubConnections.set(sessionId, {
      accessToken: tokenData.access_token,
      user: {
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url
      }
    });
    res.redirect('/settings?github=connected');
  } catch (err) {
    console.error('GitHub OAuth callback failed:', err.message);
    githubErrorRedirect(res, 'token_exchange_failed');
  }
});

app.get('/api/github/repos', async (req, res) => {
  const sessionId = getCookie(req, githubSessionCookie);
  const connection = sessionId ? githubConnections.get(sessionId) : null;
  if (!connection) {
    return res.status(401).json({ error: 'Connect a GitHub account before loading repositories.' });
  }

  try {
    const repositories = [];
    for (let page = 1; ; page += 1) {
      const url = new URL('https://api.github.com/user/repos');
      url.searchParams.set('visibility', 'all');
      url.searchParams.set('affiliation', 'owner,collaborator,organization_member');
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));
      url.searchParams.set('sort', 'full_name');
      const pageRepositories = await githubApiRequest(url, connection.accessToken);
      if (!Array.isArray(pageRepositories)) {
        throw new Error('GitHub returned an invalid repository list.');
      }
      repositories.push(...pageRepositories.map(repository => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        private: repository.private,
        url: repository.html_url,
        defaultBranch: repository.default_branch,
        updatedAt: repository.updated_at,
        owner: repository.owner?.login
      })));
      if (pageRepositories.length < 100) break;
    }
    res.json({ repositories });
  } catch (err) {
    res.status(502).json({ error: `Could not load GitHub repositories: ${err.message}` });
  }
});

app.post('/api/github/disconnect', (req, res) => {
  const sessionId = getCookie(req, githubSessionCookie);
  if (sessionId) githubConnections.delete(sessionId);
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader('Set-Cookie', `${githubSessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
  res.json({ success: true });
});

app.get('/api/repos', async (req, res) => {
  try {
    const repos = [
      {
        id: 'products-api',
        name: 'Products API',
        path: path.join(demoBaseDir, 'products-api'),
        description: 'Express REST API with product catalog data and route handlers.',
      },
      {
        id: 'auth-service',
        name: 'Auth Service',
        path: path.join(demoBaseDir, 'auth-service'),
        suggestedTask: 'Fix authentication middleware to reject expired tokens and require Bearer prefix.',
        description: 'Authentication middleware verifying Bearer tokens and expiration timestamps.',
      },
      {
        id: 'user-registration',
        name: 'User Registration Service',
        path: path.join(demoBaseDir, 'user-registration'),
        description: 'User registration endpoint controller and tests.'
      }
    ].map(async repo => ({
      ...repo,
      status: await gitStatus(repo.path),
      testCommand: getConfiguredCheckCommand(repo.path, 'test'),
      buildCommand: getConfiguredCheckCommand(repo.path, 'build'),
      lintCommand: getConfiguredCheckCommand(repo.path, 'lint')
    }));

    res.json({ repos: await Promise.all(repos) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/repos/reset', async (req, res) => {
  try {
    const { repoId } = req.body;
    if (!repoId) {
      return res.status(400).json({ error: 'A repository id is required; bulk repository reset is disabled.' });
    }
    if (!['products-api', 'auth-service', 'user-registration'].includes(repoId)) {
      return res.status(404).json({ error: `Repository not found: ${repoId}` });
    }
    const repoPath = path.join(demoBaseDir, repoId);
    await gitReset(repoPath);
    broadcastSSE('log', {
      timeFormatted: new Date().toLocaleTimeString('en-US', { hour12: false }),
      message: `${repoId} reset to its initial state.`,
      type: 'info'
    });
    res.json({ success: true, message: 'Repository reset successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Realtime SSE Endpoint
// ----------------------------------------------------
app.get('/api/agent/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  // Send current state immediately on connect
  if (currentOrchestrator) {
    res.write(`event: state\ndata: ${JSON.stringify({
      ...currentOrchestrator.stateManager.getSnapshot(),
      runId: currentRunId
    })}\n\n`);
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ----------------------------------------------------
// Agent State & Control Endpoints
// ----------------------------------------------------
app.get('/api/agent/state', (req, res) => {
  if (!currentOrchestrator) {
    return res.json({
      state: 'IDLE',
      task: null,
      progressSteps: [],
      logs: []
    });
  }
  res.json(currentOrchestrator.stateManager.getSnapshot());
});

app.get('/api/agent/runs', (req, res) => {
  const runs = db.getAllRuns();
  res.json({ runs });
});

app.get('/api/runs', (req, res) => {
  const runs = db.getAllRuns();
  res.json({ runs });
});

app.get('/api/runs/:id', (req, res) => {
  const run = db.getRunById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

app.get('/api/runs/:id/logs', (req, res) => {
  const run = db.getRunById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ logs: run.logs });
});

app.get('/api/runs/:id/context', (req, res) => {
  const run = db.getRunById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ contextFiles: run.contextFiles, rankedContext: run.rankedContext });
});

app.get('/api/runs/:id/tests', (req, res) => {
  const run = db.getRunById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ tests: run.tests });
});

app.get('/api/runs/:id/metrics', (req, res) => {
  const run = db.getRunById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ tokenMetrics: run.tokenMetrics });
});

app.get('/api/dashboard', (req, res) => {
  const stats = db.getDashboardStats();
  const recentRuns = db.getAllRuns(10);
  res.json({ stats, recentRuns });
});

app.get('/api/tasks', (req, res) => {
  const runs = db.getAllRuns();
  const tasks = runs.map(r => ({
    id: r.id,
    task: r.task,
    repository: r.repository,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    verificationStatus: r.verificationStatus
  }));
  res.json({ tasks });
});

app.get('/api/agent/benchmarks', (req, res) => {
  res.json({ benchmarks: benchmarkHistory });
});

const handleRunAgentRequest = async (req, res) => {
  try {
    const { repository, repoId, task, modelProvider, modelConfig = {} } = req.body;
    const targetRepo = repository || repoId;
    if (typeof task !== 'string' || !task.trim()) {
      return res.status(400).json({ error: 'A non-empty task is required.' });
    }
    if (typeof targetRepo !== 'string' || !targetRepo) {
      return res.status(400).json({ error: 'A configured repository is required.' });
    }

    const configuredRepos = new Map([
      ['products-api', path.join(demoBaseDir, 'products-api')],
      ['auth-service', path.join(demoBaseDir, 'auth-service')],
      ['user-registration', path.join(demoBaseDir, 'user-registration')]
    ]);
    const resolvedPath = configuredRepos.get(targetRepo);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Configured repository not found: ${targetRepo}` });
    }

    const runId = randomUUID();
    currentOrchestrator = null;
    currentRunId = runId;

    // Create persistent run in SQLite database
    const run = db.createRun({
      id: runId,
      task,
      repository: targetRepo,
      status: 'RUNNING',
      currentStage: 'IDLE',
      createdAt: new Date().toISOString()
    });

    const targetProvider = (
      modelProvider ||
      process.env.MODEL_PROVIDER ||
      ModelProviderFactory.detectProviderFromEnv() ||
      'deepseek'
    ).toLowerCase().trim();

    let providerInstance;
    try {
      providerInstance = ModelProviderFactory.create(targetProvider, {
        ...modelConfig,
        apiKey: typeof modelConfig?.apiKey === 'string' && modelConfig.apiKey.trim()
          ? modelConfig.apiKey.trim()
          : undefined
      });
    } catch (err) {
      const errorMsg = `INVALID MODEL PROVIDER: ${err.message}`;
      const completedAt = new Date().toISOString();
      db.addLog(run.id, { timestamp: completedAt, stage: 'FAILED', message: errorMsg, type: 'error' });
      const failedRun = db.completeRun(run.id, {
        status: 'FAILED',
        currentStage: 'FAILED',
        completedAt,
        error: errorMsg,
        verificationStatus: 'PROVIDER_ERROR',
        finalResult: errorMsg
      });
      return res.status(400).json({ error: errorMsg, run: failedRun });
    }

    const modelInfo = providerInstance.getModelInfo();
    if (!modelInfo.isConfigured) {
      const errorMsg = `MODEL NOT CONFIGURED: A valid API key must be provided for ${modelInfo.provider} (${providerInstance.getExpectedEnvKey()} or in Settings) to run autonomous coding tasks.`;
      const completedAt = new Date().toISOString();
      db.addLog(run.id, {
        timestamp: completedAt,
        stage: 'FAILED',
        message: errorMsg,
        type: 'error'
      });
      const failedRun = db.completeRun(run.id, {
        status: 'FAILED',
        currentStage: 'FAILED',
        completedAt,
        error: errorMsg,
        verificationStatus: 'MODEL_NOT_CONFIGURED',
        finalResult: `MODEL NOT CONFIGURED: Execution aborted because no API key is configured for ${modelInfo.provider}.`
      });
      return res.status(503).json({ error: errorMsg, run: failedRun });
    }

    const orchestrator = new AgentOrchestrator({
      repoPath: resolvedPath,
      modelProvider: providerInstance,
      modelConfig: {
        ...modelConfig,
        apiKey: providerInstance.apiKey,
        model: providerInstance.model,
        baseURL: providerInstance.baseURL
      }
    });
    currentOrchestrator = orchestrator;

    // Wire up orchestrator events to SSE broadcast and SQLite persistence
    orchestrator.stateManager.on('state_changed', (evt) => {
      db.updateRunStage(run.id, evt.state);
      broadcastSSE('state_changed', { ...evt, runId: run.id });
    });

    orchestrator.stateManager.on('log', (logItem) => {
      db.addLog(run.id, {
        timestamp: logItem.timestamp || new Date().toISOString(),
        stage: orchestrator.stateManager.currentState,
        message: logItem.message,
        type: logItem.type,
        meta: logItem.meta
      });
      broadcastSSE('log', { ...logItem, runId: run.id });
    });

    orchestrator.stateManager.on('update', (snapshot) => {
      broadcastSSE('state', { ...snapshot, runId: run.id });
    });

    // Respond immediately that agent run started with unique run ID
    res.json({ status: 'STARTED', run: db.getRunById(run.id) });

    // Execute run asynchronously and persist final evidence to DB
    (async () => {
      try {
        const result = await orchestrator.run(task);
        const finalDiff = await gitDiff(resolvedPath);

        if (result.rankedContext?.scoredFiles) {
          db.saveContext(run.id, result.rankedContext.scoredFiles);
        }
        if (result.diffData?.fileDiffs || finalDiff?.fileDiffs) {
          db.saveFiles(run.id, result.diffData?.fileDiffs || finalDiff?.fileDiffs || []);
        }
        if (result.tests) {
          db.saveTests(run.id, result.tests);
        }
        if (result.tokenMetrics) {
          db.saveMetrics(run.id, result.tokenMetrics);
        }

        const isVerified = result.verification?.verified;
        const verificationStatus = isVerified ? 'TASK_VERIFIED' : (result.diffData?.totalFilesChanged === 0 ? 'IMPLEMENTATION_NOT_VERIFIED' : 'VERIFICATION_FAILED');
        const finalRun = db.completeRun(run.id, {
          status: result.state || (isVerified ? 'COMPLETED' : 'FAILED'),
          currentStage: result.state || (isVerified ? 'COMPLETED' : 'FAILED'),
          completedAt: new Date().toISOString(),
          finalResult: result.verification?.summary || (isVerified ? 'TASK VERIFIED' : 'VERIFICATION FAILED'),
          verificationStatus,
          durationMs: result.durationMs || null
        });

        broadcastSSE('completed', { ...result, run: finalRun });
      } catch (err) {
        const completedAt = new Date().toISOString();
        const execution = orchestrator.runData || {};
        if (execution.rankedContext?.scoredFiles) {
          db.saveContext(run.id, execution.rankedContext.scoredFiles);
        }
        if (execution.diffData?.fileDiffs) {
          db.saveFiles(run.id, execution.diffData.fileDiffs);
        }
        if (execution.tests) {
          db.saveTests(run.id, execution.tests);
        }
        if (orchestrator.tokenManager) {
          db.saveMetrics(run.id, orchestrator.tokenManager.getMetrics());
        }

        db.addLog(run.id, {
          timestamp: completedAt,
          stage: 'FAILED',
          message: err.message,
          type: 'error'
        });

        const failedRun = db.completeRun(run.id, {
          status: 'FAILED',
          currentStage: 'FAILED',
          completedAt,
          error: err.message,
          verificationStatus: 'FAILED',
          finalResult: `Execution failed: ${err.message}`
        });

        broadcastSSE('log', {
          timestamp: completedAt,
          type: 'error',
          message: err.message,
          runId: run.id
        });
        broadcastSSE('run_error', { runId: run.id, error: err.message, run: failedRun });
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/agent/run', handleRunAgentRequest);
app.post('/api/runs', handleRunAgentRequest);

// ----------------------------------------------------
// Token Efficiency Benchmark Comparison Endpoint
// ----------------------------------------------------
app.post('/api/agent/benchmark', async (req, res) => {
  try {
    const { repoId, task } = req.body;
    const resolvedPath = path.join(demoBaseDir, repoId || 'products-api');

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Measure naive baseline:
    // Reads EVERY file in repository, packs them into a large prompt without filtering
    const allFiles = await listFiles(resolvedPath);
    let fullRepoContent = '';
    for (const f of allFiles) {
      try {
        const c = fs.readFileSync(path.join(resolvedPath, f.path), 'utf8');
        fullRepoContent += `\n--- FILE: ${f.path} ---\n${c}`;
      } catch (e) {}
    }

    const baselinePromptTokens = estimateTokens(`TASK: ${task}\n\nENTIRE REPOSITORY:\n${fullRepoContent}`);
    // Across 3 round trips (Plan, Implement, Verify), naive approaches resend the entire repo context:
    const baselineTotalTokens = baselinePromptTokens * 3;

    // ForgeLoop Context Engine measure:
    const orch = new AgentOrchestrator({ repoPath: resolvedPath });
    const rankedContext = await orch.contextEngine.rankRepositoryContext(resolvedPath, task);
    const targetContext = await orch.contextEngine.extractTargetContext(resolvedPath, rankedContext);

    const forgeLoopTokens = targetContext.totalSelectedTokens + estimateTokens(task);
    const forgeLoopTotalEstimated = forgeLoopTokens * 2 + 150; // selective context only

    const tokensSaved = Math.max(0, baselineTotalTokens - forgeLoopTotalEstimated);
    const savingsPercent = Math.round((tokensSaved / baselineTotalTokens) * 100);

    const benchmark = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      repoId: repoId || path.basename(resolvedPath),
      createdAt: new Date().toISOString(),
      task,
      baseline: {
        method: "Naive Full Repository Dump",
        allFilesCount: allFiles.length,
        contextTokensPerTurn: baselinePromptTokens,
        turnsEstimated: 3,
        totalTokens: baselineTotalTokens,
        description: "Dumps entire repository and unpruned conversation history on every turn"
      },
      forgeLoop: {
        method: "ForgeLoop Targeted Context Engine",
        filesSearched: rankedContext.totalFiles,
        filesSelected: targetContext.filesSelectedCount,
        filesAvoided: targetContext.filesAvoidedCount,
        contextTokensPerTurn: targetContext.totalSelectedTokens,
        totalTokens: forgeLoopTotalEstimated,
        description: "Searches before reading, ranks relevance, extracts targeted function slices, caches AST"
      },
      savings: {
        tokensSaved,
        savingsPercent,
        ratio: (baselineTotalTokens / forgeLoopTotalEstimated).toFixed(1) + 'x'
      }
    };
    benchmarkHistory.unshift(benchmark);
    res.json(benchmark);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Git Diff & Inspection Endpoint
// ----------------------------------------------------
app.get('/api/agent/diff', async (req, res) => {
  try {
    const { repoId } = req.query;
    const resolvedPath = path.join(demoBaseDir, repoId || 'products-api');
    const diff = await gitDiff(resolvedPath);
    const status = await gitStatus(resolvedPath);
    res.json({ diff, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built client statically if available
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 ForgeLoop server running on port ${PORT}`);
});
