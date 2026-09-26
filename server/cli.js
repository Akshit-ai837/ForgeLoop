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
    repo: 'products-api',
    task: '',
    provider: process.env.MODEL_PROVIDER || ModelProviderFactory.detectProviderFromEnv() || 'deepseek',
    model: process.env.MODEL_NAME || undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--repo' || arg === '-r') && i + 1 < args.length) {
      options.repo = args[++i];
    } else if ((arg === '--task' || arg === '-t') && i + 1 < args.length) {
      options.task = args[++i];
    } else if ((arg === '--provider' || arg === '-p') && i + 1 < args.length) {
      options.provider = args[++i];
    } else if ((arg === '--model' || arg === '-m') && i + 1 < args.length) {
      options.model = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
ForgeLoop Autonomous Coding Agent - Evaluation CLI

Usage:
  node server/cli.js --task "<issue>" [--repo <repo_id_or_path>] [--provider <name>] [--model <name>]

Options:
  --task, -t       The coding task or GitHub issue description (Required)
  --repo, -r       Configured repository name (products-api, auth-service, user-registration) or path
  --provider, -p   Model provider: deepseek, qwen, gemini, openai (Default: deepseek)
  --model, -m      Specific model name (e.g. deepseek-chat, qwen-plus)
  --help, -h       Show this help message

Environment Variables:
  AI_API_KEY      Standard evaluation API key (or DEEPSEEK_API_KEY / QWEN_API_KEY)
  MODEL_PROVIDER  Default provider (deepseek | qwen | gemini | openai)
  MODEL_NAME      Default model name
`);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const { repo, task, provider, model } = parseArgs();

  if (!task.trim()) {
    console.error('Error: A task description is required. Use --task "<description>"\nRun with --help for usage.');
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
    console.log(`\n[STAGE] ---> ${evt.state}`);
  });

  orchestrator.stateManager.on('log', (logItem) => {
    db.addLog(run.id, {
      timestamp: logItem.timestamp || new Date().toISOString(),
      stage: orchestrator.stateManager.currentState,
      message: logItem.message,
      type: logItem.type,
      meta: logItem.meta
    });
    console.log(`[${logItem.type.toUpperCase()}] ${logItem.message}`);
  });

  try {
    const result = await orchestrator.run(task);

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
    const verificationStatus = isVerified ? 'TASK_VERIFIED' : (result.diffData?.totalFilesChanged === 0 ? 'IMPLEMENTATION_NOT_VERIFIED' : 'VERIFICATION_FAILED');
    
    db.completeRun(run.id, {
      status: result.state || (isVerified ? 'COMPLETED' : 'FAILED'),
      currentStage: result.state || (isVerified ? 'COMPLETED' : 'FAILED'),
      completedAt: new Date().toISOString(),
      finalResult: result.verification?.summary || (isVerified ? 'TASK VERIFIED' : 'VERIFICATION FAILED'),
      verificationStatus,
      durationMs: result.durationMs || null
    });

    console.log('\n' + '='.repeat(70));
    console.log(`FINAL RESULT : ${isVerified ? '✅ TASK VERIFIED' : '❌ NOT VERIFIED'}`);
    console.log(`Files Changed: ${result.filesChanged?.length || 0} (${result.filesChanged?.join(', ') || 'none'})`);
    console.log(`Tests Status : ${result.tests?.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Total Tokens : ${result.tokenMetrics?.totalTokens || 0}`);
    console.log(`Run ID       : ${run.id}`);
    console.log('='.repeat(70));

    process.exit(isVerified ? 0 : 2);
  } catch (err) {
    const completedAt = new Date().toISOString();
    db.addLog(run.id, { timestamp: completedAt, stage: 'FAILED', message: err.message, type: 'error' });
    db.completeRun(run.id, {
      status: 'FAILED',
      currentStage: 'FAILED',
      completedAt,
      error: err.message,
      verificationStatus: 'FAILED',
      finalResult: `Execution failed: ${err.message}`
    });

    console.error(`\n❌ Execution Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
