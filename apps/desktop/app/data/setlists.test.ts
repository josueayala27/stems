import { describe, expect, it } from 'vitest'
import { newSetlist, parseSetlist, writeSetlist } from './setlists'

describe('setlists', () => {
  it('creates, writes and parses a setlist', async () => {
    const setlist = { ...newSetlist('Sunday', () => 'set-1'), items: [{ songId: 'a', transition: 'auto' as const, preWaitMs: 2_000, crossfadeMs: 4_000, pad: null }] }
    const calls: unknown[][] = []
    await writeSetlist({ execute: async (_query, values) => void calls.push(values ?? []) }, setlist, 9)
    expect(calls[0]).toEqual(['set-1', 'Sunday', JSON.stringify(setlist), 9])
    expect(parseSetlist(JSON.stringify(setlist))).toEqual(setlist)
  })

  it('reads old or broken documents safely', () => {
    expect(parseSetlist('{')).toBeNull()
    // A document from before pads and crossfade lengths gets their defaults.
    expect(parseSetlist('{"id":"x","name":"Old","items":[{"songId":"a"}]}')?.items[0]).toEqual({
      songId: 'a',
      transition: 'stop',
      preWaitMs: 0,
      crossfadeMs: 4_000,
      pad: null,
    })
  })
})
