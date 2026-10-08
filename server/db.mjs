import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import { mkdir } from 'node:fs/promises'

export async function database({ url, directory = '.data/postgres' } = {}) {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 })
    return {
      query: (sql, params = []) => pool.query(sql, params),
      async transaction(fn) {
        const client = await pool.connect()
        try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result }
        catch (error) { await client.query('ROLLBACK'); throw error }
        finally { client.release() }
      },
      close: () => pool.end(),
    }
  }
  if (directory !== 'memory://') await mkdir(directory, { recursive: true })
  const db = await PGlite.create(directory)
  // Serialize whole transactions. Individual queued statements are not sufficient.
  let pending = Promise.resolve()
  const serialize = fn => {
    const task = pending.then(fn)
    pending = task.catch(() => {})
    return task
  }
  return {
    query: (sql, params = []) => serialize(() => db.query(sql, params)),
    transaction: fn => serialize(() => db.transaction(tx => fn(tx))),
    close: async () => { await pending; await db.close() },
  }
}

export async function migrate(db) {
  await db.transaction(async tx => {
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)`)
    const applied = await tx.query('SELECT version FROM schema_migrations WHERE version = 1')
    if (applied.rows.length) return
    const statements = [
      `CREATE TABLE workspaces (id TEXT PRIMARY KEY, sandbox BOOLEAN NOT NULL, expires_at BIGINT)`,
      `INSERT INTO workspaces VALUES ('live', FALSE, NULL)`,
      `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL CHECK (role IN ('buyer','inspector','admin')), password_hash TEXT, sandbox BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL)`,
      `CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL)`,
      `CREATE TABLE quotes (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), buyer_id TEXT NOT NULL REFERENCES users(id), vin TEXT NOT NULL CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'), items JSONB NOT NULL, total INTEGER NOT NULL CHECK (total >= 0), pricing_version TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL, sandbox BOOLEAN NOT NULL)`,
      `CREATE TABLE orders (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), quote_id TEXT UNIQUE NOT NULL REFERENCES quotes(id), buyer_id TEXT NOT NULL REFERENCES users(id), vin TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('awaiting_confirmation','confirmed','assigned','in_review','published','cancelled')), inspector_id TEXT REFERENCES users(id), assigned_at BIGINT, total INTEGER NOT NULL, items JSONB NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, sandbox BOOLEAN NOT NULL)`,
      `CREATE UNIQUE INDEX one_active_dispatch ON orders(vin, workspace_id) WHERE status IN ('awaiting_confirmation','confirmed','assigned','in_review')`,
      `CREATE TABLE evidence (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), uploader_id TEXT NOT NULL REFERENCES users(id), slot TEXT NOT NULL CHECK (slot IN ('dashboard','pillar','exterior','chassis')), original_hash TEXT NOT NULL, display_hash TEXT NOT NULL, bytes BYTEA NOT NULL, created_at BIGINT NOT NULL)`,
      `CREATE TABLE reports (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), inspector_id TEXT NOT NULL REFERENCES users(id), data JSONB NOT NULL, evidence_ids JSONB NOT NULL, submitted_at BIGINT NOT NULL)`,
      `CREATE TABLE reviews (id TEXT PRIMARY KEY, report_id TEXT UNIQUE NOT NULL REFERENCES reports(id), reviewer_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL CHECK (decision IN ('publish','return')), note TEXT NOT NULL, created_at BIGINT NOT NULL)`,
      `CREATE TABLE findings (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), vin TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('condition','inspection')), outcome TEXT NOT NULL CHECK (outcome IN ('clear','issue','inconclusive')), summary TEXT NOT NULL, limitations TEXT NOT NULL, source TEXT NOT NULL, observed_at BIGINT NOT NULL, recorded_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, report_id TEXT NOT NULL REFERENCES reports(id), sandbox BOOLEAN NOT NULL, UNIQUE(report_id, kind))`,
      `CREATE INDEX findings_vin_kind ON findings(vin, kind, recorded_at DESC)`,
      `CREATE TABLE audit_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, detail TEXT NOT NULL, created_at BIGINT NOT NULL)`,
      `CREATE INDEX audit_order ON audit_events(order_id, created_at)`,
    ]
    for (const sql of statements) await tx.query(sql)
    await tx.query('INSERT INTO schema_migrations VALUES (1, $1)', [Date.now()])
  })
  await db.transaction(async tx => {
    if ((await tx.query('SELECT version FROM schema_migrations WHERE version=2')).rows.length) return
    // Monotonic revision ordering avoids ambiguity when server timestamps are equal.
    await tx.query('ALTER TABLE reports ADD COLUMN revision BIGINT GENERATED ALWAYS AS IDENTITY')
    await tx.query('ALTER TABLE findings ADD COLUMN sequence BIGINT GENERATED ALWAYS AS IDENTITY')
    await tx.query('INSERT INTO schema_migrations VALUES (2,$1)', [Date.now()])
  })
}
