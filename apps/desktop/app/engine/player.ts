// The app's one player. It opens the default output on first use, loads songs or a setlist into
// the engine, keeps the next setlist song prepared, follows the engine as it advances, and sends
// live actions. The engine is the clock: this only sends commands and mirrors engine state.
import type { Setlist, Song } from '@stems/schema'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { isTauri } from '~/data/db'
import { engine, ENGINE_STATE_EVENT, type EngineState, type OpenedOutput, type Quantize, type Transport } from './engine'
import { onOptionsChange, usePerformOptions } from './options'
import { padAt, songDoc, toEngine, transitionDoc } from './songDoc'

/** Buffer for the default output until the rig picks one (M4). */
export const DEFAULT_BUFFER = 256

export interface Span {
  name: string
  start: number
  end: number
}

/** Sections of `song` in engine frames, sorted. */
export function engineSections(song: Song, engineRate: number): Span[] {
  return [...song.sections]
    .sort((a, b) => a.startSample - b.startSample)
    .map((section) => ({
      name: section.name,
      start: toEngine(section.startSample, song.sampleRate, engineRate),
      end: toEngine(section.endSample, song.sampleRate, engineRate),
    }))
}

/** Index of the section under `position`, or -1. */
export function sectionIndexAt(sections: readonly Span[], position: number): number {
  return sections.findIndex((section) => section.start <= position && position < section.end)
}

/** The section to jump to for "skip next section": the one after the next. */
export function skipTarget(sections: readonly Span[], position: number): Span | null {
  const current = sectionIndexAt(sections, position)
  const next = current >= 0 ? current + 2 : sections.findIndex((section) => section.start > position) + 1
  return next > 0 ? (sections[next] ?? null) : null
}

const state = shallowRef<EngineState | null>(null)
/** `performance.now()` when `state` arrived, for play-head interpolation. */
const stateAt = ref(0)
const output = shallowRef<OpenedOutput | null>(null)
const setlist = shallowRef<Setlist | null>(null)
const songs = shallowRef<Song[]>([])
const index = ref(-1)
const nextIndex = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const quantize = ref<Quantize>('bar')
const locked = ref(false)
const muted = ref<boolean[]>([])
const soloed = ref<boolean[]>([])
/** Engine song tag → position in `songs`. */
const tags = new Map<number, number>()
let lastTag = 0
let currentPad: string | null = null
let listening: Promise<void> | null = null

const song = computed(() => songs.value[index.value] ?? null)
const nextSong = computed(() => (nextIndex.value === null ? null : (songs.value[nextIndex.value] ?? null)))
const sampleRate = computed(() => state.value?.sampleRate ?? output.value?.sampleRate ?? 0)
const playing = computed(() => state.value?.playing ?? false)
const length = computed(() => state.value?.length ?? 0)
const position = computed(() => state.value?.position ?? 0)
const sections = computed(() => (song.value ? engineSections(song.value, sampleRate.value) : []))
const sectionIndex = computed(() => sectionIndexAt(sections.value, position.value))

async function run(action: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await action()
  } catch (cause) {
    error.value = String(cause)
  }
}

function resetTrackToggles(target: Song | null) {
  muted.value = target?.tracks.map((track) => track.mute) ?? []
  soloed.value = target?.tracks.map(() => false) ?? []
}

async function applyPad(at: number) {
  const list = setlist.value
  if (!list) return
  const pad = padAt(list, at)
  if (pad === currentPad) return
  currentPad = pad
  await engine.setPad(pad)
}

async function prepareFollowing() {
  const list = setlist.value
  const following = index.value + 1
  const item = list?.items[following]
  const target = songs.value[following]
  if (list && item && target) {
    const info = await engine.prepareNext(songDoc(target), transitionDoc(item))
    tags.set(info.tag, following)
    nextIndex.value = following
  } else {
    await engine.clearNext()
    nextIndex.value = null
  }
}

/** The engine moved to another song on its own (auto or crossfade transition). */
function followEngine(tag: number) {
  const found = tags.get(tag)
  if (found === undefined || found === index.value) return
  index.value = found
  resetTrackToggles(song.value)
  void run(async () => {
    await prepareFollowing()
    await applyPad(found)
  })
}

function listenOnce(): Promise<void> {
  if (!listening && isTauri()) {
    listening = import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<EngineState>(ENGINE_STATE_EVENT, (event) => {
          state.value = event.payload
          stateAt.value = performance.now()
          if (event.payload.songTag !== lastTag) {
            lastTag = event.payload.songTag
            followEngine(lastTag)
          }
        }),
      )
      .then(() => {
        onOptionsChange((options) => void engine.setOptions(options).catch(() => {}))
      })
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
  const options = usePerformOptions()
  await engine.setOptions(structuredClone({ click: { ...options.click }, guide: { ...options.guide } }))
  return output.value
}

/** Load the song at `at` in the queue as current, and prepare the one after it. */
async function loadAt(at: number): Promise<void> {
  const target = songs.value[at]
  if (!target) return
  loading.value = true
  await run(async () => {
    await listenOnce()
    await ensureOutput()
    const info = await engine.loadSong(songDoc(target))
    tags.set(info.tag, at)
    lastTag = info.tag
    index.value = at
    resetTrackToggles(target)
    await prepareFollowing()
    await applyPad(at)
  })
  loading.value = false
}

const send = (command: Transport) => run(() => engine.command(command))

function startPlaying() {
  const options = usePerformOptions()
  const fromTop = position.value === 0 && options.click.countInBars > 0
  return send({ type: fromTop ? 'playWithCountIn' : 'play' })
}

export function usePlayer() {
  void listenOnce()
  return {
    state,
    stateAt,
    output,
    setlist,
    songs,
    index,
    nextIndex,
    song,
    nextSong,
    loading,
    error,
    playing,
    sampleRate,
    length,
    position,
    sections,
    sectionIndex,
    quantize,
    locked,
    muted,
    soloed,

    /** Play one song on its own (no setlist). */
    play: async (single?: Song) => {
      if (single && (song.value?.id !== single.id || setlist.value)) {
        setlist.value = null
        songs.value = [single]
        await loadAt(0)
      }
      if (song.value) await startPlaying()
    },
    /** Load a setlist (its songs in order) and cue the song at `at`. */
    loadSetlist: async (list: Setlist, ordered: Song[], at = 0) => {
      setlist.value = list
      songs.value = ordered
      currentPad = null
      await loadAt(at)
    },
    goTo: (at: number) => loadAt(at),
    /** A song was edited and saved: reload it in the engine if it is loaded and not playing. */
    updateSong: async (updated: Song): Promise<boolean> => {
      const at = songs.value.findIndex((entry) => entry.id === updated.id)
      if (at < 0) return true
      songs.value = songs.value.map((entry, i) => (i === at ? updated : entry))
      if (at === index.value) {
        if (playing.value) return false
        await loadAt(at)
      } else if (at === nextIndex.value) {
        await run(prepareFollowing)
      }
      return true
    },
    toggle: () => (playing.value ? send({ type: 'stop' }) : startPlaying()),
    pause: () => send({ type: 'stop' }),
    /** Stop and return to the start. */
    stop: () =>
      run(async () => {
        await engine.command({ type: 'stop' })
        await engine.command({ type: 'seek', position: 0 })
      }),
    seek: (frames: number) => send({ type: 'seek', position: Math.max(0, Math.round(frames)) }),
    /** Jump to section `at` on the quantize boundary. */
    jumpToSection: (at: number) => {
      const target = sections.value[at]
      if (!target) return Promise.resolve()
      return playing.value
        ? send({ type: 'arm', action: { type: 'jump', to: target.start }, quantize: quantize.value })
        : send({ type: 'seek', position: target.start })
    },
    /** Loop the section under the play head until `releaseVamp`. */
    vamp: () => send({ type: 'arm', action: { type: 'vamp' }, quantize: 'now' }),
    releaseVamp: () => send({ type: 'releaseVamp' }),
    toggleVamp: () => send(state.value?.vamping ? { type: 'releaseVamp' } : { type: 'arm', action: { type: 'vamp' }, quantize: 'now' }),
    stopAtSectionEnd: () => send({ type: 'arm', action: { type: 'stop' }, quantize: 'section' }),
    skipNextSection: () => {
      const target = skipTarget(sections.value, position.value)
      return target ? send({ type: 'arm', action: { type: 'jump', to: target.start }, quantize: 'section' }) : Promise.resolve()
    },
    cancelArmed: () => send({ type: 'cancelArmed' }),
    /** Go to the prepared next song now, playing if this one is. */
    nextSongNow: () => (nextIndex.value === null ? Promise.resolve() : send({ type: 'advance', play: playing.value })),
    setMute: (track: number, value: boolean) => {
      muted.value = muted.value.map((m, i) => (i === track ? value : m))
      return send({ type: 'mute', track, muted: value })
    },
    setSolo: (track: number, value: boolean) => {
      soloed.value = soloed.value.map((s, i) => (i === track ? value : s))
      return send({ type: 'solo', track, soloed: value })
    },
  }
}

/** The play head in engine frames, interpolated between state events while playing. */
export function useSmoothPosition() {
  const smooth = ref(0)
  let frame = 0
  const tick = () => {
    const current = state.value
    if (current) {
      const elapsed = current.playing && current.countIn === 0 ? ((performance.now() - stateAt.value) / 1000) * current.sampleRate : 0
      // Cap at one state interval ahead so a stalled engine never runs the play head away.
      const ahead = Math.min(elapsed, current.sampleRate / 20)
      smooth.value = Math.min(current.length, current.position + ahead)
    }
    frame = requestAnimationFrame(tick)
  }
  if (typeof requestAnimationFrame !== 'undefined') frame = requestAnimationFrame(tick)
  onScopeDispose(() => cancelAnimationFrame(frame))
  return smooth
}
