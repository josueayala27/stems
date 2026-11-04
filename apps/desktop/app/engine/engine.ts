// Typed bindings for the Rust engine (`stems-engine`, docs/architecture/02-audio-engine.md).
// The engine is the clock: the UI shows `engine://state` and never keeps its own transport time.
import type { RoutingDoc } from '@stems/core'
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
  /** Identifies the song in engine state (`songTag`, `nextTag`). */
  tag: number
  sampleRate: number
  length: number
  tracks: TrackInfo[]
  /** Engine track indexes of the generated click, guide and timecode, after the audio tracks. */
  clickTrack: number
  guideTrack: number
  timecodeTrack: number
}

export type Quantize = 'now' | 'beat' | 'bar' | 'section' | 'end'

export type LiveAction = { type: 'jump'; to: number } | { type: 'vamp' } | { type: 'stop' } | { type: 'endSong' }

export type Transport =
  | { type: 'play' }
  | { type: 'playWithCountIn' }
  | { type: 'stop' }
  | { type: 'seek'; position: number }
  | { type: 'gain'; track: number; gain: number }
  | { type: 'mute'; track: number; muted: boolean }
  | { type: 'solo'; track: number; soloed: boolean }
  /** `to` and engine positions are frames at the device rate. */
  | { type: 'arm'; action: LiveAction; quantize: Quantize }
  | { type: 'cancelArmed' }
  | { type: 'releaseVamp' }
  | { type: 'advance'; play: boolean }
  | { type: 'padGain'; gain: number }
  | { type: 'busGain'; bus: number; gain: number }
  | { type: 'busMute'; bus: number; muted: boolean }
  /** `bus: null` sends the track back to the bus the rig gives its kind. */
  | { type: 'trackBus'; track: number; bus: number | null }

/** The song document as the engine reads it (a subset of `@stems/schema` Song). */
export interface SongDoc {
  sampleRate: number
  bpm: number
  timeSignature: { numerator: number; denominator: number }
  tempoMap: { sample: number; bpm: number; timeSignature: { numerator: number; denominator: number } }[]
  /** `bus` is an index into the rig's buses; `null` plays into the bus the rig gives the kind. */
  tracks: { file: string; kind: 'stem' | 'click' | 'guide'; gain: number; mute: boolean; bus: number | null }[]
  sections: { name: string; startSample: number; endSample: number }[]
  markers: { sample: number; action: 'none' | 'stop' | 'loop' | 'next' }[]
  /** LTC label at the song start, `HH:MM:SS:FF`; `null` uses the timecode options' start. */
  timecodeStart: string | null
  /** MIDI cue events at song samples (marker anchors resolved). */
  events: { sample: number; action: MidiAction }[]
  /** File sample where bar 1 begins; audio before it is skipped. */
  startSample: number
}

/** The MIDI actions of `@stems/schema` cue events, as the engine reads them. Channels are 1–16. */
export type MidiAction =
  | { kind: 'midiProgram'; channel: number; program: number }
  | { kind: 'midiNote'; channel: number; note: number; velocity: number }
  | { kind: 'midiCc'; channel: number; controller: number; value: number }

export interface TransitionDoc {
  kind: 'stop' | 'auto' | 'crossfade'
  preWaitMs: number
  crossfadeMs: number
}

export type ClickSound = 'beep' | 'tick' | 'wood'

/** SMPTE rates, named as Lumen names them. */
export type FrameRate = '23.976' | '24' | '25' | '29.97' | '29.97df' | '30'

export interface TimecodeOptions {
  /** LTC out on the rig's timecode bus. */
  enabled: boolean
  rate: FrameRate
  /** Label at each song start, `HH:MM:SS:FF`. */
  start: string
  /** In a setlist, song n starts at n:00:00:00 instead (UI only; sent as each song's `timecodeStart`). */
  hourPerSong: boolean
  gain: number
}

export interface PerformOptions {
  click: { enabled: boolean; sound: ClickSound; subdivisions: number; countInBars: number; gain: number }
  guide: { enabled: boolean; voices: string | null; gain: number; count: boolean }
  timecode: TimecodeOptions
}

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
  songTag: number
  nextTag: number
  armed: 'none' | 'jump' | 'vamp' | 'stop' | 'endSong'
  /** Song frame where the armed action lands. */
  armedAt: number
  armedTo: number
  vamping: boolean
  vampStart: number
  vampEnd: number
  /** Count-in frames left. */
  countIn: number
  /** Pre-wait frames left before an auto-advance. */
  waiting: number
  crossfading: boolean
  pad: boolean
  xruns: number
  underruns: number
  /** Callback time over buffer time. */
  cpuLoad: number
  /** Peak per track after its fader, linear, 300 ms release. */
  meters: number[]
  /** RMS per track, linear, 300 ms average. */
  rms: number[]
  /** Peak and RMS per bus after its fader. */
  busMeters: number[]
  busRms: number[]
  /** Bus index each track plays into. */
  trackBuses: number[]
  /** Outputs of the open device. */
  deviceChannels: number
  /** Loudest left and right of any bus. */
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
  loadSong: (song: SongDoc) => call<SongInfo>('engine_load_song', { song }),
  prepareNext: (song: SongDoc, transition: TransitionDoc) => call<SongInfo>('engine_prepare_next', { song, transition }),
  clearNext: () => call<void>('engine_clear_next'),
  setOptions: (options: PerformOptions) => call<void>('engine_set_options', { options }),
  setPad: (file: string | null) => call<void>('engine_set_pad', { file }),
  /** MIDI output port names; on macOS the first is the virtual `Stems` source. */
  midiOutputs: () => call<string[]>('midi_outputs'),
  midiInputs: () => call<string[]>('midi_inputs'),
  /** Listen to footswitches and controllers on `port` (`midi://input` events), or stop with `null`. */
  setMidiInput: (port: string | null) => call<void>('midi_set_input', { port }),
  /** Send song cue events to `port`, or nowhere with `null`. */
  setMidiOutput: (port: string | null) => call<void>('midi_set_output', { port }),
  /** The rig's buses and their channels (`routingDoc` in `@stems/core`). */
  setRouting: (routing: RoutingDoc) => call<void>('engine_set_routing', { routing }),
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
