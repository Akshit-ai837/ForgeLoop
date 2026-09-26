import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../forgeloop.db');

export class Database {
  constructor() {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        repository TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        final_result TEXT,
        verification_status TEXT,
        error TEXT,
        duration_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS run_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        stage TEXT,
        message TEXT NOT NULL,
        type TEXT,
        meta_json TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS run_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        decision TEXT,
        relevance_score INTEGER,
        reasons_json TEXT,
        token_count INTEGER,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS run_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        change_type TEXT,
        added INTEGER DEFAULT 0,
        removed INTEGER DEFAULT 0,
        diff_text TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        command TEXT,
        status TEXT,
        passed_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        output TEXT,
        duration_ms INTEGER,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS recovery_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        failure_text TEXT,
        action TEXT,
        result TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS token_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL UNIQUE,
        usage_type TEXT,
        task_tokens INTEGER DEFAULT 0,
        context_tokens INTEGER DEFAULT 0,
        recovery_tokens INTEGER DEFAULT 0,
        verification_tokens INTEGER DEFAULT 0,
        generation_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        files_searched INTEGER DEFAULT 0,
        files_selected INTEGER DEFAULT 0,
        files_avoided INTEGER DEFAULT 0,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        full_name TEXT,
        path TEXT,
        local_workspace TEXT,
        url TEXT,
        clone_url TEXT,
        owner TEXT,
        source TEXT DEFAULT 'local',
        created_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec('ALTER TABLE repositories ADD COLUMN path TEXT');
    } catch (_) {}
  }

  createRun({ id, task, repository, status = 'RUNNING', currentStage = 'IDLE', createdAt = new Date().toISOString() }) {
    const stmt = this.db.prepare(`
      INSERT INTO runs (id, task, repository, status, current_stage, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, task, repository, status, currentStage, createdAt);
    return this.getRunById(id);
  }

  updateRunStage(id, stage, status = null) {
    if (status) {
      const stmt = this.db.prepare('UPDATE runs SET current_stage = ?, status = ? WHERE id = ?');
      stmt.run(stage, status, id);
    } else {
      const stmt = this.db.prepare('UPDATE runs SET current_stage = ? WHERE id = ?');
      stmt.run(stage, id);
    }
  }

  completeRun(id, {
    status = 'COMPLETED',
    currentStage = 'COMPLETED',
    completedAt = new Date().toISOString(),
    finalResult = null,
    verificationStatus = null,
    error = null,
    durationMs = null
  } = {}) {
    const stmt = this.db.prepare(`
      UPDATE runs 
      SET status = ?, current_stage = ?, completed_at = ?, final_result = ?, verification_status = ?, error = ?, duration_ms = ?
      WHERE id = ?
    `);
    stmt.run(
      status ?? 'COMPLETED',
      currentStage ?? 'COMPLETED',
      completedAt ?? new Date().toISOString(),
      finalResult ?? null,
      verificationStatus ?? null,
      error ?? null,
      durationMs ?? null,
      id
    );
    return this.getRunById(id);
  }

  addLog(runId, { timestamp = new Date().toISOString(), stage = '', message, type = 'info', meta = null }) {
    const stmt = this.db.prepare(`
      INSERT INTO run_logs (run_id, timestamp, stage, message, type, meta_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      runId,
      timestamp ?? new Date().toISOString(),
      stage ?? '',
      message ?? '',
      type ?? 'info',
      meta ? JSON.stringify(meta) : null
    );
  }

  saveContext(runId, scoredFiles = []) {
    const stmt = this.db.prepare(`
      INSERT INTO run_context (run_id, file_path, decision, relevance_score, reasons_json, token_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const f of scoredFiles) {
      stmt.run(runId, f.path || f.file, f.decision || null, f.relevanceScore || 0, f.reasons ? JSON.stringify(f.reasons) : null, f.tokens || 0);
    }
  }

  saveFiles(runId, fileDiffs = []) {
    const stmt = this.db.prepare(`
      INSERT INTO run_files (run_id, file_path, change_type, added, removed, diff_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const f of fileDiffs) {
      stmt.run(runId, f.file, 'modified', f.added || 0, f.removed || 0, f.diff || null);
    }
  }

  saveTests(runId, tests = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO test_results (run_id, command, status, passed_count, failed_count, total_count, output, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      runId,
      tests.command || 'npm test',
      tests.passed ? 'PASS' : 'FAIL',
      tests.passedCount || 0,
      tests.failedCount || 0,
      tests.totalCount || 0,
      tests.rawOutput || '',
      tests.durationMs ?? null
    );
  }

  saveRecoveryAttempt(runId, { attemptNumber, failureText, action, result }) {
    const stmt = this.db.prepare(`
      INSERT INTO recovery_attempts (run_id, attempt_number, failure_text, action, result)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      runId,
      attemptNumber ?? 1,
      failureText ?? null,
      typeof action === 'object' ? JSON.stringify(action) : (action ?? null),
      typeof result === 'object' ? JSON.stringify(result) : (result ?? null)
    );
  }

  saveMetrics(runId, metrics = {}) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO token_metrics (
        run_id, usage_type, task_tokens, context_tokens, recovery_tokens,
        verification_tokens, generation_tokens, total_tokens,
        files_searched, files_selected, files_avoided
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      runId,
      metrics.usageType || 'estimate',
      metrics.taskTokens || 0,
      metrics.contextTokens || 0,
      metrics.recoveryTokens || 0,
      metrics.verificationTokens || 0,
      metrics.generationTokens || 0,
      metrics.totalTokens || 0,
      metrics.filesSearched || 0,
      metrics.filesRead || metrics.filesSelected || 0,
      metrics.filesAvoided || 0
    );
  }

  getRunById(id) {
    const runStmt = this.db.prepare('SELECT * FROM runs WHERE id = ?');
    const run = runStmt.get(id);
    if (!run) return null;

    const logsStmt = this.db.prepare('SELECT * FROM run_logs WHERE run_id = ? ORDER BY id ASC');
    const logs = logsStmt.all(id).map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      stage: l.stage,
      message: l.message,
      type: l.type,
      meta: l.meta_json ? JSON.parse(l.meta_json) : null
    }));

    const contextStmt = this.db.prepare('SELECT * FROM run_context WHERE run_id = ?');
    const contextFiles = contextStmt.all(id).map(c => ({
      path: c.file_path,
      decision: c.decision,
      relevanceScore: c.relevance_score,
      reasons: c.reasons_json ? JSON.parse(c.reasons_json) : [],
      tokens: c.token_count
    }));

    const filesStmt = this.db.prepare('SELECT * FROM run_files WHERE run_id = ?');
    const fileDiffs = filesStmt.all(id).map(f => ({
      file: f.file_path,
      changeType: f.change_type,
      added: f.added,
      removed: f.removed,
      diff: f.diff_text
    }));

    const testsStmt = this.db.prepare('SELECT * FROM test_results WHERE run_id = ? ORDER BY id DESC LIMIT 1');
    const testResult = testsStmt.get(id);

    const metricsStmt = this.db.prepare('SELECT * FROM token_metrics WHERE run_id = ?');
    const metrics = metricsStmt.get(id);

    const recoveryStmt = this.db.prepare('SELECT * FROM recovery_attempts WHERE run_id = ? ORDER BY attempt_number ASC');
    const recoveryAttempts = recoveryStmt.all(id);

    return {
      id: run.id,
      task: run.task,
      repository: run.repository,
      repoId: run.repository,
      status: run.status,
      currentStage: run.current_stage,
      state: run.status,
      createdAt: run.created_at,
      startTime: run.created_at,
      completedAt: run.completed_at,
      endTime: run.completed_at,
      finalResult: run.final_result,
      verificationStatus: run.verification_status,
      verification: run.verification_status ? {
        verified: run.verification_status === 'TASK_VERIFIED',
        status: run.verification_status,
        summary: run.final_result,
        evidence: {
          tests: testResult ? {
            passed: testResult.status === 'PASS',
            passedCount: testResult.passed_count,
            failedCount: testResult.failed_count,
            totalCount: testResult.total_count,
            command: testResult.command,
            rawOutput: testResult.output
          } : null,
          gitDiff: {
            totalFilesChanged: fileDiffs.length,
            fileDiffs
          }
        }
      } : null,
      error: run.error,
      durationMs: run.duration_ms,
      logs,
      contextFiles,
      rankedContext: contextFiles.length > 0 ? { scoredFiles: contextFiles } : null,
      filesChanged: fileDiffs.map(f => f.file),
      diffData: {
        totalFilesChanged: fileDiffs.length,
        fileDiffs,
        rawDiff: fileDiffs.map(f => f.diff).join('\n')
      },
      tests: testResult ? {
        passed: testResult.status === 'PASS',
        passedCount: testResult.passed_count,
        failedCount: testResult.failed_count,
        totalCount: testResult.total_count,
        command: testResult.command,
        rawOutput: testResult.output
      } : null,
      recoveryAttempts,
      tokenMetrics: metrics ? {
        usageType: metrics.usage_type,
        taskTokens: metrics.task_tokens,
        contextTokens: metrics.context_tokens,
        recoveryTokens: metrics.recovery_tokens,
        verificationTokens: metrics.verification_tokens,
        generationTokens: metrics.generation_tokens,
        totalTokens: metrics.total_tokens,
        filesSearched: metrics.files_searched,
        filesRead: metrics.files_selected,
        filesAvoided: metrics.files_avoided
      } : null
    };
  }

  saveRepository({ id, name, fullName = null, path: repoPath, url = null, source = 'local', createdAt = new Date().toISOString() }) {
    try {
      this.db.exec('ALTER TABLE repositories ADD COLUMN path TEXT');
    } catch (_) {}

    const full = fullName || name;
    const owner = full.includes('/') ? full.split('/')[0] : 'local';
    const finalUrl = url || `https://github.com/${full}`;
    const cloneUrl = finalUrl.endsWith('.git') ? finalUrl : `${finalUrl}.git`;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO repositories (id, name, full_name, path, local_workspace, url, clone_url, owner, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, full, repoPath, repoPath, finalUrl, cloneUrl, owner, source, createdAt, createdAt);
    return this.getRepositoryById(id);
  }

  getRepositoryById(id) {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      fullName: row.full_name,
      path: row.path || row.local_workspace,
      url: row.url,
      source: row.source,
      createdAt: row.created_at
    };
  }

  getRepositoryByFullName(fullName) {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE full_name = ?');
    const row = stmt.get(fullName);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      fullName: row.full_name,
      path: row.path || row.local_workspace,
      url: row.url,
      source: row.source,
      createdAt: row.created_at
    };
  }

  deleteRepository(id) {
    const stmt = this.db.prepare('DELETE FROM repositories WHERE id = ?');
    stmt.run(id);
  }

  listRepositories() {
    try {
      const stmt = this.db.prepare('SELECT * FROM repositories ORDER BY created_at DESC');
      const rows = stmt.all();
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        fullName: row.full_name,
        path: row.path || row.local_workspace,
        url: row.url,
        cloneUrl: row.clone_url,
        owner: row.owner,
        source: row.source,
        createdAt: row.created_at
      }));
    } catch (_) {
      return [];
    }
  }

  getAllRuns(limit = 100) {
    const stmt = this.db.prepare('SELECT id FROM runs ORDER BY datetime(created_at) DESC LIMIT ?');
    const runIds = stmt.all(limit);
    return runIds.map(row => this.getRunById(row.id));
  }

  getDashboardStats() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM runs');
    const completedStmt = this.db.prepare('SELECT COUNT(*) as count FROM runs WHERE completed_at IS NOT NULL');
    const verifiedStmt = this.db.prepare("SELECT COUNT(*) as count FROM runs WHERE verification_status = 'TASK_VERIFIED'");
    const tokensStmt = this.db.prepare('SELECT SUM(total_tokens) as total FROM token_metrics');

    const totalRuns = totalStmt.get().count;
    const completedRuns = completedStmt.get().count;
    const verifiedRuns = verifiedStmt.get().count;
    const tokensUsed = tokensStmt.get().total || 0;

    return {
      totalRuns,
      completedRuns,
      verifiedRuns,
      tokensUsed
    };
  }
}

export const db = new Database();
