import { describe, expect, it } from 'vitest'
import { actionFor, bind, parsePress, triggerFor, triggerLabel, unbind } from './controls'

describe('controls', () => {
  it('reads presses and ignores releases', () => {
    expect(parsePress([0x90, 60, 100])).toEqual({ kind: 'note', channel: 1, number: 60 })
    expect(parsePress([0x90, 60, 0])).toBeNull()
    expect(parsePress([0x80, 60, 0])).toBeNull()
    expect(parsePress([0xb3, 64, 127])).toEqual({ kind: 'cc', channel: 4, number: 64 })
    expect(parsePress([0xb3, 64, 0])).toBeNull()
    expect(parsePress([0xc1, 4])).toEqual({ kind: 'program', channel: 2, number: 4 })
    expect(parsePress([0xf8])).toBeNull()
  })

  it('learns a press and fires its action, on any channel when the channel is cleared', () => {
    const press = parsePress([0xb0, 80, 127])!
    const bindings = bind([], 'vamp', triggerFor(press))
    expect(actionFor(bindings, press)).toBe('vamp')
    expect(actionFor(bindings, { ...press, channel: 2 })).toBeNull()
    const anyChannel = bind([], 'vamp', { ...triggerFor(press), channel: null })
    expect(actionFor(anyChannel, { ...press, channel: 9 })).toBe('vamp')
  })

  it('keeps one switch on one action', () => {
    const trigger = { kind: 'cc' as const, channel: 1, number: 80 }
    let bindings = bind([], 'vamp', trigger)
    bindings = bind(bindings, 'nextSong', trigger)
    expect(bindings).toEqual([{ action: 'nextSong', trigger }])
    bindings = bind(bindings, 'nextSong', { ...trigger, number: 81 })
    expect(bindings).toHaveLength(1)
    expect(unbind(bindings, 'nextSong')).toEqual([])
  })

  it('labels triggers the way a musician reads them', () => {
    expect(triggerLabel({ kind: 'cc', channel: 1, number: 64 })).toBe('CC 64 · ch 1')
    expect(triggerLabel({ kind: 'note', channel: null, number: 60 })).toBe('Note C3 · any ch')
    expect(triggerLabel({ kind: 'program', channel: 2, number: 4 })).toBe('Program 5 · ch 2')
  })
})
