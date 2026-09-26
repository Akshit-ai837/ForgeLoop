#!/usr/bin/env node

/**
 * ForgeLoop Headless Evaluation CLI
 * 
 * Allows running the autonomous coding harness directly from command line:
 * node server/cli.js --repo <repo_name_or_path> --task "<issue_description>"
 * 
 * Respects:
 * - AI_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY
 * - MODEL_PROVIDER (default: deepseek)
 * - MODEL_NAME
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { AgentOrchestrator } from './agent/orchestrator.js';
import { ModelProviderFactory } from './services/modelProvider.js';
import { db } from './db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    repo: null,
    task: '',
    file: null,
    provider: process.env.MODEL_PROVIDER || ModelProviderFactory.detectProviderFromEnv() || 'deepseek',
    model: process.env.MODEL_NAME || undefined
  };

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--repo' || arg === '-r') && i + 1 < args.length) {
      options.repo = args[++i];
    } else if ((arg === '--task' || arg === '-t') && i + 1 < args.length) {
      options.task = args[++i];
    } else if ((arg === '--file' || arg === '-f') && i + 1 < args.length) {
      options.file = args[++i];
    } else if ((arg === '--provider' || arg === '-p') && i + 1 < args.length) {
      options.provider = args[++i];
    } else if ((arg === '--model' || arg === '-m') && i + 1 < args.length) {
      options.model = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
ForgeLoop Autonomous AI Coding Harness

Primary Usage:
  forgeloop "<task description>"
  forgeloop --file <hint_file> "<task description>"
  forgeloop --repo <path> "<task description>"

Options:
  --task, -t       The coding task or GitHub issue description
  --file, -f       Optional hint file to prioritize in context ranking
  --repo, -r       Target repository directory (defaults to current working directory)
  --provider, -p   Model provider: deepseek, qwen, openai, openrouter, gemini (default: deepseek)
  --model, -m      Specific model name (e.g. deepseek-chat, qwen-plus)
  --help, -h       Show this help message

Environment Variables:
  AI_API_KEY      Universal evaluation API key
  OPENROUTER_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY
`);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (!options.task && positional.length > 0) {
    options.task = positional.join(' ');
  }

  if (!options.repo) {
    options.repo = process.cwd();
  }

  return options;
}

async function main() {
  const { repo, task, file, provider, model } = parseArgs();

  if (!task.trim()) {
    console.error('Error: A task description is required.\nUsage: forgeloop "<task description>" or forgeloop --task "<description>"\nRun with --help for usage.');
    process.exit(1);
  }

  // Resolve repository path
  const demoBaseDir = path.resolve(__dirname, '../demo-repos');
  const configuredRepos = new Map([
    ['products-api', path.join(demoBaseDir, 'products-api')],
    ['auth-service', path.join(demoBaseDir, 'auth-service')],
    ['user-registration', path.join(demoBaseDir, 'user-registration')]
  ]);

  let resolvedRepoPath = configuredRepos.get(repo) || path.resolve(repo);
  if (!fs.existsSync(resolvedRepoPath)) {
    console.error(`Error: Repository path does not exist: ${resolvedRepoPath}`);
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('⚡ ForgeLoop Autonomous Agent Harness - Evaluation Runner');
  console.log('='.repeat(70));
  console.log(`Repository : ${resolvedRepoPath}`);
  console.log(`Provider   : ${provider}`);
  if (model) console.log(`Model      : ${model}`);
  console.log(`Task       : ${task}`);
  console.log('='.repeat(70));

  // Instantiate model provider adapter
  let providerInstance;
  try {
    providerInstance = ModelProviderFactory.create(provider, { model });
  } catch (err) {
    console.error(`Provider Error: ${err.message}`);
    process.exit(1);
  }

  const modelInfo = providerInstance.getModelInfo();
  if (!modelInfo.isConfigured) {
    console.error(`\n❌ MODEL NOT CONFIGURED:`);
    console.error(`A valid API key must be provided via ${providerInstance.getExpectedEnvKey()}.`);
    console.error(`Example: export AI_API_KEY="<your-key>"`);
    process.exit(1);
  }

  const runId = randomUUID();
  const run = db.createRun({
    id: runId,
    task,
    repository: repo,
    status: 'RUNNING',
    currentStage: 'ANALYZING',
    createdAt: new Date().toISOString()
  });

  const orchestrator = new AgentOrchestrator({
    repoPath: resolvedRepoPath,
    modelProvider: providerInstance,
    modelConfig: {
      apiKey: providerInstance.apiKey,
      model: providerInstance.model,
      baseURL: providerInstance.baseURL
    }
  });

  orchestrator.stateManager.on('state_changed', (evt) => {
    db.updateRunStage(run.id, evt.state);
  });

  orchestrator.stateManager.on('log', (logItem) => {
    db.addLog(run.id, {
      timestamp: logItem.timestamp || new Date().toISOString(),
      stage: orchestrator.stateManager.currentState,
      message: logItem.message,
      type: logItem.type,
      meta: logItem.meta
    });

    const msg = logItem.message || '';
    if (msg.startsWith('Identified relevant files:')) {
      const match = msg.match(/Selected (\d+) context files \((\d+) estimated context tokens\)/);
      if (match) {
        console.log(`  ${match[1]} files selected`);
        console.log(`  ${Number(match[2]).toLocaleString()} context tokens`);
      }
    } else if (msg.startsWith('Plan created with')) {
      console.log('  ✓ Implementation plan identified');
    } else if (logItem.meta?.codeChanges) {
      for (const change of logItem.meta.codeChanges) {
        if (change.file) {
          console.log(`  ✓ Modified ${change.file}`);
        }
      }
    } else if (msg.startsWith('Applied repair to')) {
      console.log('  ✓ Failure analyzed');
      console.log('  ✓ Fix applied');
    } else if (msg.includes('test command failed') || msg.includes('Test command failed')) {
      const match = msg.match(/(\d+) failed/i);
      console.log(`  ✗ ${match ? match[1] : ''} tests failed`);
    } else if (msg.includes('test command passed') || msg.includes('Test command passed')) {
      console.log('  ✓ Tests passed');
    }
  });

  try {
    const result = await orchestrator.run(task, { hintFile: file });

    if (result.rankedContext?.scoredFiles) {
      db.saveContext(run.id, result.rankedContext.scoredFiles);
    }
    if (result.diffData?.fileDiffs) {
      db.saveFiles(run.id, result.diffData.fileDiffs);
    }
    if (result.tests) {
      db.saveTests(run.id, result.tests);
    }
    if (result.tokenMetrics) {
      db.saveMetrics(run.id, result.tokenMetrics);
    }

    const isVerified = result.verification?.verified;
    const filesChanged = result.filesChanged || [];
    const verificationStatus = isVerified
      ? 'TASK_VERIFIED'
      : (filesChanged.length === 0 ? 'IMPLEMENTATION_NOT_VERIFIED' : 'TASK_FAILED');

    db.completeRun(run.id, {
      status: isVerified ? 'COMPLETED' : 'FAILED',
      currentStage: verificationStatus,
      completedAt: new Date().toISOString(),
      finalResult: result.verification?.summary || verificationStatus,
      verificationStatus,
      durationMs: result.durationMs || null
    });

    if (isVerified) {
      console.log('  ✓ Tests passed');
      console.log('  ✓ Diff inspected');
      console.log('  ✓ Target behavior verified');
    }

    // Terminal-First Evidence Report (Matching Section 14)
    console.log('\n' + '─'.repeat(32));
    console.log(verificationStatus.replace(/_/g, ' '));
    console.log('─'.repeat(32));

    console.log('\nChanged:');
    if (filesChanged.length > 0) {
      for (const changed of filesChanged) {
        console.log(`  ${changed}`);
      }
    } else {
      console.log('  None');
    }

    const metrics = result.tokenMetrics || {};
    console.log('\nToken usage:');
    console.log(`  Context: ${Number(metrics.contextTokens || 0).toLocaleString()}`);
    console.log(`  Recovery: ${Number(metrics.recoveryTokens || 0).toLocaleString()}`);
    console.log(`  Total: ${Number(metrics.totalTokens || 0).toLocaleString()}`);
    console.log('');

    process.exit(isVerified ? 0 : 1);
  } catch (err) {
    const completedAt = new Date().toISOString();
    db.addLog(run.id, { timestamp: completedAt, stage: 'FAILED', message: err.message, type: 'error' });
    db.completeRun(run.id, {
      status: 'FAILED',
      currentStage: 'FAILED',
      completedAt,
      error: err.message,
      verificationStatus: 'TASK_FAILED',
      finalResult: `Execution failed: ${err.message}`
    });

    console.log('\n' + '─'.repeat(32));
    console.log('TASK FAILED');
    console.log('─'.repeat(32));
    console.error(`\nError: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFatal ForgeLoop CLI Error:', err.message);
  process.exit(1);
});
