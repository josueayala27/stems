// Typed bindings for the Rust engine (`stems-engine`, docs/architecture/02-audio-engine.md).
// The engine is the clock: the UI shows `engine://state` and never keeps its own transport time.
import { isTauri } from '~/data/db'

export interface DeviceInfo {
  id: string
  name: string
  isDefault: boolean
  channels: number
  sampleRates: number[]
  defaultSampleRate: number | null
  minBuffer: number | null
  maxBuffer: number | null
}

export interface OutputConfig {
  /** `null` is the system default output. */
  deviceId: string | null
  /** `null` is the device's default rate. */
  sampleRate: number | null
  /** Frames per callback, 64–1024. */
  bufferSize: number
}

export interface OpenedOutput {
  deviceId: string
  name: string
  sampleRate: number
  bufferSize: number
  channels: number
}

export interface TrackInfo {
  path: string
  fileSampleRate: number
  channels: number
  /** Frames at the device rate. */
  frames: number
}

export interface SongInfo {
  sampleRate: number
  length: number
  tracks: TrackInfo[]
}

export type Transport =
  | { type: 'play' }
  | { type: 'stop' }
  | { type: 'seek'; position: number }
  | { type: 'gain'; track: number; gain: number }
  | { type: 'mute'; track: number; muted: boolean }
  | { type: 'solo'; track: number; soloed: boolean }

/** The `engine://state` payload, about 60 times a second. */
export interface EngineState {
  sampleRate: number
  /** Frames rendered since the engine started; scheduled commands use this clock. */
  clock: number
  /** Play head in song frames. */
  position: number
  length: number
  loaded: boolean
  playing: boolean
  xruns: number
  underruns: number
  /** Callback time over buffer time. */
  cpuLoad: number
  /** Peak per track, linear. */
  meters: number[]
  master: [number, number]
}

export const ENGINE_STATE_EVENT = 'engine://state'

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('The audio engine needs the desktop app.')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export const engine = {
  devices: () => call<DeviceInfo[]>('engine_devices'),
  open: (config: OutputConfig) => call<OpenedOutput>('engine_open', { config }),
  close: () => call<void>('engine_close'),
  loadSong: (paths: string[]) => call<SongInfo>('engine_load_song', { paths }),
  /** Run a transport command now, or at `at` (a frame of the engine clock). */
  command: (command: Transport, at?: number) => call<void>('engine_command', { command, at: at ?? null }),
}

/** Seconds of the play head, for display. */
export function positionSeconds(state: Pick<EngineState, 'position' | 'sampleRate'>): number {
  return state.sampleRate > 0 ? state.position / state.sampleRate : 0
}

/** `m:ss.t` for a frame count. */
export function formatFrames(frames: number, sampleRate: number): string {
  const tenths = sampleRate > 0 ? Math.floor((frames / sampleRate) * 10) : 0
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}
