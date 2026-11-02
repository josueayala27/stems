import type Database from '@tauri-apps/plugin-sql'

const DB_PATH = 'sqlite:stems.db'
let database: Promise<Database | null> | null = null

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** The subset of the SQL plugin the migration needs, so tests can pass a fake. */
export interface SqlExecutor {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>
}

/**
 * Idempotent schema: every statement is `IF NOT EXISTS`, so it runs on each open.
 * Each row stores its document as JSON in `doc` (validated by `@stems/schema` on read); the other columns are
 * copies for listing and sorting.
 */
export const MIGRATION: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    doc TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS songs_updated_idx ON songs (updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS setlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    doc TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS setlists_updated_idx ON setlists (updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rigs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    doc TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
]

export async function migrate(db: SqlExecutor): Promise<void> {
  for (const statement of MIGRATION) await db.execute(statement)
}

/** The local database, or null outside Tauri (plain browser dev server). */
export async function getDatabase(): Promise<Database | null> {
  if (!isTauri()) return null
  if (!database) {
    database = (async () => {
      const { default: Sql } = await import('@tauri-apps/plugin-sql')
      const db = await Sql.load(DB_PATH)
      await migrate(db)
      return db
    })().catch((error) => {
      console.error('[stems] database open failed', error)
      database = null
      return null
    })
  }
  return database
}
