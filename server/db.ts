import { mkdir, rename } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'

export interface Query { <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
export interface Database {
  query: Query
  transaction<T>(work: (query: Query) => Promise<T>): Promise<T>
  close(): Promise<void>
}

const schema = `
CREATE TABLE IF NOT EXISTS visitor_profiles (
  visitor_id text PRIMARY KEY,
  context jsonb,
  settings jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  visitor_id text NOT NULL,
  patient_key text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  settings jsonb NOT NULL,
  summary jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS turns (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker text NOT NULL,
  text text NOT NULL,
  seq integer NOT NULL,
  interrupted boolean NOT NULL DEFAULT false,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE turns ADD COLUMN IF NOT EXISTS source_id text;
CREATE UNIQUE INDEX IF NOT EXISTS turns_source_idx ON turns(conversation_id, source_id) WHERE source_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS facts (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  widget text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'reported',
  level text,
  priority text,
  certainty text NOT NULL DEFAULT 'reported',
  source_turn_id uuid,
  source_quote text,
  event_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE facts ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS certainty text NOT NULL DEFAULT 'reported';
CREATE TABLE IF NOT EXISTS widget_states (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  widget text NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  updated_at timestamptz,
  PRIMARY KEY (conversation_id, widget)
);
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  seq bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL,
  type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`

async function postgres(url: string): Promise<Database> {
  const pool = new Pool({ connectionString: url, max: 8, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined })
  const query: Query = async (sql, params) => { const result = await pool.query(sql, params as never[]); return { rows: result.rows } }
  return {
    query,
    transaction: async work => { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(async (sql, params) => { const r = await client.query(sql, params as never[]); return { rows: r.rows } }); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() } },
    close: async () => { await pool.end() },
  }
}

async function local(): Promise<Database> {
  const dir = process.env.DATA_DIR || './data'
  await mkdir(dir, { recursive: true }).catch(() => undefined)

  const open = async () => {
    const instance = new PGlite(dir)
    // Touch the database so a corrupt directory fails here rather than later.
    await instance.query('SELECT 1')
    return instance
  }

  let db: PGlite
  try {
    db = await open()
  } catch {
    // A force-killed process can leave the embedded database unreadable. Move it
    // aside and start clean instead of refusing to boot. Run `npm run db:reset`
    // to do this deliberately.
    const backup = `${dir}.corrupt-${Date.now()}`
    await rename(dir, backup).catch(() => undefined)
    await mkdir(dir, { recursive: true }).catch(() => undefined)
    db = await open()
    console.warn(`The local database was unreadable. It has been moved to ${backup} and a fresh one created.`)
  }

  const query: Query = async (sql, params) => { const result = await db.query(sql, params); return { rows: result.rows as never[] } }
  return {
    query,
    transaction: async work => db.transaction(async tx => work(async (sql, params) => { const r = await tx.query(sql, params); return { rows: r.rows as never[] } })),
    close: async () => { await db.close() },
  }
}

export async function openDatabase(): Promise<Database> {
  const database = process.env.DATABASE_URL ? await postgres(process.env.DATABASE_URL) : await local()
  // PGlite rejects multiple statements in one prepared query, so run them one by one.
  for (const statement of schema.split(';').map(part => part.trim()).filter(Boolean)) await database.query(statement)
  return database
}
