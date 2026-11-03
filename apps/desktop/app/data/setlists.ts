import { setlistSchema, type Setlist } from '@stems/schema'
import { getDatabase, type SqlExecutor } from './db'

export interface SetlistSummary {
  id: string
  name: string
  songCount: number
  updatedAt: number
}

interface SetlistRow {
  id: string
  name: string
  updated_at: number
  doc: string
}

export function parseSetlist(doc: string): Setlist | null {
  try {
    const parsed = setlistSchema.safeParse(JSON.parse(doc))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function listSetlists(): Promise<SetlistSummary[]> {
  const db = await getDatabase()
  if (!db) return []
  const rows = await db.select<SetlistRow[]>(
    'SELECT id, name, updated_at, doc FROM setlists WHERE deleted_at IS NULL ORDER BY updated_at DESC',
  )
  return rows.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at, songCount: parseSetlist(row.doc)?.items.length ?? 0 }))
}

export async function getSetlist(id: string): Promise<Setlist | null> {
  const db = await getDatabase()
  if (!db) return null
  const rows = await db.select<{ doc: string }[]>('SELECT doc FROM setlists WHERE id = $1 AND deleted_at IS NULL', [id])
  return rows[0] ? parseSetlist(rows[0].doc) : null
}

export async function writeSetlist(db: SqlExecutor, setlist: Setlist, now: number = Date.now()): Promise<void> {
  const valid = setlistSchema.parse(setlist)
  await db.execute(
    `INSERT INTO setlists (id, name, doc, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, doc = excluded.doc, updated_at = excluded.updated_at`,
    [valid.id, valid.name, JSON.stringify(valid), now],
  )
}

export async function saveSetlist(setlist: Setlist): Promise<void> {
  const db = await getDatabase()
  if (!db) throw new Error('Setlists are saved in the desktop app.')
  await writeSetlist(db, setlist)
}

export async function deleteSetlist(id: string, now: number = Date.now()): Promise<void> {
  const db = await getDatabase()
  if (!db) return
  await db.execute('UPDATE setlists SET deleted_at = $1 WHERE id = $2', [now, id])
}

export function newSetlist(name: string, newId: () => string = () => crypto.randomUUID()): Setlist {
  return setlistSchema.parse({ id: newId(), name, items: [] })
}
