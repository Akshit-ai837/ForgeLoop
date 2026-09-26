import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ContextEngine } from '../agent/contextEngine.js';
import { TokenManager } from '../agent/tokenManager.js';
import { ToolManager } from '../tools/toolManager.js';
import { Verifier } from '../agent/verifier.js';
import { FailureAnalyzer } from '../agent/failureAnalyzer.js';
import { ModelProviderFactory, DeepSeekProvider, QwenProvider } from '../services/modelProvider.js';
import { db } from '../db/database.js';

describe('ForgeLoop Evaluation-Ready Test Suite', { concurrency: 1 }, () => {
  let tempRepoDir;

  before(() => {
    // Requirement 16: Create an isolated temporary fixture repository outside demo repositories
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-eval-fixture-'));
    
    // Initialize temporary repository
    execSync('git init -b main', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git config user.email "eval@forgeloop.test"', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git config user.name "ForgeLoop Evaluator"', { cwd: tempRepoDir, stdio: 'ignore' });

    // Populate temporary repository with sample files
    fs.writeFileSync(path.join(tempRepoDir, 'package.json'), JSON.stringify({
      name: 'temp-fixture-service',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test' }
    }, null, 2));

    fs.mkdirSync(path.join(tempRepoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRepoDir, 'src', 'auth.js'), `
export function authenticate(token) {
  if (!token) return { success: false, error: 'No token' };
  return { success: true, user: 'test-user' };
}
`);

    fs.writeFileSync(path.join(tempRepoDir, 'src', 'server.js'), `
import { authenticate } from './auth.js';
export function startServer() { return true; }
`);

    fs.mkdirSync(path.join(tempRepoDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tempRepoDir, 'test', 'auth.test.js'), `
import { test } from 'node:test';
import assert from 'node:assert';
import { authenticate } from '../src/auth.js';

test('auth with token', () => {
  assert.equal(authenticate('token123').success, true);
});
`);

    execSync('git add -A && git commit -m "initial commit"', { cwd: tempRepoDir, stdio: 'ignore' });
  });

  after(() => {
    // Clean up temporary fixture
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      try {
        fs.rmSync(tempRepoDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  it('1. Safe tool execution in isolated repository', async () => {
    const toolManager = new ToolManager({ repoPath: tempRepoDir });
    const files = await toolManager.execute('list_files');
    assert.ok(files.success, 'list_files should succeed');
    assert.ok(files.result.length >= 3, 'Should list at least 3 files');

    const searchRes = await toolManager.execute('search_code', { query: 'authenticate' });
    assert.ok(searchRes.success, 'search_code should succeed');
    assert.ok(searchRes.result.totalMatches >= 1, 'Should find matches for authenticate');
    assert.ok(searchRes.result.matches.length >= 1, 'Matches array should contain results');

    const readRes = await toolManager.execute('read_file', { path: 'src/auth.js' });
    assert.ok(readRes.success, 'read_file should succeed');
    assert.ok(readRes.result.content.includes('function authenticate'), 'Content should match');
  });

  it('2. Model-Agnostic Provider Architecture (DeepSeek, Qwen, AI_API_KEY)', () => {
    // Test DeepSeek adapter
    const ds = ModelProviderFactory.create('deepseek');
    assert.ok(ds instanceof DeepSeekProvider, 'Should create DeepSeekProvider');
    assert.equal(ds.getModelInfo().provider, 'DeepSeek');
    assert.equal(ds.model, 'deepseek-chat');
    assert.ok(ds.getExpectedEnvKey().includes('AI_API_KEY'));

    // Test Qwen adapter
    const qw = ModelProviderFactory.create('qwen');
    assert.ok(qw instanceof QwenProvider, 'Should create QwenProvider');
    assert.equal(qw.getModelInfo().provider, 'Qwen');
    assert.equal(qw.model, 'qwen-plus');
    assert.ok(qw.getExpectedEnvKey().includes('AI_API_KEY'));

    // Test standard interface methods
    const requiredMethods = ['generate', 'stream', 'countTokens', 'getModelInfo', 'generatePlan', 'generateImplementation', 'analyzeFailure', 'generateRepair'];
    for (const m of requiredMethods) {
      assert.equal(typeof ds[m], 'function', `DeepSeek must implement ${m}`);
      assert.equal(typeof qw[m], 'function', `Qwen must implement ${m}`);
    }

    // Test AI_API_KEY consumption
    const prevKey = process.env.AI_API_KEY;
    try {
      process.env.AI_API_KEY = 'sk-evaluator-provided-key';
      const evalProvider = ModelProviderFactory.create('deepseek');
      assert.equal(evalProvider.apiKey, 'sk-evaluator-provided-key', 'Should consume AI_API_KEY directly');
      assert.equal(evalProvider.getModelInfo().isConfigured, true);
    } finally {
      if (prevKey) process.env.AI_API_KEY = prevKey;
      else delete process.env.AI_API_KEY;
    }
  });

  it('3. Dynamic Context Selection Engine', async () => {
    const tokenManager = new TokenManager();
    const contextEngine = new ContextEngine({ tokenManager });

    const task = 'Fix authentication token verification';
    const ranked = await contextEngine.rankRepositoryContext(tempRepoDir, task);

    assert.ok(ranked.totalFiles >= 3, 'Should discover repository files');
    assert.ok(ranked.selectedFiles.length >= 1, 'Should select candidate files');
    
    // auth.js should rank highest for this authentication task
    const topScored = ranked.scoredFiles[0];
    assert.ok(topScored.path.includes('auth'), 'Top scored file should be relevant to authentication');

    const targetContext = await contextEngine.extractTargetContext(tempRepoDir, ranked);
    assert.ok(targetContext.items.length >= 1, 'Should extract target context items');
  });

  it('4. Empirical Verifier enforcement (No false VERIFIED claims)', async () => {
    const toolManager = new ToolManager({ repoPath: tempRepoDir });
    const tokenManager = new TokenManager();
    const verifier = new Verifier({ toolManager, tokenManager });

    // Case A: Passed tests but 0 files changed -> MUST NOT be verified
    const resultNoChanges = await verifier.verify('Fix bug', ['src/auth.js'], {
      testResult: { passed: true, totalCount: 1, passedCount: 1, failedCount: 0 },
      changedFiles: [],
      diffData: { totalFilesChanged: 0, fileDiffs: [] }
    });
    assert.equal(resultNoChanges.verified, false, 'Passed tests with 0 files changed must NOT be verified');
    assert.ok(resultNoChanges.summary.includes('IMPLEMENTATION NOT VERIFIED'));

    // Case B: Tests failed -> MUST NOT be verified
    const resultFailedTests = await verifier.verify('Fix bug', ['src/auth.js'], {
      testResult: { passed: false, totalCount: 1, passedCount: 0, failedCount: 1 },
      changedFiles: ['src/auth.js'],
      diffData: { totalFilesChanged: 1, fileDiffs: [{ file: 'src/auth.js' }] }
    });
    assert.equal(resultFailedTests.verified, false, 'Failed tests must NOT be verified');

    // Case C: Real passed tests AND actual files changed -> VERIFIED
    const resultVerified = await verifier.verify('Fix bug', ['src/auth.js'], {
      testResult: { passed: true, totalCount: 1, passedCount: 1, failedCount: 0 },
      changedFiles: ['src/auth.js'],
      diffData: { totalFilesChanged: 1, fileDiffs: [{ file: 'src/auth.js' }] }
    });
    assert.equal(resultVerified.verified, true, 'Real passed tests and modified files must be verified');
    assert.ok(resultVerified.summary.includes('TASK VERIFIED'));
  });

  it('5. Failure Analyzer and Recovery Engine limits', () => {
    const analyzer = new FailureAnalyzer();
    const rawFailureOutput = `
FAIL test/auth.test.js > should return 401 when token is missing
Expected: true
Received: false
    at test/auth.test.js:6:10
`;
    const failure = analyzer.analyze(rawFailureOutput, { attempt: 1 });
    assert.equal(failure.type, 'TEST_FAILURE');
    assert.ok(failure.file.includes('auth.test.js'));
    assert.equal(failure.expected, 'true');
    assert.equal(failure.received, 'false');
  });

  it('6. SQLite Database Persistence (Source of Truth)', () => {
    const testRunId = 'test-eval-' + Date.now();
    const run = db.createRun({
      id: testRunId,
      task: 'Evaluation test task',
      repository: 'temp-fixture-service',
      status: 'RUNNING',
      currentStage: 'ANALYZING'
    });
    assert.equal(run.id, testRunId);

    db.addLog(testRunId, { stage: 'TESTING', message: 'Test execution log', type: 'info' });
    db.saveContext(testRunId, [{ path: 'src/auth.js', relevanceScore: 90, tokens: 40 }]);
    db.saveFiles(testRunId, [{ file: 'src/auth.js', added: 2, removed: 1, diff: '+ new code' }]);
    db.saveTests(testRunId, { command: 'node --test', passed: true, passedCount: 1, totalCount: 1 });
    db.saveMetrics(testRunId, { taskTokens: 10, contextTokens: 40, totalTokens: 50 });

    const completed = db.completeRun(testRunId, {
      status: 'COMPLETED',
      currentStage: 'COMPLETED',
      verificationStatus: 'TASK_VERIFIED',
      finalResult: 'TASK VERIFIED'
    });

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.verificationStatus, 'TASK_VERIFIED');
    assert.equal(completed.logs.length, 1);
    assert.equal(completed.contextFiles.length, 1);
    assert.equal(completed.filesChanged.length, 1);
    assert.equal(completed.tests.passed, true);
    assert.equal(completed.tokenMetrics.totalTokens, 50);

    const stats = db.getDashboardStats();
    assert.ok(stats.totalRuns >= 1, 'Dashboard stats must reflect recorded runs');
  });
});
