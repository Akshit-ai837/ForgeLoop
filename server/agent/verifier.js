import { estimateTokens } from './tokenManager.js';
import { getConfiguredCheckCommand } from '../tools/commandTools.js';

export class Verifier {
  constructor(options = {}) {
    this.toolManager = options.toolManager;
    this.tokenManager = options.tokenManager;
  }

  async verify(taskDescription, targetFiles = [], options = {}) {
    const checklist = [];
    const evidence = {};

    // 1. Execute automated tests
    const testResult = options.testResult
      ? { result: options.testResult }
      : await this.toolManager.execute('run_tests');
    const testResultsParsed = (testResult.result?.totalCount || 0) > 0;
    const testsPassed = (testResult.result?.passed ?? false) && testResultsParsed;
    const testRawOutput = testResult.result?.rawOutput || testResult.result?.stdout || '';

    checklist.push({
      id: 'tests_passed',
      label: 'Automated test suite passed',
      status: testsPassed ? 'PASS' : 'FAIL',
      detail: testResultsParsed
        ? `${testResult.result?.passedCount || 0}/${testResult.result?.totalCount || 0} tests passed, ${testResult.result?.failedCount || 0} failed, ${testResult.result?.skippedCount || 0} skipped`
        : `No test results could be parsed from ${testResult.result?.command || 'the repository test command'}`
    });

    evidence.tests = {
      command: testResult.result?.command || 'repository test command',
      passed: testsPassed,
      resultsParsed: testResultsParsed,
      passedCount: testResult.result?.passedCount || 0,
      failedCount: testResult.result?.failedCount || 0,
      skippedCount: testResult.result?.skippedCount || 0,
      totalCount: testResult.result?.totalCount || 0,
      durationMs: testResult.result?.durationMs ?? null,
      exitCode: testResult.result?.exitCode ?? null,
      rawOutput: testRawOutput
    };

    for (const check of ['build', 'lint']) {
      const command = getConfiguredCheckCommand(this.toolManager.repoPath, check);
      if (!command) {
        evidence[check] = { configured: false, passed: null, command: null, rawOutput: '' };
        continue;
      }
      const result = await this.toolManager.execute(check === 'build' ? 'run_build' : 'run_lint', { command });
      const passed = result.result?.passed ?? false;
      evidence[check] = {
        configured: true,
        passed,
        command,
        durationMs: result.result?.durationMs ?? null,
        exitCode: result.result?.exitCode ?? null,
        rawOutput: result.result?.rawOutput || result.result?.stdout || ''
      };
      checklist.push({
        id: `${check}_passed`,
        label: `Configured ${check} command passed`,
        status: passed ? 'PASS' : 'FAIL',
        detail: `${command} exited with code ${result.result?.exitCode ?? 'unknown'}`
      });
    }

    // 2. Inspect git diff
    const diffResult = options.diffData
      ? { result: options.diffData }
      : await this.toolManager.execute('git_diff', {});
    const gitDiffData = diffResult.result || {};
    const changedFiles = options.changedFiles || gitDiffData.fileDiffs?.map(file => file.file) || [];
    const hasDiff = changedFiles.length > 0;

    checklist.push({
      id: 'git_diff_inspected',
      label: 'Git diff inspected & non-empty',
      status: hasDiff ? 'PASS' : 'FAIL',
      detail: `${changedFiles.length} files changed during this run`
    });

    evidence.gitDiff = {
      command: 'git diff',
      totalFilesChanged: changedFiles.length,
      fileDiffs: (gitDiffData.fileDiffs || []).filter(file => changedFiles.includes(file.file)),
      filesChanged: changedFiles,
      rawDiff: gitDiffData.rawDiff || ''
    };

    // 3. Verify requested target files or endpoints actually modified
    let targetModified = false;
    if (hasDiff && gitDiffData.fileDiffs) {
      if (targetFiles.length > 0) {
        targetModified = changedFiles.some(file =>
          targetFiles.some(tf => (typeof tf === 'string' ? tf : tf.path).includes(file) || file.includes(typeof tf === 'string' ? tf : tf.path))
        );
      } else {
        targetModified = true;
      }
    }

    checklist.push({
      id: 'target_files_modified',
      label: 'Requested files/endpoints actually modified',
      status: targetModified ? 'PASS' : 'FAIL',
      detail: targetModified ? 'Target code modifications verified' : 'No target files modified'
    });

    // 4. Overall verification decision
    const allPassed = checklist.every(c => c.status === 'PASS');

    if (this.tokenManager) {
      const verTokens = estimateTokens(JSON.stringify(evidence));
      this.tokenManager.addTokens('verification', verTokens);
    }

    return {
      verified: allPassed,
      status: allPassed ? 'TASK_VERIFIED' : changedFiles.length === 0 ? 'IMPLEMENTATION_NOT_VERIFIED' : 'VERIFICATION_FAILED',
      timestamp: new Date().toISOString(),
      checklist,
      evidence,
      summary: allPassed
        ? `TASK VERIFIED: ${evidence.tests.passedCount}/${evidence.tests.totalCount} tests passed. ${evidence.gitDiff.totalFilesChanged} files changed during the run.`
        : changedFiles.length === 0
          ? 'IMPLEMENTATION NOT VERIFIED: No files changed during this run.'
          : 'VERIFICATION FAILED: One or more evidence requirements failed.'
    };
  }
}
