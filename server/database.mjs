import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function openDatabase({ url = process.env.DATABASE_URL, directory = process.env.DATA_DIR || '.local/postgres' } = {}) {
  let db;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url });
    db = { query: (sql, args) => pool.query(sql, args), exec: sql => pool.query(sql), close: () => pool.end(), async transaction(fn) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn({ query: (s, p) => client.query(s, p), exec: s => client.query(s) }); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }};
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    if (directory !== 'memory://') await mkdir(resolve(directory), { recursive: true });
    db = new PGlite(directory === 'memory://' ? undefined : directory);
    await db.waitReady;
  }
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of ['001_core.sql', '002_accounts.sql', '003_ai_agent_indexes.sql', '004_ai_provider.sql', '005_study_goal.sql', '006_classroom.sql', '007_classroom_deliveries.sql', '008_deadline_reminders.sql', '009_study_lab.sql', '010_lab_assisted.sql', '011_study_exams.sql', '012_flashcards.sql', '013_operational_guards.sql']) {
    const applied = await db.query('SELECT name FROM schema_migrations WHERE name=$1', [name]);
    if (!applied.rows.length) {
      const sql = await readFile(new URL(`../database/${name}`, import.meta.url), 'utf8');
      await db.transaction(async tx => { await tx.exec(sql); await tx.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]); });
    }
  }
  return db;
}
