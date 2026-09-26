import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StateManager, AgentState } from './stateManager.js';
import { ContextEngine } from './contextEngine.js';
import { TokenManager } from './tokenManager.js';
import { ToolManager } from '../tools/toolManager.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { FailureAnalyzer } from './failureAnalyzer.js';
import { RecoveryEngine } from './recoveryEngine.js';
import { Verifier } from './verifier.js';
import { ModelProviderFactory } from '../services/modelProvider.js';
import { initRepo } from '../tools/gitTools.js';
import { listFiles } from '../tools/fileTools.js';

async function captureRepositorySnapshot(repoPath) {
  const files = await listFiles(repoPath);
  const snapshot = new Map();
  for (const file of files) {
    const content = fs.readFileSync(path.resolve(repoPath, file.path));
    snapshot.set(file.path, {
      hash: createHash('sha256').update(content).digest('hex'),
      content: content.toString('utf8')
    });
  }
  return snapshot;
}

function findChangedFiles(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter(file => before.get(file)?.hash !== after.get(file)?.hash).sort();
}

function buildRunDiff(before, after, filesChanged) {
  const fileDiffs = filesChanged.map(file => {
    const oldLines = before.get(file)?.content.split('\n') || [];
    const newLines = after.get(file)?.content.split('\n') || [];
    let prefix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < oldLines.length - prefix &&
      suffix < newLines.length - prefix &&
      oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) suffix += 1;
    const oldChanged = oldLines.slice(prefix, oldLines.length - suffix);
    const newChanged = newLines.slice(prefix, newLines.length - suffix);
    return {
      file,
      added: newChanged.length,
      removed: oldChanged.length,
      diff: [
        `@@ -${prefix + 1},${oldChanged.length} +${prefix + 1},${newChanged.length} @@`,
        ...oldChanged.map(line => `-${line}`),
        ...newChanged.map(line => `+${line}`)
      ].join('\n')
    };
  });
  return {
    hasChanges: fileDiffs.length > 0,
    totalFilesChanged: fileDiffs.length,
    filesChanged,
    fileDiffs,
    rawDiff: fileDiffs.map(item => `--- ${item.file}\n+++ ${item.file}\n${item.diff}`).join('\n')
  };
}

export class AgentOrchestrator {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.tokenManager = new TokenManager();
    this.stateManager = new StateManager();
    this.toolManager = new ToolManager({
      repoPath: this.repoPath,
      tokenManager: this.tokenManager
    });
    this.contextEngine = new ContextEngine({
      tokenManager: this.tokenManager
    });
    this.failureAnalyzer = new FailureAnalyzer();
    this.runData = {};

    this.modelProvider = options.modelProvider && typeof options.modelProvider.generate === 'function'
      ? options.modelProvider
      : ModelProviderFactory.create(options.modelProvider || 'deepseek', options.modelConfig || {});

    this.planner = new Planner({
      modelProvider: this.modelProvider,
      tokenManager: this.tokenManager
    });
    this.executor = new Executor({
      toolManager: this.toolManager,
      stateManager: this.stateManager
    });
    this.recoveryEngine = new RecoveryEngine({
      maxAttempts: options.maxAttempts || 3,
      modelProvider: this.modelProvider,
      contextEngine: this.contextEngine,
      toolManager: this.toolManager,
      tokenManager: this.tokenManager
    });
    this.verifier = new Verifier({
      toolManager: this.toolManager,
      tokenManager: this.tokenManager
    });
  }

  setRepoPath(repoPath) {
    this.repoPath = repoPath;
    this.toolManager.setRepoPath(repoPath);
  }

  async updateRunChanges(initialSnapshot) {
    const currentSnapshot = await captureRepositorySnapshot(this.repoPath);
    const filesChanged = findChangedFiles(initialSnapshot, currentSnapshot);
    this.runData.filesChanged = filesChanged;
    this.runData.diffData = buildRunDiff(initialSnapshot, currentSnapshot, filesChanged);
  }

  async run(taskDescription, options = {}) {
    if (typeof taskDescription !== 'string' || !taskDescription.trim()) {
      throw new Error('A non-empty task is required.');
    }

    this.stateManager.reset(taskDescription);
    this.tokenManager.reset();
    this.failureAnalyzer.clear();
    this.runData = {
      task: taskDescription,
      logs: this.stateManager.logs,
      contextFiles: [],
      plan: null,
      codeChanges: [],
      filesChanged: [],
      tests: null,
      verification: null,
      diffData: null
    };

    const startTime = Date.now();
    this.stateManager.log(`Received task: ${taskDescription}`, 'info');
    await initRepo(this.repoPath);
    const initialSnapshot = await captureRepositorySnapshot(this.repoPath);
    this.runData.initialSnapshot = initialSnapshot;

    this.stateManager.setState(AgentState.ANALYZING, { task: taskDescription });
    this.stateManager.log('Analyzing the submitted task and constraints.', 'info');
    this.tokenManager.addTokens('task', taskDescription);

    this.stateManager.setState(AgentState.SEARCHING);
    this.stateManager.log('Searching repository files and references for this task.', 'info');
    const rankedContext = await this.contextEngine.rankRepositoryContext(this.repoPath, taskDescription);
    this.runData.rankedContext = {
      totalFiles: rankedContext.totalFiles,
      scoredFiles: rankedContext.scoredFiles,
      selectedFiles: rankedContext.selectedFiles,
      avoidedFiles: rankedContext.avoidedFiles
    };
    this.stateManager.log(
      `Found ${rankedContext.totalFiles} files; selected ${rankedContext.selectedFiles.length} context candidates.`,
      'info',
      { ranked: rankedContext.scoredFiles }
    );

    this.stateManager.setState(AgentState.CONTEXT_SELECTED, {
      selectedCount: rankedContext.selectedFiles.length,
      avoidedCount: rankedContext.avoidedFiles.length
    });
    const targetContext = await this.contextEngine.extractTargetContext(this.repoPath, rankedContext);
    this.runData.contextFiles = targetContext.items;
    this.stateManager.log(
      `Selected ${targetContext.filesSelectedCount} context files (${targetContext.totalSelectedTokens} estimated context tokens).`,
      'success'
    );

    this.stateManager.setState(AgentState.PLANNING);
    this.stateManager.log('Creating an execution plan from the submitted task and repository.', 'info');
    const outlineResult = await this.toolManager.execute('get_repo_outline');
    if (!outlineResult.success) throw new Error(`Repository outline failed: ${outlineResult.error}`);
    const plan = await this.planner.createPlan(taskDescription, outlineResult.result, rankedContext.selectedFiles);
    this.runData.plan = plan;
    this.stateManager.log(`Plan created with ${plan.steps.length} steps.`, 'info', { plan });

    this.stateManager.setState(AgentState.IMPLEMENTING);
    this.stateManager.log(`Requesting code changes for the current task from ${this.modelProvider.name}.`, 'info');
    const modelResponse = await this.modelProvider.generateImplementation(
      taskDescription,
      plan,
      targetContext.items,
      { ...options, attempt: 1 }
    );
    this.tokenManager.recordProviderUsage(modelResponse.usage);

    if (modelResponse.thought) {
      this.stateManager.log(`Thinking: ${modelResponse.thought}`, 'info');
    }

    const execResults = await this.executor.executeActions(modelResponse.actions);
    const codeChanges = execResults.map(({ action, result }) => ({
      file: action.file,
      tool: action.tool,
      success: result.success,
      modified: result.result?.modified ?? result.result?.success ?? false
    }));
    this.runData.codeChanges = codeChanges;
    await this.updateRunChanges(initialSnapshot);
    const failedActions = execResults.filter(result => !result.result.success);
    if (failedActions.length > 0) {
      throw new Error(`Could not apply generated changes: ${failedActions.map(item => item.result.error).join('; ')}`);
    }
    this.stateManager.log(
      `${findChangedFiles(initialSnapshot, await captureRepositorySnapshot(this.repoPath)).length} files changed so far.`,
      'info',
      { codeChanges }
    );

    this.stateManager.setState(AgentState.TESTING);
    this.stateManager.log('Running the repository test command.', 'info');
    let testResult = await this.toolManager.execute('run_tests');
    this.runData.tests = testResult.result;
    await this.updateRunChanges(initialSnapshot);
    let recoveryAttempt = 0;
    const maxRetries = options.maxAttempts ?? 3;

    while (!testResult.result?.passed && recoveryAttempt < maxRetries) {
      recoveryAttempt += 1;
      const rawOutput = testResult.result?.rawOutput || '';
      this.stateManager.setState(AgentState.FAILURE_ANALYSIS, { attempt: recoveryAttempt });
      this.stateManager.log(`Test command failed; analyzing actual output (attempt ${recoveryAttempt}/${maxRetries}).`, 'warn');

      const parsedFailure = this.failureAnalyzer.analyze(rawOutput, {
        attempt: recoveryAttempt,
        currentTask: taskDescription,
        repoFiles: rankedContext.selectedFiles
      });
      const recoveryRanking = await this.contextEngine.rankRepositoryContext(
        this.repoPath,
        `${taskDescription}\n${rawOutput.slice(0, 1200)}`
      );
      const recoveryContext = await this.contextEngine.extractTargetContext(this.repoPath, recoveryRanking);
      const modelFailure = await this.modelProvider.analyzeFailure(rawOutput, taskDescription, recoveryContext.items);
      this.tokenManager.recordProviderUsage(modelFailure.usage);
      const failureMemory = {
        ...parsedFailure,
        ...modelFailure,
        attempt: recoveryAttempt,
        timestamp: new Date().toISOString(),
        rawOutput
      };
      this.failureAnalyzer.memoryLog[this.failureAnalyzer.memoryLog.length - 1] = failureMemory;
      this.stateManager.log(`Failure analysis: ${failureMemory.likely_area || failureMemory.test || 'see captured test output'}.`, 'warn', {
        failureMemory
      });

      this.stateManager.setState(AgentState.RECOVERING, { attempt: recoveryAttempt, failureMemory });
      this.stateManager.log('Selecting focused failure context and requesting a repair.', 'info');
      const failureFile = recoveryContext.items.find(item => item.file === failureMemory.file) || recoveryContext.items[0];
      const recoveryResult = await this.recoveryEngine.attemptRecovery(
        failureMemory,
        taskDescription,
        failureFile?.content || '',
        recoveryAttempt
      );
      if (recoveryResult.appliedActions) {
        codeChanges.push(...recoveryResult.appliedActions.map(({ action, result }) => ({
          file: action.file,
          tool: action.tool,
          success: result.success,
          modified: result.result?.modified ?? result.result?.success ?? false
        })));
        this.runData.codeChanges = codeChanges;
        await this.updateRunChanges(initialSnapshot);
      }
      this.stateManager.log(
        recoveryResult.success
          ? `Applied repair to ${recoveryResult.appliedActions.map(item => item.action.file).join(', ')}.`
          : `No repair applied: ${recoveryResult.diagnosis || recoveryResult.reason || 'model returned no repair actions'}.`,
        recoveryResult.success ? 'info' : 'warn'
      );

      this.stateManager.setState(AgentState.TESTING);
      this.stateManager.log('Re-running repository tests after the repair attempt.', 'info');
      testResult = await this.toolManager.execute('run_tests');
      this.runData.tests = testResult.result;
      await this.updateRunChanges(initialSnapshot);
    }

    await this.updateRunChanges(initialSnapshot);
    const { filesChanged, diffData } = this.runData;
    const verificationResult = await this.verifier.verify(taskDescription, rankedContext.selectedFiles, {
      testResult: testResult.result,
      changedFiles: filesChanged,
      diffData
    });
    this.runData.verification = verificationResult;
    this.runData.failureMemory = this.failureAnalyzer.getFailures();

    const finalState = !testResult.result?.passed
      ? AgentState.FAILED
      : verificationResult.verified
        ? AgentState.COMPLETED
        : AgentState.FAILED;
    this.stateManager.setState(finalState, { verification: verificationResult });
    this.stateManager.log(
      verificationResult.verified ? verificationResult.summary : verificationResult.summary,
      verificationResult.verified ? 'success' : 'error',
      { verification: verificationResult }
    );

    return {
      success: verificationResult.verified,
      state: finalState,
      task: taskDescription,
      plan,
      codeChanges,
      rankedContext: {
        totalFiles: rankedContext.totalFiles,
        scoredFiles: rankedContext.scoredFiles,
        selectedFiles: rankedContext.selectedFiles,
        avoidedFiles: rankedContext.avoidedFiles,
        contextFiles: targetContext.items
      },
      filesChanged,
      diffData,
      tests: testResult.result,
      verification: verificationResult,
      failureMemory: this.failureAnalyzer.getFailures(),
      tokenMetrics: this.tokenManager.getMetrics(),
      durationMs: Date.now() - startTime,
      auditLogs: this.toolManager.getAuditLogs()
    };
  }
}
