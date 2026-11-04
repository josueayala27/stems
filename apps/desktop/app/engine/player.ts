// The app's one player. It opens the default output on first use, loads songs or a setlist into
// the engine, keeps the next setlist song prepared, follows the engine as it advances, and sends
// live actions. The engine is the clock: this only sends commands and mirrors engine state.
import { busIndex, defaultRig, routingDoc } from '@stems/core'
import type { Rig, Setlist, Song } from '@stems/schema'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { isTauri } from '~/data/db'
import { listRigs, loadCurrentRig, saveRig, setCurrentRigId } from '~/data/rigs'
import { saveSong } from '~/data/songs'
import {
  engine,
  ENGINE_STATE_EVENT,
  type DeviceInfo,
  type EngineState,
  type OpenedOutput,
  type OutputConfig,
  type Quantize,
  type Transport,
} from './engine'
import { onOptionsChange, snapshotOptions, songHour, usePerformOptions } from './options'
import { padAt, songDoc, toEngine, transitionDoc } from './songDoc'

/** Buffer for the default output before a rig exists. */
export const DEFAULT_BUFFER = 256
/** Fader moves are saved this long after the last one. */
const SAVE_DELAY_MS = 400

export function outputConfig(rig: Rig): OutputConfig {
  return { deviceId: rig.deviceId, sampleRate: rig.sampleRate, bufferSize: rig.bufferSize }
}

/** True when the device, rate or buffer differ, so the output must reopen. */
export function deviceChanged(previous: Rig | null, next: Rig): boolean {
  return !previous || previous.deviceId !== next.deviceId || previous.sampleRate !== next.sampleRate || previous.bufferSize !== next.bufferSize
}

/** True when bus names or their order differ, so track bus indexes must be sent again. */
export function busesChanged(previous: Rig | null, next: Rig): boolean {
  if (!previous || previous.buses.length !== next.buses.length) return true
  return previous.buses.some((bus, index) => bus.name !== next.buses[index]?.name)
}

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

/** Engine state for Vue: replaced when anything but the clock moves, and at most 15 times a second otherwise. */
const state = shallowRef<EngineState | null>(null)
/** The newest state, not reactive: the play head reads it every animation frame. */
let latest: EngineState | null = null
/** `performance.now()` when `latest` arrived. */
let latestAt = 0
let lastPush = 0
/** Re-render budget for the clock-only fields (position, meters, CPU). */
const PUSH_MS = 66
/** Fields that change every callback; anything else changing is pushed at once. */
const FAST_FIELDS = new Set<keyof EngineState>(['position', 'clock', 'meters', 'master', 'cpuLoad', 'countIn', 'waiting'])

/** True when a field other than the fast ones changed. */
export function slowFieldsChanged(previous: EngineState | null, next: EngineState): boolean {
  if (!previous) return true
  for (const key of Object.keys(next) as (keyof EngineState)[]) {
    if (!FAST_FIELDS.has(key) && previous[key] !== next[key]) return true
  }
  return false
}
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
const rig = shallowRef<Rig | null>(null)
const rigs = shallowRef<Rig[]>([])
const devices = shallowRef<DeviceInfo[]>([])
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Run `save` once, `SAVE_DELAY_MS` after the last call with this key. */
function saveLater(key: string, save: () => Promise<void>) {
  clearTimeout(saveTimers.get(key))
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key)
      save().catch((cause) => (error.value = `Could not save: ${cause}`))
    }, SAVE_DELAY_MS),
  )
}

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
    const info = await engine.prepareNext(songDoc(target, rig.value, timecodeStart(following)), transitionDoc(item))
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
          const now = performance.now()
          latest = event.payload
          latestAt = now
          if (slowFieldsChanged(state.value, event.payload) || now - lastPush >= PUSH_MS) {
            state.value = event.payload
            lastPush = now
          }
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

/** Open the rig's device, or the default output (creating a rig for it) when there is no rig yet. */
async function ensureOutput(): Promise<OpenedOutput> {
  if (output.value) return output.value
  let current = rig.value ?? (await loadCurrentRig())
  if (current) {
    try {
      output.value = await engine.open(outputConfig(current))
    } catch (cause) {
      // The rig's device is missing: play through the default output and say so.
      output.value = await engine.open({ deviceId: null, sampleRate: null, bufferSize: current.bufferSize })
      error.value = `${current.device || 'The rig device'} is unavailable (${cause}). Playing through ${output.value.name}.`
    }
  } else {
    output.value = await engine.open({ deviceId: null, sampleRate: null, bufferSize: DEFAULT_BUFFER })
    current = { ...defaultRig(output.value.channels), device: output.value.name }
    await saveRig(current)
  }
  setCurrentRigId(current.id)
  rig.value = current
  await engine.setRouting(routingDoc(current))
  const options = usePerformOptions()
  await engine.setOptions(snapshotOptions(options))
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
    const info = await engine.loadSong(songDoc(target, rig.value, timecodeStart(at)))
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

/** The LTC start for the song at `at` in the queue: its hour in a setlist with one hour per song. */
function timecodeStart(at: number): string | null {
  return setlist.value && usePerformOptions().timecode.hourPerSong ? songHour(at) : null
}

/** Send every loaded track its bus again, after buses were added, removed, renamed or reordered. */
async function resyncTrackBuses() {
  const current = rig.value
  const target = song.value
  if (current && target && state.value?.loaded) {
    for (const [track, entry] of target.tracks.entries()) {
      await engine.command({ type: 'trackBus', track, bus: busIndex(current, entry.defaultBus) })
    }
  }
  await prepareFollowing()
}

/** Use `next` as the rig: save it, reopen the device if it changed, and send the routing. */
async function applyRig(next: Rig): Promise<void> {
  const previous = rig.value
  rig.value = next
  rigs.value = rigs.value.some((entry) => entry.id === next.id) ? rigs.value.map((entry) => (entry.id === next.id ? next : entry)) : [next, ...rigs.value]
  saveLater(`rig:${next.id}`, () => saveRig(next))
  if (!output.value) return
  await run(async () => {
    if (deviceChanged(previous, next)) output.value = await engine.open(outputConfig(next))
    await engine.setRouting(routingDoc(next))
    if (busesChanged(previous, next) || previous?.id !== next.id) await resyncTrackBuses()
  })
}

/** Replace a track in the current song and save the song shortly after. */
function editTrack(track: number, patch: Partial<Song['tracks'][number]>) {
  const target = song.value
  if (!target?.tracks[track]) return
  const updated = { ...target, tracks: target.tracks.map((entry, i) => (i === track ? { ...entry, ...patch } : entry)) }
  songs.value = songs.value.map((entry) => (entry.id === updated.id ? updated : entry))
  saveLater(`song:${updated.id}`, () => saveSong(updated))
}

function editBus(name: string, patch: { gain?: number; mute?: boolean }) {
  const current = rig.value
  const bus = current ? busIndex(current, name) : null
  if (!current || bus === null) return Promise.resolve()
  const next = { ...current, buses: current.buses.map((entry) => (entry.name === name ? { ...entry, ...patch } : entry)) }
  rig.value = next
  rigs.value = rigs.value.map((entry) => (entry.id === next.id ? next : entry))
  saveLater(`rig:${next.id}`, () => saveRig(next))
  if (!output.value) return Promise.resolve()
  return patch.gain !== undefined ? send({ type: 'busGain', bus, gain: patch.gain }) : send({ type: 'busMute', bus, muted: patch.mute ?? false })
}

function startPlaying() {
  const options = usePerformOptions()
  const fromTop = position.value === 0 && options.click.countInBars > 0
  return send({ type: fromTop ? 'playWithCountIn' : 'play' })
}

export function usePlayer() {
  void listenOnce()
  return {
    state,
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
    rig,
    rigs,
    devices,

    /** Open the output if needed, then list devices and rigs (the Settings page). */
    refreshDevices: () =>
      run(async () => {
        await listenOnce()
        await ensureOutput()
        devices.value = await engine.devices()
        rigs.value = await listRigs()
      }),
    applyRig,
    /** Switch to another saved rig. */
    selectRig: async (id: string) => {
      const next = rigs.value.find((entry) => entry.id === id)
      if (!next) return
      setCurrentRigId(id)
      await applyRig(next)
    },
    /** A new rig for the open device, made current. */
    newRig: async () => {
      const channels = output.value?.channels ?? 2
      const created = { ...defaultRig(channels), name: `Rig ${rigs.value.length + 1}`, device: output.value?.name ?? '', deviceId: rig.value?.deviceId ?? null }
      setCurrentRigId(created.id)
      await applyRig(created)
    },
    setBusGain: (name: string, gain: number) => editBus(name, { gain }),
    setBusMute: (name: string, mute: boolean) => editBus(name, { mute }),
    /** Track fader: sent at once, saved to the song shortly after. */
    setTrackGain: (track: number, gain: number) => {
      editTrack(track, { gain })
      return send({ type: 'gain', track, gain })
    },
    /** Move a track to another bus of the rig; saved to the song as its `defaultBus`. */
    setTrackBus: (track: number, name: string) => {
      editTrack(track, { defaultBus: name })
      return send({ type: 'trackBus', track, bus: rig.value ? busIndex(rig.value, name) : null })
    },

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

/** The play head in engine frames, interpolated from the newest state while playing. */
export function livePosition(now: number = performance.now()): number {
  const current = latest
  if (!current) return 0
  const elapsed = current.playing && current.countIn === 0 ? ((now - latestAt) / 1000) * current.sampleRate : 0
  // Cap at one state interval ahead so a stalled engine never runs the play head away.
  return Math.min(current.length, current.position + Math.min(elapsed, current.sampleRate / 20))
}

type PlayheadListener = (frames: number, length: number) => void
const playheadListeners = new Set<PlayheadListener>()
let playheadFrame = 0

function playheadLoop() {
  const frames = livePosition()
  const length = latest?.length ?? 0
  for (const listener of playheadListeners) listener(frames, length)
  playheadFrame = playheadListeners.size ? requestAnimationFrame(playheadLoop) : 0
}

/**
 * Call `listener` every animation frame with the play head, from one shared loop. For direct DOM
 * writes (transforms, widths), so the play head moves without re-rendering Vue. Stops with the scope.
 */
export function onPlayhead(listener: PlayheadListener): void {
  playheadListeners.add(listener)
  if (!playheadFrame && typeof requestAnimationFrame !== 'undefined') playheadFrame = requestAnimationFrame(playheadLoop)
  onScopeDispose(() => playheadListeners.delete(listener))
}

/** The play head for text readouts: interpolated, updated about 15 times a second. */
export function useSmoothPosition() {
  const smooth = ref(0)
  let last = 0
  onPlayhead((frames) => {
    const now = performance.now()
    if (now - last >= PUSH_MS) {
      smooth.value = frames
      last = now
    }
  })
  return smooth
}
