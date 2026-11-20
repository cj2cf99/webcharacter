import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// 仅用于测试：运行真实SQLite SQL，提供Worker所用的D1方法形态。
export function openTestDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const DB = {
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (args = []) => ({
        bind(...values) { return bound(values); },
        async first(column) {
          const row = statement.get(...args);
          return row ? (column ? row[column] : { ...row }) : null;
        },
        async all() { return { success: true, results: statement.all(...args).map(row => ({ ...row })) }; },
        runSync() {
          const result = statement.run(...args);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
        async run() { return this.runSync(); },
      });
      return bound();
    },
  };
  return { DB, sqlite, close: () => sqlite.close() };
}

export function initializeDatabase(sqlite) {
  sqlite.exec(readFileSync(new URL('../migrations/013-ai-route-cooldown.sql', import.meta.url),'utf8'));
  for (const path of ['../migrations/001-task-units.sql', '../migrations/002-executions.sql', '../migrations/003-task-activity.sql', '../seeds/tasklist.sql']) {
    sqlite.exec(readFileSync(new URL(path, import.meta.url), 'utf8'));
  }
  // 生产004是单次ALTER；重复测试初始化只在旧结构缺列时应用真实迁移。
  if (!sqlite.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'deadline_at')) {
    sqlite.exec(readFileSync(new URL('../migrations/004-task-deadline.sql', import.meta.url), 'utf8'));
  }
  sqlite.exec(readFileSync(new URL('../migrations/005-task-recoveries.sql', import.meta.url), 'utf8'));
  if(!sqlite.prepare('PRAGMA table_info(tasks)').all().some(column=>column.name==='chain_node_id')) {
    sqlite.exec(readFileSync(new URL('../migrations/006-chains.sql',import.meta.url),'utf8'));
  }
  if (!sqlite.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'submission_id')) {
    sqlite.exec(readFileSync(new URL('../migrations/007-task-submissions.sql', import.meta.url), 'utf8'));
  }
  if (!sqlite.prepare('PRAGMA table_info(chains)').all().some(column => column.name === 'submission_fingerprint')) {
    sqlite.exec(readFileSync(new URL('../migrations/009-chain-submissions.sql', import.meta.url), 'utf8'));
  }
  const chainSql = sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name='chain_nodes'").get().sql;
  if (chainSql.includes('position BETWEEN 0 AND 4')) {
    const migration = readFileSync(new URL('../migrations/010-temporary-chain-positions.sql', import.meta.url), 'utf8');
    sqlite.exec(`BEGIN;\n${migration}\nCOMMIT;`);
  }
  if (!sqlite.prepare('PRAGMA table_info(chains)').all().some(column => column.name === 'temporary_registration')) {
    sqlite.exec(readFileSync(new URL('../migrations/011-temporary-registration.sql', import.meta.url), 'utf8'));
  }
  if (!sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='registration_ai_preference'").get()) {
    sqlite.exec(readFileSync(new URL('../migrations/012-registration-ai-preference.sql', import.meta.url), 'utf8'));
  }
}
