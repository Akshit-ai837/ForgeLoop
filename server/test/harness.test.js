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
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { ModelProviderFactory, DeepSeekProvider, QwenProvider } from '../services/modelProvider.js';
import { RepositoryManager, detectRepositoryMetadata } from '../services/repositoryManager.js';
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
      } catch (_) { }
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

  it('7. Repository Manager: GitHub URL validation & error handling', () => {
    const testWs = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-rm-test-'));
    try {
      const rm = new RepositoryManager(testWs);

      // Valid URL parsing
      const parsed = rm.parseGitHubUrl('https://github.com/facebook/react');
      assert.equal(parsed.owner, 'facebook');
      assert.equal(parsed.name, 'react');
      assert.equal(parsed.fullName, 'facebook/react');
      assert.equal(parsed.cloneUrl, 'https://github.com/facebook/react.git');

      // Valid with .git suffix and subpaths
      const parsedWithGit = rm.parseGitHubUrl('https://github.com/torvalds/linux.git');
      assert.equal(parsedWithGit.fullName, 'torvalds/linux');

      // Invalid URLs
      assert.throws(() => rm.parseGitHubUrl(''), /required/i);
      assert.throws(() => rm.parseGitHubUrl('https://gitlab.com/owner/repo'), /Only GitHub/i);
      assert.throws(() => rm.parseGitHubUrl('not-a-url'), /Invalid repository URL/i);
      assert.throws(() => rm.parseGitHubUrl('https://github.com/onlyowner'), /Expected format/i);
      assert.throws(() => rm.parseGitHubUrl('https://github.com/owner/repo/extra/parts'), /invalid characters|valid/i);
    } finally {
      try { fs.rmSync(testWs, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it('8. Repository Manager: Workspace isolation & path containment', () => {
    const testWs = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-rm-iso-'));
    try {
      const rm = new RepositoryManager(testWs);

      // Path within workspace should be accepted
      const safePath = path.join(testWs, 'repo_123');
      assert.equal(rm.assertSafeWorkspace(safePath), path.resolve(safePath));

      // Path escaping workspace must throw security error
      assert.throws(() => rm.assertSafeWorkspace(path.join(testWs, '..', 'evil')), /escapes workspace/i);
      assert.throws(() => rm.assertSafeWorkspace('/etc/passwd'), /escapes workspace/i);
      assert.throws(() => rm.assertSafeWorkspace(testWs), /escapes workspace/i);
    } finally {
      try { fs.rmSync(testWs, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it('9. Repository Persistence & Lookup without hardcoded dependencies', () => {
    const testWs = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-rm-db-'));
    try {
      const rm = new RepositoryManager(testWs);
      const testRepoId = 'repo_arbitrary_' + Date.now();

      // Register local repository dynamically
      const registered = rm.registerLocalPath(tempRepoDir, {
        id: testRepoId,
        name: 'arbitrary-service',
        fullName: 'my-org/arbitrary-service',
        url: 'https://github.com/my-org/arbitrary-service'
      });

      assert.equal(registered.id, testRepoId);
      assert.equal(registered.name, 'arbitrary-service');
      assert.equal(registered.fullName, 'my-org/arbitrary-service');

      // Lookup by ID
      const byId = rm.getRepo(testRepoId);
      assert.ok(byId, 'Should lookup repository by ID');
      assert.equal(byId.fullName, 'my-org/arbitrary-service');

      // Lookup by full name
      const byFullName = rm.getRepo('my-org/arbitrary-service');
      assert.ok(byFullName, 'Should lookup repository by full name');

      // Lookup in DB directly
      const dbRecord = db.getRepositoryById(testRepoId);
      assert.equal(dbRecord.name, 'arbitrary-service');
      assert.equal(dbRecord.source, 'local');

      // Deletion removes from DB
      rm.deleteRepo(testRepoId);
      assert.equal(rm.getRepo(testRepoId), null);
    } finally {
      try { fs.rmSync(testWs, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it('10. Agent & Tools operate on dynamically selected repository', async () => {
    const toolManager = new ToolManager({ repoPath: tempRepoDir });
    const outline = await toolManager.execute('get_repo_outline');
    assert.ok(outline.success);

    const metadata = detectRepositoryMetadata(tempRepoDir);
    assert.equal(metadata.hasTestSuite, true);
    assert.equal(metadata.testCommand, 'npm test');

    const testRun = await toolManager.execute('run_tests');
    assert.ok(testRun.success);
    assert.equal(testRun.result.hasTestSuite, true);
    assert.equal(testRun.result.passed, true);
  });

  it('11. Dynamic test detection handles repositories with no test suite', async () => {
    const noTestRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-notest-'));
    try {
      fs.writeFileSync(path.join(noTestRepo, 'README.md'), '# Just docs\nNo code or tests here.');

      const metadata = detectRepositoryMetadata(noTestRepo);
      assert.equal(metadata.hasTestSuite, false);
      assert.equal(metadata.testCommand, null);

      const tm = new ToolManager({ repoPath: noTestRepo });
      const testRun = await tm.execute('run_tests');
      assert.equal(testRun.result.hasTestSuite, false);
      assert.equal(testRun.result.passed, false);
      assert.ok(testRun.result.rawOutput.includes('No test suite detected'));

      const tmVer = new Verifier({ toolManager: tm });
      const verification = await tmVer.verify('Add feature', ['README.md'], {
        testResult: testRun.result,
        changedFiles: ['README.md'],
        diffData: { totalFilesChanged: 1, fileDiffs: [{ file: 'README.md' }] }
      });
      assert.equal(verification.verified, false, 'Should not claim verified when no test suite exists');
      const testChecklist = verification.checklist.find(c => c.id === 'tests_passed');
      assert.equal(testChecklist.label, 'No test suite detected');
    } finally {
      try { fs.rmSync(noTestRepo, { recursive: true, force: true }); } catch (_) {}
    }
  });

it('12. Test A - Simple bug fix end-to-end (issue -> agent -> edit -> test -> verified)', async () => {
  const tempA = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-test-a-'));
  try {
    execSync('git init -b main', { cwd: tempA, stdio: 'ignore' });
    execSync('git config user.email "test@forgeloop.test"', { cwd: tempA, stdio: 'ignore' });
    execSync('git config user.name "ForgeLoop Test"', { cwd: tempA, stdio: 'ignore' });

    fs.writeFileSync(path.join(tempA, 'package.json'), JSON.stringify({
      name: 'test-a-calc',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test' }
    }, null, 2));

    fs.mkdirSync(path.join(tempA, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempA, 'src', 'calc.js'), `export function add(a, b) {\n  return a - b;\n}\n`);

    fs.mkdirSync(path.join(tempA, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tempA, 'test', 'calc.test.js'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/calc.js';

test('add should return sum', () => {
  assert.equal(add(2, 3), 5);
});
`);

    execSync('git add -A && git commit -m "init"', { cwd: tempA, stdio: 'ignore' });

    const testModel = {
      name: 'TestModelA',
      async generatePlan() {
        return { steps: ['Fix calculation in src/calc.js'], target_files: ['src/calc.js'] };
      },
      async generateImplementation() {
        return {
          actions: [
            {
              tool: 'edit_file',
              file: 'src/calc.js',
              targetContent: 'export function add(a, b) {\n  return a - b;\n}',
              replacementContent: 'export function add(a, b) {\n  return a + b;\n}'
            }
          ]
        };
      }
    };

    const orchestrator = new AgentOrchestrator({ repoPath: tempA, modelProvider: testModel });
    const result = await orchestrator.run('Fix add function in src/calc.js');

    assert.equal(result.verification.verified, true);
    assert.equal(result.verification.status, 'TASK_VERIFIED');
    assert.ok(result.filesChanged.includes('src/calc.js'));
    assert.equal(result.tests.passed, true);
  } finally {
    try { fs.rmSync(tempA, { recursive: true, force: true }); } catch (_) { }
  }
});

it('13. Test B - Failure recovery loop (fail -> analyze -> recover -> retest -> verified)', async () => {
  const tempB = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-test-b-'));
  try {
    execSync('git init -b main', { cwd: tempB, stdio: 'ignore' });
    execSync('git config user.email "test@forgeloop.test"', { cwd: tempB, stdio: 'ignore' });
    execSync('git config user.name "ForgeLoop Test"', { cwd: tempB, stdio: 'ignore' });

    fs.writeFileSync(path.join(tempB, 'package.json'), JSON.stringify({
      name: 'test-b-mult',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test' }
    }, null, 2));

    fs.mkdirSync(path.join(tempB, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempB, 'src', 'mult.js'), `export function mult(a, b) {\n  return 0;\n}\n`);

    fs.mkdirSync(path.join(tempB, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tempB, 'test', 'mult.test.js'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mult } from '../src/mult.js';

test('mult returns product', () => {
  assert.equal(mult(3, 4), 12);
});
`);

    execSync('git add -A && git commit -m "init"', { cwd: tempB, stdio: 'ignore' });

    const testModel = {
      name: 'TestModelB',
      async generatePlan() {
        return { steps: ['Fix mult function in src/mult.js'], target_files: ['src/mult.js'] };
      },
      async generateImplementation() {
        // First attempt produces flawed edit
        return {
          actions: [
            {
              tool: 'edit_file',
              file: 'src/mult.js',
              targetContent: 'export function mult(a, b) {\n  return 0;\n}',
              replacementContent: 'export function mult(a, b) {\n  return a + b;\n}'
            }
          ]
        };
      },
      async analyzeFailure() {
        return { likely_area: 'src/mult.js', file: 'src/mult.js', type: 'TEST_FAILURE' };
      }
    };

    const recoveryEngineMock = {
      async attemptRecovery() {
        fs.writeFileSync(path.join(tempB, 'src', 'mult.js'), `export function mult(a, b) {\n  return a * b;\n}\n`);
        return {
          success: true,
          appliedActions: [
            {
              action: { tool: 'edit_file', file: 'src/mult.js' },
              result: { success: true, result: { success: true, modified: true } }
            }
          ]
        };
      }
    };

    const orchestrator = new AgentOrchestrator({ repoPath: tempB, modelProvider: testModel });
    orchestrator.recoveryEngine = recoveryEngineMock;

    const result = await orchestrator.run('Fix mult in src/mult.js');
    assert.equal(result.verification.verified, true);
    assert.equal(result.verification.status, 'TASK_VERIFIED');
    assert.equal(result.tests.passed, true);
  } finally {
    try { fs.rmSync(tempB, { recursive: true, force: true }); } catch (_) { }
  }
});

it('14. Test C - Context efficiency (avoids sending entire repository)', async () => {
  const tempC = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-test-c-'));
  try {
    fs.mkdirSync(path.join(tempC, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(tempC, 'src', 'inventory'), { recursive: true });

    fs.writeFileSync(path.join(tempC, 'src', 'auth', 'login.js'), `export function login() { return true; }\n`);
    fs.writeFileSync(path.join(tempC, 'src', 'auth', 'auth.test.js'), `test('auth', () => {});\n`);

    // Add 20 unrelated files
    for (let i = 1; i <= 20; i++) {
      fs.writeFileSync(path.join(tempC, 'src', 'inventory', `item_${i}.js`), `export const item${i} = ${i};\n`);
    }

    const tokenManager = new TokenManager();
    const engine = new ContextEngine({ tokenManager });
    const ranked = await engine.rankRepositoryContext(tempC, 'Fix authentication login session');
    const targetContext = await engine.extractTargetContext(tempC, ranked);

    assert.ok(ranked.totalFiles >= 20, 'Should find 20+ repository files');
    assert.ok(targetContext.items.length <= 4, 'Should select minimal targeted files (<= 4)');
    assert.ok(targetContext.filesAvoidedCount >= 16, 'Should avoid bulk of unrelated files (>= 16 avoided)');
    assert.ok(targetContext.totalSelectedTokens < targetContext.baselineRepoTokens, 'Selected tokens must be less than baseline repo tokens');
  } finally {
    try { fs.rmSync(tempC, { recursive: true, force: true }); } catch (_) { }
  }
});

it('15. Test D - Safety: Unrelated files outside the task remain completely untouched', async () => {
  const tempD = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-test-d-'));
  try {
    execSync('git init -b main', { cwd: tempD, stdio: 'ignore' });
    execSync('git config user.email "test@forgeloop.test"', { cwd: tempD, stdio: 'ignore' });
    execSync('git config user.name "ForgeLoop Test"', { cwd: tempD, stdio: 'ignore' });

    fs.writeFileSync(path.join(tempD, 'package.json'), JSON.stringify({
      name: 'test-d-safety',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test' }
    }, null, 2));

    fs.mkdirSync(path.join(tempD, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempD, 'src', 'secret.js'), `export const API_SECRET = 'DO_NOT_ALTER_PRESERVE_123';\n`);
    fs.writeFileSync(path.join(tempD, 'src', 'target.js'), `export function fixMe() { return false; }\n`);

    fs.mkdirSync(path.join(tempD, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tempD, 'test', 'target.test.js'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixMe } from '../src/target.js';
test('fixMe works', () => { assert.equal(fixMe(), true); });
`);

    execSync('git add -A && git commit -m "init"', { cwd: tempD, stdio: 'ignore' });

    const testModel = {
      name: 'TestModelD',
      async generatePlan() {
        return { steps: ['Fix target.js'], target_files: ['src/target.js'] };
      },
      async generateImplementation() {
        return {
          actions: [
            {
              tool: 'edit_file',
              file: 'src/target.js',
              targetContent: 'export function fixMe() { return false; }',
              replacementContent: 'export function fixMe() { return true; }'
            }
          ]
        };
      }
    };

    const orchestrator = new AgentOrchestrator({ repoPath: tempD, modelProvider: testModel });
    const result = await orchestrator.run('Fix target.js return value');

    // Assert target file was changed
    assert.ok(result.filesChanged.includes('src/target.js'));

    // Assert unrelated file was completely preserved
    const secretContent = fs.readFileSync(path.join(tempD, 'src', 'secret.js'), 'utf8');
    assert.ok(secretContent.includes('DO_NOT_ALTER_PRESERVE_123'), 'Unrelated files must remain untouched');
    assert.ok(!result.filesChanged.includes('src/secret.js'), 'Unrelated files must not be recorded as changed');
  } finally {
    try { fs.rmSync(tempD, { recursive: true, force: true }); } catch (_) { }
  }
});

it('16. Test E - Missing API key returns MODEL NOT CONFIGURED', async () => {
  const prevKey = process.env.AI_API_KEY;
  const prevDsKey = process.env.DEEPSEEK_API_KEY;
  try {
    delete process.env.AI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.MODEL_API_KEY;

    const provider = ModelProviderFactory.create('deepseek', {});
    const info = provider.getModelInfo();
    assert.equal(info.isConfigured, false, 'Provider must report isConfigured=false when key is missing');
    assert.ok(provider.getExpectedEnvKey().includes('AI_API_KEY'));

    await assert.rejects(
      async () => { await provider.generate('test prompt'); },
      /is not configured|API key/i,
      'Calling generate without API key must reject'
    );
  } finally {
    if (prevKey) process.env.AI_API_KEY = prevKey;
    if (prevDsKey) process.env.DEEPSEEK_API_KEY = prevDsKey;
  }
});
});

