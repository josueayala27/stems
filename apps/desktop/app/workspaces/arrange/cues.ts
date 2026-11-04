// MIDI cue events for the Arrange page: where they fire and what they send.
import type { CueAction, CueAnchor, CueEvent, Song } from '@stems/schema'
import type { SelectOption } from '~/ui'

export type MidiKind = 'midiProgram' | 'midiNote' | 'midiCc'
type MidiCueAction = Extract<CueAction, { kind: MidiKind }>

export const MIDI_KINDS: SelectOption<MidiKind>[] = [
  { value: 'midiProgram', label: 'Patch change' },
  { value: 'midiNote', label: 'Note' },
  { value: 'midiCc', label: 'Control change' },
]

export function isMidiCue(event: CueEvent): event is CueEvent & { action: MidiCueAction } {
  return event.action.kind === 'midiProgram' || event.action.kind === 'midiNote' || event.action.kind === 'midiCc'
}

/** A patch change on channel 1 at `at`. The port stays empty: cues go to the rig's MIDI output. */
export function newCue(at: CueAnchor, newId: () => string = () => crypto.randomUUID()): CueEvent {
  return { id: newId(), at, action: { kind: 'midiProgram', port: '', channel: 1, program: 0 } }
}

/** The action as another kind, keeping its channel. */
export function withKind(action: MidiCueAction, kind: MidiKind): MidiCueAction {
  const { port, channel } = action
  if (kind === 'midiProgram') return { kind, port, channel, program: action.kind === 'midiProgram' ? action.program : 0 }
  if (kind === 'midiNote') return { kind, port, channel, note: 60, velocity: 100 }
  return { kind, port, channel, controller: 1, value: 127 }
}

export function anchorKey(at: CueAnchor): string {
  return at.kind === 'marker' ? `marker:${at.markerId}` : `sample:${at.sample}`
}

export function anchorFromKey(key: string): CueAnchor | null {
  const [kind, value] = key.split(':')
  if (kind === 'marker' && value) return { kind: 'marker', markerId: value }
  if (kind === 'sample' && value !== undefined && Number.isInteger(Number(value))) return { kind: 'sample', sample: Number(value) }
  return null
}

/**
 * Where a cue can fire: the song start, each section start and each marker. `current` keeps a cue's
 * own anchor listed (labelled by `barLabel`) when it is none of those.
 */
export function anchorOptions(song: Song, current: CueAnchor | null, barLabel: (sample: number) => string): SelectOption<string>[] {
  const options: SelectOption<string>[] = [{ value: 'sample:0', label: 'Song start' }]
  for (const section of [...song.sections].sort((a, b) => a.startSample - b.startSample)) {
    const value = `sample:${section.startSample}`
    if (!options.some((option) => option.value === value)) options.push({ value, label: `${section.name} start` })
  }
  for (const marker of song.markers) options.push({ value: `marker:${marker.id}`, label: `Marker: ${marker.name || barLabel(marker.sample)}` })
  if (current) {
    const value = anchorKey(current)
    if (!options.some((option) => option.value === value) && current.kind === 'sample') options.push({ value, label: barLabel(current.sample) })
  }
  return options
}

/** The sample a cue fires at, for sorting; marker cues follow their marker. */
export function cueSample(song: Song, event: CueEvent): number {
  if (event.at.kind === 'sample') return event.at.sample
  const markerId = event.at.markerId
  return song.markers.find((marker) => marker.id === markerId)?.sample ?? Number.POSITIVE_INFINITY
}

export function updateCue(song: Song, id: string, patch: Partial<Pick<CueEvent, 'at' | 'action'>>): Song {
  return { ...song, events: song.events.map((event) => (event.id === id ? { ...event, ...patch } : event)) }
}

/** Removing a marker also removes the cues anchored to it (the schema rejects dangling anchors). */
export function removeMarker(song: Song, markerId: string): Song {
  return {
    ...song,
    markers: song.markers.filter((marker) => marker.id !== markerId),
    events: song.events.filter((event) => !(event.at.kind === 'marker' && event.at.markerId === markerId)),
  }
}

/** `C3`-style name for a MIDI note (middle C = 60 = C3, as most DAWs show it). */
export function noteName(note: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  return `${names[note % 12]}${Math.floor(note / 12) - 2}`
}
