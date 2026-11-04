// Pure editing maths for the Arrange workspace. Every boundary snaps to a bar line of the tempo map.
import { barBeatToSamples, createTempoGrid, samplesToBarBeat, type TempoGrid } from '@stems/core'
import type { Marker, Section, Song } from '@stems/schema'

export const SECTION_NAMES = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Instrumental', 'Tag', 'Outro']
export const SECTION_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'orange']
/** Bars a new section spans. */
export const DEFAULT_BARS = 8

/** Samples from the start point to the end of the longest stem: the song as it plays. */
export function songLength(song: Song): number {
  return Math.max(0, song.durationSamples - song.startSample)
}

export function gridFor(song: Song): TempoGrid {
  return createTempoGrid({ sampleRate: song.sampleRate, bpm: song.bpm, timeSignature: song.timeSignature, tempoMap: song.tempoMap })
}

/** 1-based bar under `sample`. */
export function barAt(grid: TempoGrid, sample: number): number {
  return samplesToBarBeat(grid, sample).bar
}

/** Start sample of 1-based `bar`. */
export function barStart(grid: TempoGrid, bar: number): number {
  return barBeatToSamples(grid, { bar: Math.max(1, Math.round(bar)) })
}

/** The bar line nearest to `sample`. */
export function snapToBar(grid: TempoGrid, sample: number): number {
  const bar = barAt(grid, sample)
  const before = barStart(grid, bar)
  const after = barStart(grid, bar + 1)
  return sample - before <= after - sample ? before : after
}

/** Bars in the song, rounding a partial last bar up. */
export function barCount(song: Song): number {
  const grid = gridFor(song)
  const last = samplesToBarBeat(grid, Math.max(0, songLength(song) - 1))
  return last.bar
}

export function sortSections(sections: readonly Section[]): Section[] {
  return [...sections].sort((a, b) => a.startSample - b.startSample)
}

/** A section name for the next section: "Verse" after "Intro", and so on. */
export function nextSectionName(sections: readonly Section[]): string {
  const last = sortSections(sections).at(-1)
  if (!last) return SECTION_NAMES[0]!
  const index = SECTION_NAMES.findIndex((name) => last.name.toLowerCase().startsWith(name.toLowerCase()))
  return SECTION_NAMES[(index + 1) % SECTION_NAMES.length] ?? 'Section'
}

/** Append a section after the last one (or at bar 1), `DEFAULT_BARS` long, clipped to the song. */
export function appendSection(song: Song, newId: () => string): Section[] {
  const grid = gridFor(song)
  const sections = sortSections(song.sections)
  const start = sections.at(-1)?.endSample ?? 0
  if (start >= songLength(song)) return sections
  const startBar = barAt(grid, start)
  const end = Math.min(songLength(song), barStart(grid, startBar + DEFAULT_BARS))
  const color = SECTION_COLORS[sections.length % SECTION_COLORS.length]!
  return [...sections, { id: newId(), name: nextSectionName(sections), startSample: start, endSample: end, color, loopable: true }]
}

/** Split the section under `sample` at the nearest bar line. Returns the sections unchanged when that bar is an edge. */
export function splitAt(song: Song, sample: number, newId: () => string): Section[] {
  const grid = gridFor(song)
  const at = snapToBar(grid, sample)
  const sections = sortSections(song.sections)
  const index = sections.findIndex((section) => section.startSample < at && at < section.endSample)
  if (index < 0) return sections
  const section = sections[index]!
  const tail: Section = { ...section, id: newId(), name: nextSectionName(sections.slice(0, index + 1)), startSample: at }
  return [...sections.slice(0, index), { ...section, endSample: at }, tail, ...sections.slice(index + 1)]
}

/** Set a section's bars (1-based start, exclusive end), snapped and kept at least one bar long. */
export function setSectionBars(song: Song, id: string, startBar: number, endBar: number): Section[] {
  const grid = gridFor(song)
  return sortSections(
    song.sections.map((section) => {
      if (section.id !== id) return section
      const start = barStart(grid, startBar)
      const end = Math.min(songLength(song), Math.max(barStart(grid, Math.max(endBar, startBar + 1)), start + 1))
      return { ...section, startSample: Math.min(start, end - 1), endSample: end }
    }),
  )
}

/** A marker at `sample`, snapped to the bar. */
export function addMarker(song: Song, sample: number, newId: () => string): Marker[] {
  const at = Math.min(snapToBar(gridFor(song), sample), Math.max(0, songLength(song) - 1))
  return [...song.markers, { id: newId(), name: `Marker ${song.markers.length + 1}`, sample: at, action: 'stop' as const }].sort((a, b) => a.sample - b.sample)
}

/** Change the song tempo and meter. A single-point tempo map follows; sections keep their bars. */
export function setTempo(song: Song, bpm: number, numerator: number, denominator: 2 | 4 | 8 | 16): Song {
  if (!(bpm > 0 && bpm <= 999)) return song
  const before = gridFor(song)
  const timeSignature = { numerator, denominator }
  const tempoMap = song.tempoMap.length <= 1 ? [{ sample: 0, bpm, timeSignature }] : song.tempoMap
  const next = { ...song, bpm, timeSignature, tempoMap }
  const after = gridFor(next)
  // Keep sections and markers on the same bar numbers.
  const move = (sample: number) => {
    const position = samplesToBarBeat(before, sample)
    return Math.min(songLength(song), barBeatToSamples(after, position))
  }
  return {
    ...next,
    sections: next.sections.map((section) => ({ ...section, startSample: move(section.startSample), endSample: Math.max(move(section.endSample), move(section.startSample) + 1) })),
    markers: next.markers.map((marker) => ({ ...marker, sample: Math.min(move(marker.sample), Math.max(0, songLength(song) - 1)) })),
  }
}

/** Shortest section when dragging: a bar when snapping, a tenth of a second when free. */
function minimumLength(grid: TempoGrid, sample: number, snap: boolean): number {
  if (!snap) return Math.round(grid.sampleRate / 10)
  const bar = barAt(grid, sample)
  return barStart(grid, bar + 1) - barStart(grid, bar)
}

/**
 * Drag one edge of a section to `sample`, snapped to the nearest bar unless `snap` is false. A
 * neighbour that shares the edge moves with it, so contiguous sections stay contiguous; nothing
 * overlaps and no section gets shorter than the minimum.
 */
export function moveSectionEdge(song: Song, id: string, edge: 'start' | 'end', sample: number, snap = true): Section[] {
  const grid = gridFor(song)
  const sorted = sortSections(song.sections)
  const index = sorted.findIndex((section) => section.id === id)
  const section = sorted[index]
  if (!section) return song.sections
  const target = snap ? snapToBar(grid, sample) : Math.round(sample)
  const min = minimumLength(grid, target, snap)
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))
  const updated = new Map<string, Section>()
  if (edge === 'start') {
    const previous = sorted[index - 1]
    const joined = previous && previous.endSample === section.startSample
    const low = previous ? (joined ? previous.startSample + min : previous.endSample) : 0
    const start = clamp(target, low, section.endSample - min)
    updated.set(section.id, { ...section, startSample: start })
    if (previous && joined) updated.set(previous.id, { ...previous, endSample: start })
  } else {
    const next = sorted[index + 1]
    const joined = next && next.startSample === section.endSample
    const high = next ? (joined ? next.endSample - min : next.startSample) : songLength(song)
    const end = clamp(target, section.startSample + min, high)
    updated.set(section.id, { ...section, endSample: end })
    if (next && joined) updated.set(next.id, { ...next, startSample: end })
  }
  return song.sections.map((entry) => updated.get(entry.id) ?? entry)
}

/** Drag a marker to `sample`, snapped to the nearest bar unless `snap` is false. */
export function moveMarker(song: Song, id: string, sample: number, snap = true): Marker[] {
  const at = snap ? snapToBar(gridFor(song), sample) : Math.round(sample)
  const clamped = Math.min(Math.max(0, at), Math.max(0, songLength(song) - 1))
  return song.markers.map((marker) => (marker.id === id ? { ...marker, sample: clamped } : marker))
}

/**
 * Move the start point to file sample `start`. Everything placed on the timeline keeps its place in
 * the audio: positions shift by the difference, and sections, markers and cues that would fall
 * before the new start are clamped to it (sections) or dropped (markers, and cues on them).
 */
export function setStart(song: Song, start: number): Song {
  const next = Math.min(Math.max(0, Math.round(start)), song.durationSamples)
  const delta = song.startSample - next
  const length = Math.max(0, song.durationSamples - next)
  const move = (sample: number) => sample + delta
  const sections = song.sections
    .map((section) => ({ ...section, startSample: Math.max(0, move(section.startSample)), endSample: Math.min(length, move(section.endSample)) }))
    .filter((section) => section.endSample > section.startSample)
  const markers = song.markers.map((marker) => ({ ...marker, sample: move(marker.sample) })).filter((marker) => marker.sample >= 0 && marker.sample < Math.max(1, length))
  const kept = new Set(markers.map((marker) => marker.id))
  const events = song.events
    .map((event) => (event.at.kind === 'sample' ? { ...event, at: { kind: 'sample' as const, sample: Math.max(0, move(event.at.sample)) } } : event))
    .filter((event) => event.at.kind === 'sample' || kept.has(event.at.markerId))
  // The tempo map keeps its first point at the new bar 1; later points keep their place in the audio.
  const tempoMap = song.tempoMap.map((point, index) => ({ ...point, sample: index === 0 ? 0 : Math.max(1, move(point.sample)) }))
  const sortedTempo = tempoMap.filter((point, index) => index === 0 || point.sample > (tempoMap[index - 1]?.sample ?? 0))
  return { ...song, startSample: next, sections, markers, events, tempoMap: sortedTempo }
}
