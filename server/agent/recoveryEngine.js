/**
 * RecoveryEngine coordinates the targeted repair loop when verification tests fail.
 * Adheres strictly to token-efficient repair and safety limits.
 */

export class RecoveryEngine {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.modelProvider = options.modelProvider;
    this.contextEngine = options.contextEngine;
    this.toolManager = options.toolManager;
    this.tokenManager = options.tokenManager;
  }

  async attemptRecovery(failureMemory, originalTask, currentCodeSnippet, attemptNumber) {
    if (attemptNumber > this.maxAttempts) {
      return {
        success: false,
        blocked: true,
        reason: `Exceeded maximum safe repair attempts (${this.maxAttempts}). Escalating to HUMAN_REVIEW.`
      };
    }

    // 1. Build minimal, targeted recovery payload (NOT full conversation or repo)
    const recoveryContext = this.contextEngine.buildFailureRecoveryContext(
      failureMemory,
      originalTask,
      currentCodeSnippet
    );

    // 2. Request targeted repair from model provider
    const repairResponse = await this.modelProvider.generateRepair(failureMemory, recoveryContext);
    this.tokenManager?.recordProviderUsage(repairResponse.usage);

    // 3. Apply the repair actions via ToolManager
    const appliedActions = [];
    if (repairResponse.repairActions && repairResponse.repairActions.length > 0) {
      for (const action of repairResponse.repairActions) {
        const params = action.tool === 'write_file'
          ? { path: action.file, content: action.content }
          : { path: action.file, targetContent: action.targetContent, replacementContent: action.replacementContent };
        const result = await this.toolManager.execute(action.tool, params);
        appliedActions.push({ action, result });
      }
    }

    if (repairResponse.repairActions?.length && appliedActions.some(action => !action.result.success)) {
      throw new Error('One or more model-generated repair actions could not be applied.');
    }
    return {
      success: appliedActions.length > 0 && appliedActions.every(a => a.result.success),
      diagnosis: repairResponse.diagnosis,
      appliedActions,
      tokensUsed: recoveryContext.tokens,
      attemptNumber
    };
  }
}
