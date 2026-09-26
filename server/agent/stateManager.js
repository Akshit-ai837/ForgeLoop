import { EventEmitter } from 'node:events';

export const AgentState = {
  IDLE: 'IDLE',
  ANALYZING: 'ANALYZING',
  PLANNING: 'PLANNING',
  SEARCHING: 'SEARCHING',
  CONTEXT_SELECTED: 'CONTEXT_SELECTED',
  IMPLEMENTING: 'IMPLEMENTING',
  TESTING: 'TESTING',
  FAILURE_ANALYSIS: 'FAILURE_ANALYSIS',
  RECOVERING: 'RECOVERING',
  VERIFYING: 'VERIFYING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED_NEEDS_REVIEW: 'BLOCKED_NEEDS_REVIEW'
};

export class StateManager extends EventEmitter {
  constructor() {
    super();
    this.currentState = AgentState.IDLE;
    this.currentTask = null;
    this.history = [];
    this.logs = [];
    this.progressSteps = [
      { id: 'understand', label: 'Task understood', status: 'pending' },
      { id: 'scan', label: 'Repository scanned', status: 'pending' },
      { id: 'plan', label: 'Plan created', status: 'pending' },
      { id: 'context', label: 'Context selected & ranked', status: 'pending' },
      { id: 'implement', label: 'Implementing changes', status: 'pending' },
      { id: 'test', label: 'Running tests', status: 'pending' },
      { id: 'recovery', label: 'Failure recovery (if needed)', status: 'pending' },
      { id: 'verify', label: 'Evidence verification', status: 'pending' }
    ];
  }

  reset(taskDescription = '') {
    this.currentState = AgentState.IDLE;
    this.currentTask = taskDescription;
    this.history = [];
    this.logs = [];
    this.progressSteps = [
      { id: 'understand', label: 'Task understood', status: 'pending' },
      { id: 'scan', label: 'Repository scanned', status: 'pending' },
      { id: 'plan', label: 'Plan created', status: 'pending' },
      { id: 'context', label: 'Context selected & ranked', status: 'pending' },
      { id: 'implement', label: 'Implementing changes', status: 'pending' },
      { id: 'test', label: 'Running tests', status: 'pending' },
      { id: 'recovery', label: 'Failure recovery (if needed)', status: 'pending' },
      { id: 'verify', label: 'Evidence verification', status: 'pending' }
    ];
    this.emitChange();
  }

  setState(newState, details = {}) {
    const prevState = this.currentState;
    this.currentState = newState;

    const transition = {
      from: prevState,
      to: newState,
      timestamp: new Date().toISOString(),
      details
    };
    this.history.push(transition);

    // Auto-update progress step statuses
    this.updateProgressForState(newState);

    this.emit('state_changed', {
      state: this.currentState,
      prevState,
      details,
      timestamp: transition.timestamp
    });

    this.emitChange();
  }

  updateProgressForState(state) {
    const markDone = (id) => {
      const step = this.progressSteps.find(s => s.id === id);
      if (step) step.status = 'done';
    };
    const markActive = (id) => {
      const step = this.progressSteps.find(s => s.id === id);
      if (step) step.status = 'active';
    };

    switch (state) {
      case AgentState.ANALYZING:
        markActive('understand');
        break;
      case AgentState.PLANNING:
        markDone('understand');
        markActive('plan');
        break;
      case AgentState.SEARCHING:
        markDone('plan');
        markActive('scan');
        break;
      case AgentState.CONTEXT_SELECTED:
        markDone('scan');
        markDone('context');
        break;
      case AgentState.IMPLEMENTING:
        markDone('context');
        markActive('implement');
        break;
      case AgentState.TESTING:
        markDone('implement');
        markActive('test');
        break;
      case AgentState.FAILURE_ANALYSIS:
      case AgentState.RECOVERING:
        markActive('recovery');
        break;
      case AgentState.VERIFYING:
        markDone('test');
        if (this.progressSteps.find(s => s.id === 'recovery').status === 'active') {
          markDone('recovery');
        }
        markActive('verify');
        break;
      case AgentState.COMPLETED:
        markDone('verify');
        break;
      case AgentState.FAILED:
      case AgentState.BLOCKED_NEEDS_REVIEW:
        const currentActive = this.progressSteps.find(s => s.status === 'active');
        if (currentActive) currentActive.status = 'failed';
        break;
    }
  }

  log(message, type = 'info', meta = {}) {
    const logItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString('en-US', { hour12: false }),
      message,
      type, // 'info' | 'success' | 'warn' | 'error' | 'tool'
      meta
    };

    this.logs.push(logItem);
    this.emit('log', logItem);
    this.emitChange();
  }

  emitChange() {
    this.emit('update', this.getSnapshot());
  }

  getSnapshot() {
    return {
      state: this.currentState,
      task: this.currentTask,
      progressSteps: this.progressSteps,
      logs: this.logs.slice(-200), // last 200 logs
      history: this.history
    };
  }
}
