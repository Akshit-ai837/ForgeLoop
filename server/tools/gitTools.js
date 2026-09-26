import { runCommand } from './commandTools.js';

export async function gitStatus(repoPath) {
  const result = await runCommand(repoPath, 'git status --porcelain');
  if (!result.success && result.stderr.includes('not a git repository')) {
    return {
      isGitRepo: false,
      files: [],
      clean: true
    };
  }

  const lines = result.stdout.split('\n').filter(Boolean);
  const files = lines.map(line => {
    const status = line.slice(0, 2).trim();
    const filePath = line.slice(3).trim();
    return { status, path: filePath };
  });

  return {
    isGitRepo: true,
    files,
    clean: files.length === 0,
    raw: result.stdout
  };
}

export async function gitDiff(repoPath, options = {}) {
  // Check staged or unstaged diff, or diff against HEAD
  const diffCmd = options.staged ? 'git diff --cached' : 'git diff HEAD';
  let result = await runCommand(repoPath, diffCmd);

  // If HEAD does not exist yet (fresh repo), fallback to git diff
  if (!result.success || result.stderr.includes('ambiguous argument')) {
    result = await runCommand(repoPath, 'git diff');
  }

  const rawDiff = result.stdout || '';

  // Parse diff per file
  const fileDiffs = [];
  const files = rawDiff.split('diff --git ');

  for (const f of files) {
    if (!f.trim()) continue;
    const firstLine = f.split('\n')[0];
    const match = firstLine.match(/a\/(.*?)\s+b\/(.*)/);
    const fileName = match ? match[2] : 'unknown';

    const addedLines = (f.match(/^\+[^+]/gm) || []).length;
    const removedLines = (f.match(/^-[^-]/gm) || []).length;

    fileDiffs.push({
      file: fileName,
      added: addedLines,
      removed: removedLines,
      diff: 'diff --git ' + f
    });
  }

  return {
    rawDiff,
    totalFilesChanged: fileDiffs.length,
    fileDiffs,
    hasChanges: fileDiffs.length > 0
  };
}

export async function gitReset(repoPath) {
  await runCommand(repoPath, 'git checkout .');
  await runCommand(repoPath, 'git clean -fd');
  return { success: true };
}

export async function initRepo(repoPath) {
  const status = await runCommand(repoPath, 'git rev-parse --is-inside-work-tree');
  if (!status.success) {
    await runCommand(repoPath, 'git init');
    await runCommand(repoPath, 'git config user.name "ForgeLoop Agent"');
    await runCommand(repoPath, 'git config user.email "agent@forgeloop.local"');
    await runCommand(repoPath, 'git add .');
    await runCommand(repoPath, 'git commit -m "initial commit" --allow-empty');
  }
}
