import { defaultRig } from '@stems/core'
import { describe, expect, it } from 'vitest'
import { parseRig, writeRig } from './rigs'

describe('rigs', () => {
  const rig = defaultRig(16, () => 'id')

  it('writes a validated document with its name', async () => {
    const calls: unknown[][] = []
    await writeRig({ execute: async (query, values) => void calls.push([query, values]) }, rig, 7)
    const [, values] = calls[0] as [string, unknown[]]
    expect(values.slice(0, 2)).toEqual(['id', 'Default rig'])
    expect(parseRig(values[2] as string)).toEqual(rig)
    expect(values[3]).toBe(7)
  })

  it('rejects documents that fail validation', async () => {
    await expect(writeRig({ execute: async () => {} }, { ...rig, buses: [], routing: [{ bus: 'X', channels: [0] }] })).rejects.toThrow()
    expect(parseRig('{')).toBeNull()
    expect(parseRig(JSON.stringify({ ...rig, bufferSize: 100 }))).toBeNull()
  })
})
