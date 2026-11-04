import { busIndex } from '@stems/core'
import type { Rig, Setlist, SetlistItem, Song } from '@stems/schema'
import type { MidiAction, SongDoc, TransitionDoc } from './engine'

/** The song's MIDI cue events at samples, sorted; marker anchors resolve to the marker. Unknown markers drop out. */
export function cueEventDocs(song: Song): SongDoc['events'] {
  const markers = new Map(song.markers.map((marker) => [marker.id, marker.sample]))
  const events: SongDoc['events'] = []
  for (const event of song.events) {
    const sample = event.at.kind === 'sample' ? event.at.sample : markers.get(event.at.markerId)
    if (sample === undefined) continue
    const { action } = event
    let midi: MidiAction | null = null
    if (action.kind === 'midiProgram') midi = { kind: action.kind, channel: action.channel, program: action.program }
    else if (action.kind === 'midiNote') midi = { kind: action.kind, channel: action.channel, note: action.note, velocity: action.velocity }
    else if (action.kind === 'midiCc') midi = { kind: action.kind, channel: action.channel, controller: action.controller, value: action.value }
    if (midi) events.push({ sample, action: midi })
  }
  return events.sort((a, b) => a.sample - b.sample)
}

/** The part of a song the engine needs to play it. Track buses are resolved by name in `rig`. */
export function songDoc(song: Song, rig: Rig | null = null, timecodeStart: string | null = null): SongDoc {
  return {
    sampleRate: song.sampleRate,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    tempoMap: song.tempoMap,
    tracks: song.tracks.map((track) => ({
      file: track.file,
      kind: track.kind,
      gain: track.gain,
      mute: track.mute,
      bus: rig ? busIndex(rig, track.defaultBus) : null,
    })),
    sections: [...song.sections]
      .sort((a, b) => a.startSample - b.startSample)
      .map((section) => ({ name: section.name, startSample: section.startSample, endSample: section.endSample })),
    markers: song.markers.map((marker) => ({ sample: marker.sample, action: marker.action })),
    timecodeStart,
    events: cueEventDocs(song),
    startSample: song.startSample,
  }
}

/** How the song at `item` is reached from the one before it. */
export function transitionDoc(item: SetlistItem): TransitionDoc {
  return { kind: item.transition, preWaitMs: item.preWaitMs, crossfadeMs: item.crossfadeMs }
}

/** The pad that should sound at setlist position `index`: the nearest one set at or before it. */
export function padAt(setlist: Setlist, index: number): string | null {
  for (let i = Math.min(index, setlist.items.length - 1); i >= 0; i--) {
    const pad = setlist.items[i]?.pad
    if (pad) return pad.file
  }
  return null
}

/** Song sample (at the song's rate) to engine frame (at the device rate), and back. */
export function toEngine(sample: number, songRate: number, engineRate: number): number {
  return songRate > 0 && engineRate > 0 ? Math.round((sample * engineRate) / songRate) : sample
}

export function fromEngine(frame: number, songRate: number, engineRate: number): number {
  return songRate > 0 && engineRate > 0 ? Math.round((frame * songRate) / engineRate) : frame
}
