import { songSchema, type Song, type TrackKind } from '@stems/schema'
import type { ImportedSong } from './library'

/** Bus a new track starts on. Routing buses to channels belongs to the rig (M4). */
export const DEFAULT_BUS: Record<TrackKind, string> = { stem: 'FOH', click: 'Click', guide: 'Guide' }
/** Used when analysis finds no tempo. */
export const FALLBACK_BPM = 120

/** A new song document from an import. `newId` is injectable for tests. */
export function songFromImport(imported: ImportedSong, newId: () => string = () => crypto.randomUUID()): Song {
  const bpm = imported.tempo?.bpm ?? FALLBACK_BPM
  return songSchema.parse({
    id: newId(),
    title: imported.title || 'Untitled',
    artist: '',
    bpm,
    key: '',
    timeSignature: { numerator: 4, denominator: 4 },
    durationSamples: imported.durationSamples,
    sampleRate: imported.sampleRate,
    tempoMap: [{ sample: 0, bpm, timeSignature: { numerator: 4, denominator: 4 } }],
    tracks: imported.tracks.map((track) => ({
      id: newId(),
      name: track.name,
      file: track.file,
      hash: track.hash,
      kind: track.kind,
      gain: 1,
      mute: false,
      color: track.color,
      defaultBus: DEFAULT_BUS[track.kind],
    })),
  })
}
