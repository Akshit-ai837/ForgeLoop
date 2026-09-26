import fs from 'node:fs';
import path from 'node:path';
import { listFiles } from './fileTools.js';

export async function searchCode(repoPath, query, options = {}) {
  const { isRegex = false, maxResults = 50, contextLines = 2 } = options;
  const files = await listFiles(repoPath);
  const matches = [];

  let matcher;
  try {
    matcher = isRegex ? new RegExp(query, 'i') : null;
  } catch (e) {
    throw new Error(`Invalid regex pattern: ${query}`);
  }

  for (const file of files) {
    if (matches.length >= maxResults) break;
    const fullPath = path.resolve(repoPath, file.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isMatch = matcher ? matcher.test(line) : line.toLowerCase().includes(query.toLowerCase());

        if (isMatch) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length - 1, i + contextLines);
          const snippet = lines.slice(start, end + 1).map((l, idx) => ({
            lineNumber: start + idx + 1,
            line: l,
            isTarget: start + idx === i
          }));

          matches.push({
            file: file.path,
            lineNumber: i + 1,
            lineContent: line.trim(),
            snippet
          });

          if (matches.length >= maxResults) break;
        }
      }
    } catch (err) {
      // Skip unreadable files
    }
  }

  return {
    query,
    totalMatches: matches.length,
    matches
  };
}

export async function findByName(repoPath, pattern) {
  const files = await listFiles(repoPath);
  const normalizedPattern = pattern.toLowerCase();
  const matched = files.filter(f => {
    const filename = path.basename(f.path).toLowerCase();
    const relPath = f.path.toLowerCase();
    return filename.includes(normalizedPattern) || relPath.includes(normalizedPattern);
  });

  return {
    pattern,
    totalFound: matched.length,
    files: matched
  };
}

export async function getRepoOutline(repoPath) {
  const files = await listFiles(repoPath);

  // Group files into logical categories and summarize exports/signatures
  const tree = {};
  const symbols = [];

  for (const f of files) {
    const ext = path.extname(f.path);
    const fullPath = path.resolve(repoPath, f.path);

    // Extract quick function/class/route signatures for JS/TS
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          // match function declarations, router endpoints, class declarations
          const funcMatch = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/);
          const routeMatch = line.match(/(?:router|app)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/i);
          const classMatch = line.match(/class\s+([a-zA-Z0-9_$]+)/);

          if (routeMatch) {
            symbols.push({
              file: f.path,
              type: 'route',
              name: `${routeMatch[1].toUpperCase()} ${routeMatch[2]}`,
              line: idx + 1
            });
          } else if (classMatch) {
            symbols.push({
              file: f.path,
              type: 'class',
              name: classMatch[1],
              line: idx + 1
            });
          } else if (funcMatch) {
            symbols.push({
              file: f.path,
              type: 'function',
              name: funcMatch[1] || funcMatch[2],
              line: idx + 1
            });
          }
        });
      } catch (e) {}
    }

    const parts = f.path.split('/');
    let cur = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        cur[part] = { _type: 'file', lines: f.lines, size: f.size };
      } else {
        cur[part] = cur[part] || { _type: 'dir', children: {} };
        cur = cur[part].children;
      }
    }
  }

  return {
    totalFiles: files.length,
    tree,
    symbols
  };
}
