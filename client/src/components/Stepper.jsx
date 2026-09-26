import React from 'react';
import { Check } from 'lucide-react';

export default function Stepper({ currentState }) {
  const steps = [
    { id: 1, key: 'understand', label: 'Task understood', states: ['ANALYZING'] },
    { id: 2, key: 'search', label: 'Repository searched', states: ['SEARCHING'] },
    { id: 3, key: 'context', label: 'Context selected', states: ['CONTEXT_SELECTED'] },
    { id: 4, key: 'plan', label: 'Plan created', states: ['PLANNING'] },
    { id: 5, key: 'implement', label: 'Implementing changes', states: ['IMPLEMENTING'] },
    { id: 6, key: 'test', label: 'Running tests', states: ['TESTING', 'FAILURE_ANALYSIS', 'RECOVERING'] },
    { id: 7, key: 'verify', label: 'Verification', states: ['VERIFYING', 'COMPLETED'] },
  ];

  // Map state to current active index (1 to 7)
  const getActiveStep = (state) => {
    switch (state) {
      case 'ANALYZING': return 1;
      case 'SEARCHING': return 2;
      case 'CONTEXT_SELECTED': return 3;
      case 'PLANNING': return 4;
      case 'IMPLEMENTING': return 5;
      case 'TESTING':
      case 'FAILURE_ANALYSIS':
      case 'RECOVERING': return 6;
      case 'VERIFYING': return 7;
      case 'COMPLETED': return 8; // all completed
      default: return 0; // IDLE
    }
  };

  const activeIndex = getActiveStep(currentState);

  return (
    <div className="bg-[#0f172a] border border-slate-800/90 rounded-2xl px-6 py-4 shadow-md">
      <div className="flex items-center justify-between relative">
        {steps.map((step, idx) => {
          const isDone = activeIndex > step.id;
          const isActive = activeIndex === step.id;
          const isPending = activeIndex < step.id;

          return (
            <React.Fragment key={step.id}>
              {/* Step item */}
              <div className="flex items-center gap-2 z-10">
                {/* Circle badge */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    isDone
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-500/30'
                      : isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/20'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={`text-xs font-medium whitespace-nowrap transition-colors ${
                    isDone
                      ? 'text-slate-300 font-semibold'
                      : isActive
                      ? 'text-blue-400 font-bold'
                      : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line between steps */}
              {idx < steps.length - 1 && (
                <div className="flex-1 mx-3 h-[2px] rounded-full overflow-hidden bg-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      activeIndex > step.id
                        ? 'bg-emerald-500 w-full'
                        : activeIndex === step.id
                        ? 'bg-gradient-to-r from-emerald-500 to-blue-600 w-full'
                        : 'w-0'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
