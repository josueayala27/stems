import { songSchema, type Song } from '@stems/schema'
import { getDatabase, type SqlExecutor } from './db'

export interface SongSummary {
  id: string
  title: string
  artist: string
  updatedAt: number
  bpm: number | null
  key: string
  durationSeconds: number
  trackCount: number
  /** Media paths, to check for missing files. */
  files: string[]
}

interface SongRow {
  id: string
  title: string
  artist: string
  updated_at: number
  doc: string
}

/** A list row from a database row. A document that fails validation still lists, with blanks. */
export function summarize(row: SongRow): SongSummary {
  let song: Song | null = null
  try {
    const parsed = songSchema.safeParse(JSON.parse(row.doc))
    if (parsed.success) song = parsed.data
  } catch {
    // Unreadable JSON: list the row from its columns.
  }
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    updatedAt: row.updated_at,
    bpm: song?.bpm ?? null,
    key: song?.key ?? '',
    durationSeconds: song && song.sampleRate > 0 ? song.durationSamples / song.sampleRate : 0,
    trackCount: song?.tracks.length ?? 0,
    files: song?.tracks.map((track) => track.file) ?? [],
  }
}

export async function listSongs(): Promise<SongSummary[]> {
  const db = await getDatabase()
  if (!db) return []
  const rows = await db.select<SongRow[]>(
    'SELECT id, title, artist, updated_at, doc FROM songs WHERE deleted_at IS NULL ORDER BY updated_at DESC',
  )
  return rows.map(summarize)
}

export async function getSong(id: string): Promise<Song | null> {
  const db = await getDatabase()
  if (!db) return null
  const rows = await db.select<{ doc: string }[]>('SELECT doc FROM songs WHERE id = $1 AND deleted_at IS NULL', [id])
  const row = rows[0]
  if (!row) return null
  const parsed = songSchema.safeParse(JSON.parse(row.doc))
  return parsed.success ? parsed.data : null
}

/** Insert or update a song. The document is validated before it is written. */
export async function writeSong(db: SqlExecutor, song: Song, now: number = Date.now()): Promise<void> {
  const valid = songSchema.parse(song)
  await db.execute(
    `INSERT INTO songs (id, title, artist, doc, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, artist = excluded.artist, doc = excluded.doc, updated_at = excluded.updated_at`,
    [valid.id, valid.title, valid.artist, JSON.stringify(valid), now],
  )
}

export async function saveSong(song: Song): Promise<void> {
  const db = await getDatabase()
  if (!db) throw new Error('Songs are saved in the desktop app.')
  await writeSong(db, song)
}
