import { songSchema } from '@stems/schema'
import { describe, expect, it } from 'vitest'
import { anchorFromKey, anchorKey, anchorOptions, cueSample, newCue, noteName, removeMarker, updateCue, withKind } from './cues'

const song = songSchema.parse({
  id: 's',
  title: 'Song',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  durationSamples: 960_000,
  sampleRate: 48_000,
  sections: [
    { id: 'a', name: 'Intro', startSample: 0, endSample: 96_000, color: 'blue' },
    { id: 'b', name: 'Verse', startSample: 96_000, endSample: 480_000, color: 'red' },
  ],
  markers: [{ id: 'm', name: 'Drop', sample: 480_000 }],
})

describe('cues', () => {
  it('anchors to the song start, section starts and markers, once each', () => {
    const options = anchorOptions(song, null, (sample) => `Bar ${sample}`)
    expect(options.map((option) => option.label)).toEqual(['Song start', 'Verse start', 'Marker: Drop'])
    expect(anchorOptions(song, { kind: 'sample', sample: 5 }, () => 'Bar 1').at(-1)).toEqual({ value: 'sample:5', label: 'Bar 1' })
  })

  it('round-trips anchor keys', () => {
    for (const at of [{ kind: 'sample' as const, sample: 96_000 }, { kind: 'marker' as const, markerId: 'm' }]) expect(anchorFromKey(anchorKey(at))).toEqual(at)
    expect(anchorFromKey('nope')).toBeNull()
  })

  it('changes kind and keeps the channel', () => {
    const cue = newCue({ kind: 'sample', sample: 0 }, () => 'c')
    const action = cue.action.kind === 'midiProgram' ? { ...cue.action, channel: 5 } : cue.action
    expect(withKind(action as never, 'midiNote')).toEqual({ kind: 'midiNote', port: '', channel: 5, note: 60, velocity: 100 })
  })

  it('removes a marker together with the cues on it, and stays valid', () => {
    const withCue = { ...song, events: [newCue({ kind: 'marker', markerId: 'm' }, () => 'c'), newCue({ kind: 'sample', sample: 0 }, () => 'd')] }
    expect(cueSample(withCue, withCue.events[0]!)).toBe(480_000)
    const removed = removeMarker(withCue, 'm')
    expect(removed.events.map((event) => event.id)).toEqual(['d'])
    expect(songSchema.safeParse(removed).success).toBe(true)
    expect(updateCue(withCue, 'd', { at: { kind: 'sample', sample: 96_000 } }).events[1]?.at).toEqual({ kind: 'sample', sample: 96_000 })
  })

  it('names notes with middle C as C3', () => {
    expect(noteName(60)).toBe('C3')
    expect(noteName(36)).toBe('C1')
    expect(noteName(61)).toBe('C♯3')
  })
})
