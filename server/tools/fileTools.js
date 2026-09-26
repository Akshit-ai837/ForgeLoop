import fs from 'node:fs';
import path from 'node:path';

function assertSafePath(repoPath, relativePath) {
  const resolvedRepo = path.resolve(repoPath);
  const resolvedTarget = path.resolve(repoPath, relativePath);
  const relativeTarget = path.relative(resolvedRepo, resolvedTarget);
  if (!relativeTarget || relativeTarget.startsWith(`..${path.sep}`) || relativeTarget === '..' || path.isAbsolute(relativeTarget)) {
    throw new Error(`Path traversal violation: ${relativePath} is outside repository root ${repoPath}`);
  }
  return resolvedTarget;
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.cache', '.coverage', '.system_generated']);
const IGNORED_FILES = new Set(['.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

export async function listFiles(repoPath, options = {}) {
  const resolvedRepo = path.resolve(repoPath);
  const results = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(resolvedRepo, fullPath);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (!IGNORED_FILES.has(entry.name) && !entry.name.startsWith('.')) {
          try {
            const stats = fs.statSync(fullPath);
            // approximate line count if text file
            let lines = 0;
            const ext = path.extname(entry.name).toLowerCase();
            const textExts = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md', '.txt', '.yaml', '.yml', '.env'];
            if (textExts.includes(ext) || ext === '') {
              const content = fs.readFileSync(fullPath, 'utf8');
              lines = content.split('\n').length;
            }
            results.push({
              path: relPath,
              size: stats.size,
              lines,
              ext: ext || 'none'
            });
          } catch (e) {
            // file read error or binary file
            results.push({
              path: relPath,
              size: 0,
              lines: 0,
              ext: path.extname(entry.name)
            });
          }
        }
      }
    }
  }

  walk(resolvedRepo);
  return results;
}

export async function readFile(repoPath, relativePath) {
  const target = assertSafePath(repoPath, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const content = fs.readFileSync(target, 'utf8');
  return {
    path: relativePath,
    content,
    lines: content.split('\n').length,
    bytes: Buffer.byteLength(content, 'utf8')
  };
}

export async function readFileRange(repoPath, relativePath, startLine, endLine) {
  const target = assertSafePath(repoPath, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const content = fs.readFileSync(target, 'utf8');
  const allLines = content.split('\n');
  const totalLines = allLines.length;

  const start = Math.max(1, parseInt(startLine, 10) || 1);
  const end = Math.min(totalLines, parseInt(endLine, 10) || totalLines);

  const selected = allLines.slice(start - 1, end).join('\n');

  return {
    path: relativePath,
    startLine: start,
    endLine: end,
    totalLines,
    content: selected,
    linesCount: end - start + 1
  };
}

export async function writeFile(repoPath, relativePath, content) {
  const target = assertSafePath(repoPath, relativePath);
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, content, 'utf8');
  return {
    path: relativePath,
    bytesWritten: Buffer.byteLength(content, 'utf8'),
    success: true
  };
}

export async function editFile(repoPath, relativePath, targetContent, replacementContent) {
  const target = assertSafePath(repoPath, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const fileContent = fs.readFileSync(target, 'utf8');

  if (!fileContent.includes(targetContent)) {
    // Attempt relaxed whitespace match if exact match fails
    const normalizedFile = fileContent.replace(/\r\n/g, '\n');
    const normalizedTarget = targetContent.replace(/\r\n/g, '\n');

    if (normalizedFile.includes(normalizedTarget)) {
      const occurrences = normalizedFile.split(normalizedTarget).length - 1;
      if (occurrences > 1) {
        throw new Error(`Target content found multiple (${occurrences}) times in ${relativePath}. Specify more surrounding context to disambiguate.`);
      }
      const updated = normalizedFile.replace(normalizedTarget, replacementContent.replace(/\r\n/g, '\n'));
      fs.writeFileSync(target, updated, 'utf8');
      return { path: relativePath, success: true, modified: true };
    }

    // Attempt trimmed line-by-line matching
    const trimLines = str => str.split('\n').map(l => l.trimEnd()).join('\n').trim();
    const trimmedTarget = trimLines(normalizedTarget);
    const fileLines = normalizedFile.split('\n');
    const targetLines = trimmedTarget.split('\n');

    let matchStartIndex = -1;
    for (let i = 0; i <= fileLines.length - targetLines.length; i++) {
      let matches = true;
      for (let j = 0; j < targetLines.length; j++) {
        if (fileLines[i + j].trimEnd() !== targetLines[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        if (matchStartIndex !== -1) {
          throw new Error(`Target content found multiple times with relaxed formatting in ${relativePath}.`);
        }
        matchStartIndex = i;
      }
    }

    if (matchStartIndex !== -1) {
      const newReplacementLines = replacementContent.replace(/\r\n/g, '\n').split('\n');
      fileLines.splice(matchStartIndex, targetLines.length, ...newReplacementLines);
      fs.writeFileSync(target, fileLines.join('\n'), 'utf8');
      return { path: relativePath, success: true, modified: true };
    }

    throw new Error(`Target content to replace not found in ${relativePath}. Check exact formatting and indentation.`);
  }

  const occurrences = fileContent.split(targetContent).length - 1;
  if (occurrences > 1) {
    throw new Error(`Target content found multiple (${occurrences}) times in ${relativePath}. Specify more surrounding context to disambiguate.`);
  }

  const updated = fileContent.replace(targetContent, replacementContent);
  fs.writeFileSync(target, updated, 'utf8');
  return {
    path: relativePath,
    success: true,
    modified: true
  };
}
