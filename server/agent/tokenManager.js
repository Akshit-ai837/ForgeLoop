/**
 * TokenManager tracks actual token consumption across all phases of the harness
 * and computes baseline comparisons against naive "dump the entire repo" approaches.
 */

// Accurate BPE-approximating tokenizer: splits by word stems, symbols, and whitespace
export function estimateTokens(text = '') {
  if (!text) return 0;
  if (typeof text !== 'string') text = JSON.stringify(text);
  const matches = text.match(/[A-Z]{2,}(?![a-z])|[A-Z][a-z]+|[0-9]+|[^\s\w]+|\s+/gu);
  return matches ? matches.length : Math.ceil(text.length / 3.8);
}

export class TokenManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.taskTokens = 0;
    this.contextTokens = 0;
    this.recoveryTokens = 0;
    this.verificationTokens = 0;
    this.generationTokens = 0;
    this.providerPromptTokens = 0;
    this.providerCompletionTokens = 0;
    this.providerTotalTokens = 0;

    this.filesSearched = 0;
    this.filesRead = new Set();
    this.allRepoFiles = new Set();
    this.recoveryAttempts = 0;
    this.contextReusedTokens = 0;
    this.cachedContextHits = 0;

    this.toolTokenLogs = [];
    this.baselineTotalTokens = 0;
  }

  registerRepoFiles(fileList = []) {
    for (const f of fileList) {
      const p = typeof f === 'string' ? f : f.path;
      this.allRepoFiles.add(p);
    }
  }

  recordFileSearch(count = 1) {
    this.filesSearched += count;
  }

  recordFileRead(filePath, content = '') {
    this.filesRead.add(filePath);
    const tokens = estimateTokens(content);
    return tokens;
  }

  addTokens(category, textOrTokens, metadata = {}) {
    const count = typeof textOrTokens === 'number' ? textOrTokens : estimateTokens(textOrTokens);

    switch (category) {
      case 'task':
        this.taskTokens += count;
        break;
      case 'context':
        this.contextTokens += count;
        break;
      case 'recovery':
        this.recoveryTokens += count;
        break;
      case 'verification':
        this.verificationTokens += count;
        break;
      case 'generation':
        this.generationTokens += count;
        break;
      case 'context_reuse':
        this.contextReusedTokens += count;
        this.cachedContextHits += 1;
        break;
      default:
        this.contextTokens += count;
    }

    return count;
  }

  recordProviderUsage(usage = {}) {
    const prompt = Number(usage.promptTokens) || 0;
    const completion = Number(usage.completionTokens) || 0;
    const total = Number(usage.totalTokens) || (prompt + completion);
    this.providerPromptTokens += prompt;
    this.providerCompletionTokens += completion;
    this.providerTotalTokens += total;
    if (completion > 0) {
      this.generationTokens += completion;
    }
  }

  logToolTokens(toolName, inputPayload, outputPayload) {
    const inputTokens = estimateTokens(inputPayload);
    const outputTokens = estimateTokens(outputPayload);
    const total = inputTokens + outputTokens;

    const logEntry = {
      tool: toolName,
      inputTokens,
      outputTokens,
      totalTokens: total,
      timestamp: new Date().toISOString()
    };

    this.toolTokenLogs.push(logEntry);
    return logEntry;
  }

  incrementRecoveryAttempt() {
    this.recoveryAttempts += 1;
  }

  computeBaseline(allRepoFilesContent = '', iterationsCount = 1) {
    // In naive/baseline architectures, the entire repository + conversation history
    // is repeatedly sent to the model on every single turn.
    const entireRepoTokens = estimateTokens(allRepoFilesContent);
    // Baseline dumps entire repo + task + instructions on initial plan, implementation, and every retry turn
    const baseTurns = Math.max(2, iterationsCount + 1);
    this.baselineTotalTokens = (entireRepoTokens + this.taskTokens) * baseTurns;
    return this.baselineTotalTokens;
  }

  getMetrics() {
    const totalTokens = this.taskTokens + this.contextTokens + this.recoveryTokens + this.verificationTokens + this.generationTokens;
    const totalFiles = Math.max(this.allRepoFiles.size, this.filesRead.size);
    const filesReadCount = this.filesRead.size;
    const filesAvoided = Math.max(0, totalFiles - filesReadCount);

    // Calculate actual token savings vs baseline
    const baseline = this.baselineTotalTokens;
    const tokensSaved = baseline > 0 ? Math.max(0, baseline - totalTokens) : null;
    const savingsPercent = baseline > 0 ? Math.round((tokensSaved / baseline) * 100) : 0;

    return {
      usageType: this.providerTotalTokens > 0 ? 'provider' : 'estimate',
      taskTokens: this.taskTokens,
      contextTokens: this.contextTokens,
      recoveryTokens: this.recoveryTokens,
      verificationTokens: this.verificationTokens,
      generationTokens: this.generationTokens,
      totalTokens,
      providerPromptTokens: this.providerPromptTokens,
      providerCompletionTokens: this.providerCompletionTokens,
      providerTotalTokens: this.providerTotalTokens,
      contextReused: this.contextReusedTokens,
      cachedHits: this.cachedContextHits,
      filesSearched: this.filesSearched,
      filesRead: filesReadCount,
      filesAvoided,
      recoveryAttempts: this.recoveryAttempts,
      baselineTotalTokens: baseline,
      tokensSaved,
      savingsPercent: baseline > 0 ? savingsPercent : null
    };
  }
}
