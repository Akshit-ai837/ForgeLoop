import * as fileTools from './fileTools.js';
import * as searchTools from './searchTools.js';
import * as commandTools from './commandTools.js';
import * as gitTools from './gitTools.js';
import { estimateTokens } from '../agent/tokenManager.js';

export class ToolManager {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.tokenManager = options.tokenManager || null;
    this.auditLog = [];
    this.allowedTools = new Set([
      'list_files',
      'search_code',
      'find_by_name',
      'get_repo_outline',
      'read_file',
      'read_file_range',
      'write_file',
      'edit_file',
      'run_command',
      'run_tests',
      'run_lint',
      'run_build',
      'git_diff',
      'git_status',
      'git_reset'
    ]);
  }

  setRepoPath(repoPath) {
    this.repoPath = repoPath;
  }

  getAuditLogs() {
    return this.auditLog;
  }

  async execute(toolName, params = {}) {
    if (!this.allowedTools.has(toolName)) {
      throw new Error(`Unauthorized tool call: '${toolName}' is not allowed or supported.`);
    }

    const startTime = Date.now();
    let result;
    let error = null;

    try {
      switch (toolName) {
        case 'list_files':
          result = await fileTools.listFiles(this.repoPath, params);
          if (this.tokenManager) {
            this.tokenManager.registerRepoFiles(result);
            this.tokenManager.recordFileSearch(result.length);
          }
          break;

        case 'search_code':
          result = await searchTools.searchCode(this.repoPath, params.query, params);
          if (this.tokenManager) {
            this.tokenManager.recordFileSearch(result.totalMatches || 1);
          }
          break;

        case 'find_by_name':
          result = await searchTools.findByName(this.repoPath, params.pattern);
          break;

        case 'get_repo_outline':
          result = await searchTools.getRepoOutline(this.repoPath);
          break;

        case 'read_file':
          result = await fileTools.readFile(this.repoPath, params.path);
          if (this.tokenManager) {
            this.tokenManager.recordFileRead(params.path, result.content);
          }
          break;

        case 'read_file_range':
          result = await fileTools.readFileRange(this.repoPath, params.path, params.startLine, params.endLine);
          if (this.tokenManager) {
            this.tokenManager.recordFileRead(params.path, result.content);
          }
          break;

        case 'write_file':
          result = await fileTools.writeFile(this.repoPath, params.path, params.content);
          break;

        case 'edit_file':
          result = await fileTools.editFile(this.repoPath, params.path, params.targetContent, params.replacementContent);
          break;

        case 'run_command':
          result = await commandTools.runCommand(this.repoPath, params.command, params);
          break;

        case 'run_tests':
          result = await commandTools.runTests(this.repoPath, params.command || commandTools.getConfiguredCheckCommand(this.repoPath, 'test') || 'npm test');
          break;

        case 'run_lint':
          result = await commandTools.runLint(this.repoPath, params.command || commandTools.getConfiguredCheckCommand(this.repoPath, 'lint') || 'npm run lint');
          break;

        case 'run_build':
          result = await commandTools.runBuild(this.repoPath, params.command || commandTools.getConfiguredCheckCommand(this.repoPath, 'build') || 'npm run build');
          break;

        case 'git_diff':
          result = await gitTools.gitDiff(this.repoPath, params);
          break;

        case 'git_status':
          result = await gitTools.gitStatus(this.repoPath);
          break;

        case 'git_reset':
          result = await gitTools.gitReset(this.repoPath);
          break;

        default:
          throw new Error(`Tool implementation missing for ${toolName}`);
      }
    } catch (err) {
      error = err.message;
      result = { success: false, error: err.message };
    }

    const durationMs = Date.now() - startTime;
    const tokensUsed = estimateTokens(params) + estimateTokens(result);

    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      params,
      resultCount: Array.isArray(result) ? result.length : (result?.matches?.length ?? (result?.files?.length ?? 1)),
      tokensUsed,
      durationMs,
      error
    };

    this.auditLog.push(logEntry);

    if (this.tokenManager) {
      this.tokenManager.logToolTokens(toolName, params, result);
    }

    return {
      success: !error,
      result,
      tokensUsed,
      durationMs,
      error
    };
  }
}
