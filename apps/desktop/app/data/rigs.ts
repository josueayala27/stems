import { rigSchema, type Rig } from '@stems/schema'
import { getDatabase, type SqlExecutor } from './db'

/** The rig this machine plays through. Rigs are per machine, so the choice lives in localStorage. */
const CURRENT_KEY = 'stems.rig.current'

export function parseRig(doc: string): Rig | null {
  try {
    const parsed = rigSchema.safeParse(JSON.parse(doc))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function listRigs(): Promise<Rig[]> {
  const db = await getDatabase()
  if (!db) return []
  const rows = await db.select<{ doc: string }[]>('SELECT doc FROM rigs WHERE deleted_at IS NULL ORDER BY updated_at DESC')
  return rows.map((row) => parseRig(row.doc)).filter((rig): rig is Rig => rig !== null)
}

export async function getRig(id: string): Promise<Rig | null> {
  const db = await getDatabase()
  if (!db) return null
  const rows = await db.select<{ doc: string }[]>('SELECT doc FROM rigs WHERE id = $1 AND deleted_at IS NULL', [id])
  return rows[0] ? parseRig(rows[0].doc) : null
}

/** Insert or update a rig. The document is validated before it is written. */
export async function writeRig(db: SqlExecutor, rig: Rig, now: number = Date.now()): Promise<void> {
  const valid = rigSchema.parse(rig)
  await db.execute(
    `INSERT INTO rigs (id, name, doc, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, doc = excluded.doc, updated_at = excluded.updated_at`,
    [valid.id, valid.name, JSON.stringify(valid), now],
  )
}

export async function saveRig(rig: Rig): Promise<void> {
  const db = await getDatabase()
  if (!db) return
  await writeRig(db, rig)
}

export function currentRigId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function setCurrentRigId(id: string): void {
  try {
    window.localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // Storage unavailable: the newest rig is used next time.
  }
}

/** The rig to use: the current one, else the most recently edited. */
export async function loadCurrentRig(): Promise<Rig | null> {
  const id = currentRigId()
  const current = id ? await getRig(id) : null
  return current ?? (await listRigs())[0] ?? null
}
