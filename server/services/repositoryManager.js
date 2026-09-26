import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.js';

export function detectRepositoryMetadata(repoPath) {
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test) {
        return {
          hasTestSuite: true,
          testCommand: 'npm test'
        };
      }
    } catch (_) {}
  }
  return {
    hasTestSuite: false,
    testCommand: null
  };
}

export class RepositoryManager {
  constructor(workspaceDir) {
    this.workspaceDir = path.resolve(workspaceDir);
    this.repos = new Map();
  }

  parseGitHubUrl(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('Repository URL is required');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch (e) {
      throw new Error(`Invalid repository URL: ${url}`);
    }

    if (!parsedUrl.hostname.includes('github.com')) {
      throw new Error('Only GitHub repositories are supported');
    }

    const segments = parsedUrl.pathname
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .split('/');

    if (segments.length < 2 || !segments[0] || !segments[1]) {
      throw new Error('Expected format: https://github.com/owner/repo');
    }

    if (segments.length > 2) {
      throw new Error('Repository URL contains invalid characters or extra path segments');
    }

    const owner = segments[0];
    let name = segments[1];
    if (name.endsWith('.git')) {
      name = name.slice(0, -4);
    }

    const validSegment = /^[a-zA-Z0-9_.-]+$/;
    if (!validSegment.test(owner) || !validSegment.test(name)) {
      throw new Error('Repository URL contains invalid characters');
    }

    return {
      owner,
      name,
      fullName: `${owner}/${name}`,
      cloneUrl: `https://github.com/${owner}/${name}.git`
    };
  }

  assertSafeWorkspace(targetPath) {
    const resolvedWorkspace = path.resolve(this.workspaceDir);
    const resolvedTarget = path.resolve(targetPath);
    const rel = path.relative(resolvedWorkspace, resolvedTarget);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Target path escapes workspace: ${targetPath}`);
    }

    return resolvedTarget;
  }

  registerLocalPath(repoPath, metadata = {}) {
    const resolved = path.resolve(repoPath);
    const id = metadata.id || `repo_${Date.now()}`;
    const name = metadata.name || path.basename(resolved);
    const fullName = metadata.fullName || name;

    const repo = {
      id,
      name,
      fullName,
      path: resolved,
      url: metadata.url || null,
      source: metadata.source || 'local',
      createdAt: new Date().toISOString()
    };

    this.repos.set(id, repo);
    if (fullName) {
      this.repos.set(fullName, repo);
    }

    db.saveRepository(repo);
    return repo;
  }

  getRepo(idOrName) {
    if (this.repos.has(idOrName)) {
      return this.repos.get(idOrName);
    }

    const dbRecord = db.getRepositoryById(idOrName) || db.getRepositoryByFullName(idOrName);
    if (dbRecord) {
      this.repos.set(dbRecord.id, dbRecord);
      if (dbRecord.fullName) {
        this.repos.set(dbRecord.fullName, dbRecord);
      }
      return dbRecord;
    }

    return null;
  }

  deleteRepo(id) {
    const repo = this.getRepo(id);
    if (repo) {
      this.repos.delete(repo.id);
      if (repo.fullName) {
        this.repos.delete(repo.fullName);
      }
    }
    this.repos.delete(id);
    db.deleteRepository(id);
    return true;
  }
}
