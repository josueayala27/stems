import { songSchema, type Song } from '@stems/schema'
import { getDatabase } from './db'

export interface SongSummary {
  id: string
  title: string
  artist: string
  updatedAt: number
}

interface SongRow {
  id: string
  title: string
  artist: string
  updated_at: number
}

export async function listSongs(): Promise<SongSummary[]> {
  const db = await getDatabase()
  if (!db) return []
  const rows = await db.select<SongRow[]>(
    'SELECT id, title, artist, updated_at FROM songs WHERE deleted_at IS NULL ORDER BY updated_at DESC',
  )
  return rows.map((row) => ({ id: row.id, title: row.title, artist: row.artist, updatedAt: row.updated_at }))
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
