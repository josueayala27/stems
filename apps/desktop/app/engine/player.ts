// The app's one player: opens the default output on first use, loads a song into the engine and
// mirrors engine state. The engine is the clock; this only sends commands and shows state.
import type { Song } from '@stems/schema'
import { computed, ref, shallowRef } from 'vue'
import { isTauri } from '~/data/db'
import { engine, ENGINE_STATE_EVENT, type EngineState, type OpenedOutput, type Transport } from './engine'

/** Buffer for the default output until the rig picks one (M4). */
export const DEFAULT_BUFFER = 256

/** Commands that apply a song's saved per-track gain and mute after loading. */
export function trackCommands(song: Song): Transport[] {
  return song.tracks.flatMap((track, index): Transport[] => [
    ...(track.gain !== 1 ? [{ type: 'gain', track: index, gain: track.gain } as const] : []),
    ...(track.mute ? [{ type: 'mute', track: index, muted: true } as const] : []),
  ])
}

const state = shallowRef<EngineState | null>(null)
const output = shallowRef<OpenedOutput | null>(null)
const song = shallowRef<Song | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let listening: Promise<void> | null = null

function listenOnce(): Promise<void> {
  if (!listening && isTauri()) {
    listening = import('@tauri-apps/api/event')
      .then(({ listen }) => listen<EngineState>(ENGINE_STATE_EVENT, (event) => (state.value = event.payload)))
      .then(() => undefined)
      .catch((cause) => {
        listening = null
        error.value = `Engine state unavailable: ${cause}`
      })
  }
  return listening ?? Promise.resolve()
}

async function ensureOutput(): Promise<OpenedOutput> {
  if (output.value) return output.value
  output.value = await engine.open({ deviceId: null, sampleRate: null, bufferSize: DEFAULT_BUFFER })
  return output.value
}

async function run(action: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await action()
  } catch (cause) {
    error.value = String(cause)
  }
}

/** Load a song (opening the output if needed). Reloads when the song's files changed. */
async function load(next: Song): Promise<void> {
  if (song.value?.id === next.id && song.value.tracks.every((track, i) => track.file === next.tracks[i]?.file)) return
  loading.value = true
  await run(async () => {
    await listenOnce()
    await ensureOutput()
    await engine.loadSong(next.tracks.map((track) => track.file))
    for (const command of trackCommands(next)) await engine.command(command)
    song.value = next
  })
  loading.value = false
}

const playing = computed(() => state.value?.playing ?? false)
const sampleRate = computed(() => state.value?.sampleRate ?? output.value?.sampleRate ?? 0)
const length = computed(() => state.value?.length ?? 0)
const position = computed(() => state.value?.position ?? 0)

export function usePlayer() {
  void listenOnce()
  return {
    state,
    output,
    song,
    loading,
    error,
    playing,
    sampleRate,
    length,
    position,
    load,
    /** Load if needed, then play. */
    play: async (next?: Song) => {
      if (next) await load(next)
      if (song.value) await run(() => engine.command({ type: 'play' }))
    },
    pause: () => run(() => engine.command({ type: 'stop' })),
    toggle: () => run(() => engine.command({ type: playing.value ? 'stop' : 'play' })),
    /** Stop and return to the start. */
    stop: () =>
      run(async () => {
        await engine.command({ type: 'stop' })
        await engine.command({ type: 'seek', position: 0 })
      }),
    seek: (frames: number) => run(() => engine.command({ type: 'seek', position: Math.max(0, Math.round(frames)) })),
  }
}
