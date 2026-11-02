// Typed bindings for `stems-library` (import, peaks, relink) and native file pickers.
// The webview never reads media: Rust probes, hashes and decodes; the UI gets paths and peaks.
import type { TrackKind } from '@stems/schema'
import { parsePeaks, type Peaks } from '~/audio/peaks'
import { isTauri } from './db'

export type ImportMode = 'copy' | 'reference'
export type BpmSource = 'click' | 'onsets'

export interface ProbedFile {
  path: string
  name: string
  kind: TrackKind
  color: string
  sampleRate: number
  channels: number
  frames: number
  seconds: number
}

export interface Rejected {
  path: string
  reason: string
}

export interface ImportPlan {
  title: string
  files: ProbedFile[]
  rejected: Rejected[]
}

export interface ImportedTrack {
  name: string
  file: string
  hash: string
  kind: TrackKind
  color: string
  sampleRate: number
  channels: number
  frames: number
}

export interface ImportedSong {
  title: string
  sampleRate: number
  durationSamples: number
  tempo: { bpm: number; source: BpmSource } | null
  tracks: ImportedTrack[]
}

export interface Found {
  hash: string
  file: string
}

/** Formats `plan` and `import` accept, for the native file picker. */
export const STEM_EXTENSIONS = ['wav', 'aiff', 'aif', 'flac', 'mp3', 'm4a']

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('The library needs the desktop app.')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export const library = {
  planImport: (paths: string[]) => call<ImportPlan>('library_plan_import', { paths }),
  importSong: (paths: string[], mode: ImportMode) =>
    call<{ song: ImportedSong; rejected: Rejected[] }>('library_import', { paths, mode }),
  peaks: async (hash: string): Promise<Peaks> => parsePeaks(await call<ArrayBuffer>('library_peaks', { hash })),
  filesExist: (files: string[]) => call<boolean[]>('library_files_exist', { files }),
  relink: (missing: { hash: string; file: string }[], folder: string) => call<Found[]>('library_relink', { missing, folder }),
}

/** Native picker. Returns chosen paths, or an empty list when cancelled. */
export async function pickPaths(kind: 'folder' | 'files'): Promise<string[]> {
  if (!isTauri()) return []
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked =
    kind === 'folder'
      ? await open({ directory: true, multiple: false, title: 'Choose a folder of stems' })
      : await open({ multiple: true, title: 'Choose stems', filters: [{ name: 'Audio', extensions: STEM_EXTENSIONS }] })
  if (!picked) return []
  return Array.isArray(picked) ? picked : [picked]
}

/**
 * Paths dropped on the window. The webview's own drop events carry no paths, so this listens to
 * Tauri's. `onHover` reports whether files are over the window. Returns a stop function.
 */
export async function onPathsDropped(onDrop: (paths: string[]) => void, onHover?: (over: boolean) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { getCurrentWebview } = await import('@tauri-apps/api/webview')
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload
    if (payload.type === 'enter' || payload.type === 'over') onHover?.(true)
    else if (payload.type === 'leave') onHover?.(false)
    else if (payload.type === 'drop') {
      onHover?.(false)
      if (payload.paths.length) onDrop(payload.paths)
    }
  })
}
