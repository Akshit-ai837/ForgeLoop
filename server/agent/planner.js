import { estimateTokens } from './tokenManager.js';

export class Planner {
  constructor(options = {}) {
    this.modelProvider = options.modelProvider;
    this.tokenManager = options.tokenManager;
  }

  async createPlan(task, repoOutline, rankedFiles) {
    const plan = await this.modelProvider.generatePlan(task, repoOutline, rankedFiles);

    if (this.tokenManager) {
      this.tokenManager.recordProviderUsage(plan.usage);
      const planTokens = estimateTokens(JSON.stringify(plan));
      this.tokenManager.addTokens('task', planTokens);
    }

    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error('Model did not return an actionable implementation plan.');
    }
    return plan;
  }
}
