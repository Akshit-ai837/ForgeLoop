import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// Safeguards against malicious or destructive commands
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,
  /rm\s+-rf\s+\.\./,
  /:(){ :|:& };:/,
  /mkfs/,
  /dd\s+if=/,
  /shutdown/i,
  /reboot/i,
  /curl\s+.*\|\s*(?:bash|sh)/i,
  /wget\s+.*\|\s*(?:bash|sh)/i,
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777\s+\//,
  /cat\s+~\/\.ssh/
];

function validateCommandSafety(command) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked by safety rails: matched prohibited pattern ${pattern}`);
    }
  }
}

export function runCommand(repoPath, command, options = {}) {
  const { timeout = 25000, env = {} } = options;
  const resolvedRepo = path.resolve(repoPath);

  validateCommandSafety(command);

  // Clean out any recursive test runner environment variables
  const cleanEnv = { ...process.env };
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('NODE_TEST')) {
      delete cleanEnv[key];
    }
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const proc = exec(
      command,
      {
        cwd: resolvedRepo,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...cleanEnv,
          CI: 'true',
          FORCE_COLOR: '0',
          ...env
        }
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const timedOut = error && error.killed && error.signal === 'SIGTERM';

        resolve({
          command,
          exitCode: error ? (error.code ?? 1) : 0,
          stdout: (stdout || '').toString(),
          stderr: (stderr || '').toString(),
          durationMs,
          timedOut: Boolean(timedOut),
          error: error ? error.message : null,
          success: !error && !timedOut
        });
      }
    );
  });
}

export async function runTests(repoPath, testCmd = 'npm test') {
  const result = await runCommand(repoPath, testCmd, { timeout: 35000 });
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  // Parse common test runner patterns (node --test, jest, mocha, vitest)
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let totalCount = 0;

  // Pattern: "ℹ tests 18" "ℹ pass 18" "ℹ fail 0"
  const passMatch = combinedOutput.match(/(?:pass|passed)\s*[:]?\s*(\d+)/i);
  const failMatch = combinedOutput.match(/(?:fail|failed)\s*[:]?\s*(\d+)/i);
  const totalMatch = combinedOutput.match(/(?:tests|total)\s*[:]?\s*(\d+)/i);
  const skippedMatch = combinedOutput.match(/(?:skip|skipped|todo)\s*[:]?\s*(\d+)/i);

  if (passMatch) passedCount = parseInt(passMatch[1], 10);
  if (failMatch) failedCount = parseInt(failMatch[1], 10);
  if (skippedMatch) skippedCount = parseInt(skippedMatch[1], 10);
  if (totalMatch) totalCount = parseInt(totalMatch[1], 10);

  if (!totalCount) {
    totalCount = passedCount + failedCount;
  }

  const passed = result.exitCode === 0 && failedCount === 0;

  return {
    ...result,
    type: 'TEST_RUN',
    passed,
    passedCount,
    failedCount,
    skippedCount,
    totalCount,
    rawOutput: combinedOutput.trim()
  };
}

export function getConfiguredCheckCommand(repoPath, check) {
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.scripts?.[check] ? `npm run ${check}` : null;
  } catch (error) {
    throw new Error(`Unable to read ${packageJsonPath}: ${error.message}`);
  }
}

export async function runLint(repoPath, lintCmd = 'npm run lint') {
  const result = await runCommand(repoPath, lintCmd, { timeout: 20000 });
  return {
    ...result,
    type: 'LINT_RUN',
    passed: result.exitCode === 0,
    rawOutput: `${result.stdout}\n${result.stderr}`.trim()
  };
}

export async function runBuild(repoPath, buildCmd = 'npm run build') {
  const result = await runCommand(repoPath, buildCmd, { timeout: 45000 });
  return {
    ...result,
    type: 'BUILD_RUN',
    passed: result.exitCode === 0,
    rawOutput: `${result.stdout}\n${result.stderr}`.trim()
  };
}
