export class Executor {
  constructor(options = {}) {
    this.toolManager = options.toolManager;
    this.stateManager = options.stateManager;
  }

  async executeAction(action = {}) {
    const toolName = action.tool;
    const file = action.file || action.path || 'repository';

    if (action.thought && this.stateManager) {
      this.stateManager.log(`Thinking: ${action.thought}`, 'info');
    }

    if (this.stateManager) {
      this.stateManager.log(`Action: ${toolName} on ${file}`, 'tool', { action });
    }

    let params = {};
    if (toolName === 'edit_file') {
      params = {
        path: action.file || action.path,
        targetContent: action.targetContent,
        replacementContent: action.replacementContent
      };
    } else if (toolName === 'write_file') {
      params = {
        path: action.file || action.path,
        content: action.content
      };
    } else if (toolName === 'read_file') {
      params = {
        path: action.file || action.path
      };
    } else if (toolName === 'read_file_range') {
      params = {
        path: action.file || action.path,
        startLine: action.startLine,
        endLine: action.endLine
      };
    } else if (toolName === 'search_code') {
      params = {
        query: action.query
      };
    } else if (toolName === 'run_command' || toolName === 'run_tests') {
      params = {
        command: action.command
      };
    } else {
      params = action.params || {};
    }

    const res = await this.toolManager.execute(toolName, params);

    if (this.stateManager) {
      if (res.success) {
        this.stateManager.log(`Observation: ${toolName} succeeded.`, 'success', { result: res.result });
      } else {
        this.stateManager.log(`Observation: ${toolName} failed: ${res.error || 'Unknown error'}`, 'error');
      }
    }

    return {
      action,
      result: res
    };
  }

  async executeActions(actions = []) {
    const results = [];
    for (const action of actions) {
      const res = await this.executeAction(action);
      results.push(res);
    }
    return results;
  }
}
