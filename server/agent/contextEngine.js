import fs from 'node:fs';
import path from 'node:path';
import { listFiles, readFile, readFileRange } from '../tools/fileTools.js';
import { searchCode } from '../tools/searchTools.js';
import { estimateTokens } from './tokenManager.js';

export class ContextEngine {
  constructor(options = {}) {
    this.tokenManager = options.tokenManager || null;
    this.cache = new Map(); // key: repoPath, value: { files, symbols, timestamp }
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Tokenizes task to extract key entities, endpoints, methods, and topics
   */
  extractTaskKeywords(taskDescription) {
    // Extract endpoint if present (e.g., /api/products)
    const endpointMatch = taskDescription.match(/\/[a-zA-Z0-9_\-\/]+/);
    const endpoint = endpointMatch ? endpointMatch[0].toLowerCase() : null;

    // Split words by non-alphanumeric characters
    const rawTokens = taskDescription.toLowerCase().match(/[a-z0-9_]+/g) || [];
    const stopWords = new Set(['the', 'and', 'to', 'for', 'in', 'on', 'with', 'a', 'an', 'is', 'at', 'of', 'from', 'by', 'add', 'update', 'fix', 'endpoint']);
    const keywords = rawTokens.filter(t => t.length > 2 && !stopWords.has(t));
    const relatedTerms = {
      login: ['auth', 'authentication', 'session', 'credential'],
      authenticate: ['auth', 'authentication', 'login', 'credential'],
      authentication: ['auth', 'authenticate', 'login', 'session'],
      authorization: ['auth', 'permission', 'role'],
      pagination: ['page', 'limit', 'offset'],
      paginate: ['page', 'pagination', 'limit', 'offset'],
      products: ['product']
    };
    for (const keyword of [...keywords]) {
      for (const related of relatedTerms[keyword] || []) keywords.push(related);
    }

    // Also add endpoint segments if present (e.g., 'products' from '/api/products')
    if (endpoint) {
      const segments = endpoint.split('/').filter(s => s && s !== 'api');
      for (const seg of segments) {
        if (!keywords.includes(seg)) keywords.push(seg);
      }
    }

    return {
      keywords: Array.from(new Set(keywords)),
      endpoint,
      original: taskDescription
    };
  }

  /**
   * Search before reading: Scans repository, scores relevance of every file,
   * generates explainable reasons for selection/avoidance, and tracks avoided files.
   */
  async rankRepositoryContext(repoPath, taskDescription) {
    const taskInfo = this.extractTaskKeywords(taskDescription);
    const files = await listFiles(repoPath);

    if (this.tokenManager) {
      this.tokenManager.registerRepoFiles(files);
      this.tokenManager.recordFileSearch(files.length);
    }

    const scoredFiles = [];
    const fileContents = new Map();

    for (const file of files) {
      const relPath = file.path;
      const lowerPath = relPath.toLowerCase();
      const reasons = [];
      let score = 5; // baseline small score

      // 1. Check path matches
      for (const kw of taskInfo.keywords) {
        if (lowerPath.includes(kw)) {
          score += 30;
          reasons.push(`Path matches keyword '${kw}'`);
        }
      }

      // 2. Check endpoint match
      if (taskInfo.endpoint) {
        const cleanEndpoint = taskInfo.endpoint.replace(/^\//, '').split('/')[0];
        if (lowerPath.includes(cleanEndpoint)) {
          score += 35;
          reasons.push(`Matches endpoint path '${taskInfo.endpoint}'`);
        }
      }

      // 3. Check file content relevance with lightweight targeted search
      try {
        const fullPath = path.resolve(repoPath, relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        fileContents.set(relPath, content);

        // Check if endpoint is declared or referenced
        if (taskInfo.endpoint && content.toLowerCase().includes(taskInfo.endpoint)) {
          score += 40;
          reasons.push(`Contains target endpoint '${taskInfo.endpoint}'`);
        }

        // Check test relationships
        if (lowerPath.includes('.test.') || lowerPath.includes('.spec.')) {
          for (const kw of taskInfo.keywords) {
            if (lowerPath.includes(kw) || content.toLowerCase().includes(kw)) {
              score += 25;
              reasons.push(`Test file asserting target feature '${kw}'`);
              break;
            }
          }
        }

        // Check key functional tokens in content
        let contentMatches = 0;
        for (const kw of taskInfo.keywords) {
          if (content.toLowerCase().includes(kw)) {
            contentMatches++;
          }
        }
        if (contentMatches > 0) {
          score += Math.min(25, contentMatches * 8);
          reasons.push(`Found ${contentMatches} relevant keyword matches in code`);
        }

      } catch (e) {
        // binary or unreadable file
      }

      // Normalize score between 0 and 100
      const finalScore = Math.min(99, Math.max(5, score));

      let decision = 'AVOID';
      if (finalScore >= 60) {
        decision = 'SELECT_TARGETED';
      } else if (finalScore >= 35) {
        decision = 'SELECT_OUTLINE';
      } else {
        reasons.push('Unrelated to current task requirements');
      }

      const fileTokenEstimate = fileContents.has(relPath)
        ? estimateTokens(fileContents.get(relPath))
        : Math.ceil((file.size || 0) / 3.8);

      scoredFiles.push({
        path: relPath,
        relevanceScore: finalScore,
        decision,
        reasons: reasons.slice(0, 3),
        lines: file.lines,
        size: file.size,
        tokens: fileTokenEstimate
      });
    }

    const byNormalizedPath = new Map();
    for (const file of files) {
      const withoutExtension = file.path.replace(/\.(?:[cm]?[jt]sx?)$/i, '');
      byNormalizedPath.set(withoutExtension, file.path);
      byNormalizedPath.set(`${withoutExtension}/index`, file.path);
    }

    const importPattern = /(?:from\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
    const dependencies = [];
    for (const [sourcePath, content] of fileContents) {
      const sourceDirectory = path.posix.dirname(sourcePath);
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        const resolvedBase = path.posix.normalize(path.posix.join(sourceDirectory, specifier));
        const dependencyPath = byNormalizedPath.get(resolvedBase);
        if (dependencyPath) dependencies.push({ sourcePath, dependencyPath });
      }
    }

    const scoreByPath = new Map(scoredFiles.map(file => [file.path, file]));
    for (const { sourcePath, dependencyPath } of dependencies) {
      const source = scoreByPath.get(sourcePath);
      const dependency = scoreByPath.get(dependencyPath);
      if (!source || !dependency || source.relevanceScore < 35 || dependency.relevanceScore >= 60) continue;
      dependency.relevanceScore = Math.min(99, dependency.relevanceScore + (sourcePath.includes('.test.') || sourcePath.includes('.spec.') ? 24 : 16));
      dependency.reasons.unshift(`Imported by relevant file '${sourcePath}'`);
      dependency.reasons = dependency.reasons.slice(0, 3);
      dependency.decision = dependency.relevanceScore >= 60 ? 'SELECT_TARGETED' : 'SELECT_OUTLINE';
    }

    if (!scoredFiles.some(file => file.decision !== 'AVOID')) {
      const fallbackFiles = scoredFiles
        .filter(file => /\.(?:[cm]?[jt]sx?|json)$/i.test(file.path))
        .slice(0, 8);
      for (const file of fallbackFiles) {
        file.relevanceScore = 20;
        file.decision = 'SELECT_OUTLINE';
        file.reasons = ['No direct task match; included as repository implementation/test context.'];
      }
    }

    // Sort descending by relevance score
    scoredFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      taskInfo,
      totalFiles: files.length,
      scoredFiles,
      selectedFiles: scoredFiles.filter(f => f.decision !== 'AVOID'),
      avoidedFiles: scoredFiles.filter(f => f.decision === 'AVOID')
    };
  }

  /**
   * Token-Efficient Extraction: Instead of dumping whole files,
   * extracts only the relevant functions/classes or ranges.
   */
  async extractTargetContext(repoPath, rankedContext) {
    const contextItems = [];
    let fullRepoContentCombined = '';

    // First load total repo content to accurately calculate baseline tokens
    const allFiles = await listFiles(repoPath);
    for (const f of allFiles) {
      try {
        const c = fs.readFileSync(path.resolve(repoPath, f.path), 'utf8');
        fullRepoContentCombined += `\n--- ${f.path} ---\n${c}`;
      } catch (e) {}
    }

    // Now extract ONLY targeted files/sections
    for (const fileItem of rankedContext.selectedFiles) {
      const fullPath = path.resolve(repoPath, fileItem.path);
      try {
        const fullContent = fs.readFileSync(fullPath, 'utf8');
        const lines = fullContent.split('\n');

        if (this.tokenManager) {
          this.tokenManager.recordFileRead(fileItem.path, fullContent);
        }

        // If file is small (< 90 lines), reading whole file is safe and token-cheap
        if (lines.length <= 90) {
          contextItems.push({
            file: fileItem.path,
            mode: 'full',
            startLine: 1,
            endLine: lines.length,
            content: fullContent,
            relevanceScore: fileItem.relevanceScore,
            reasons: fileItem.reasons,
            tokens: estimateTokens(fullContent)
          });
        } else {
          // File is larger: identify target function/slice matching keywords
          let targetStart = 1;
          let targetEnd = Math.min(lines.length, 60);

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const hasKw = rankedContext.taskInfo.keywords.some(kw => line.toLowerCase().includes(kw));
            if (hasKw) {
              targetStart = Math.max(1, i - 10);
              targetEnd = Math.min(lines.length, i + 35);
              break;
            }
          }

          const sliceContent = lines.slice(targetStart - 1, targetEnd).join('\n');
          contextItems.push({
            file: fileItem.path,
            mode: 'slice',
            startLine: targetStart,
            endLine: targetEnd,
            totalLines: lines.length,
            content: sliceContent,
            relevanceScore: fileItem.relevanceScore,
            reasons: fileItem.reasons,
            tokens: estimateTokens(sliceContent)
          });
        }
      } catch (err) {
        // Skip unreadable file
      }
    }

    const contextTokens = contextItems.reduce((acc, c) => acc + c.tokens, 0);

    if (this.tokenManager) {
      this.tokenManager.addTokens('context', contextTokens);
      this.tokenManager.computeBaseline(fullRepoContentCombined, 2);
    }

    return {
      items: contextItems,
      totalSelectedTokens: contextTokens,
      baselineRepoTokens: estimateTokens(fullRepoContentCombined),
      filesAvoidedCount: rankedContext.avoidedFiles.length,
      filesSelectedCount: contextItems.length
    };
  }

  /**
   * Build focused failure recovery context.
   * MAJOR DIFFERENTIATOR: Do NOT send the entire previous conversation or entire repo.
   * Send ONLY:
   * - original task
   * - structured failure information
   * - relevant code slice of the failing component
   * - relevant failing test
   * - previous attempted fix
   */
  buildFailureRecoveryContext(failureMemory, originalTask, currentCodeSnippet) {
    const recoveryPrompt = {
      task: originalTask,
      failureType: failureMemory.type,
      testName: failureMemory.test,
      failingFile: failureMemory.file,
      expected: failureMemory.expected,
      received: failureMemory.received,
      likelyArea: failureMemory.likely_area,
      errorStack: failureMemory.stack || failureMemory.rawMessage,
      relevantCode: currentCodeSnippet,
      previousAttempt: failureMemory.attempt || 1,
      directive: "Diagnose why the test failed and produce the exact minimal fix to satisfy the test."
    };

    const recoveryString = JSON.stringify(recoveryPrompt, null, 2);
    const tokens = estimateTokens(recoveryString);

    if (this.tokenManager) {
      this.tokenManager.addTokens('recovery', tokens);
      this.tokenManager.incrementRecoveryAttempt();
    }

    return {
      recoveryPayload: recoveryPrompt,
      recoveryText: recoveryString,
      tokens
    };
  }
}
