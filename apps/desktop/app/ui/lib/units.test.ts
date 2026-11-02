import { describe, expect, it } from 'vitest'
import { cssToDimension, formatDimension, parseDimension, type Unit } from './units'

const opts = { units: ['px', '%', 'auto'] as Unit[], fallbackUnit: 'px' as Unit }

describe('parseDimension', () => {
  it('parses numbers with and without units', () => {
    expect(parseDimension('12', opts)).toEqual({ value: 12, unit: 'px' })
    expect(parseDimension(' 12px ', opts)).toEqual({ value: 12, unit: 'px' })
    expect(parseDimension('50 %', opts)).toEqual({ value: 50, unit: '%' })
    expect(parseDimension('-45deg', { units: ['deg'], fallbackUnit: 'deg' })).toEqual({ value: -45, unit: 'deg' })
    expect(parseDimension('-.5PX', opts)).toEqual({ value: -0.5, unit: 'px' })
  })

  it('parses auto only when allowed', () => {
    expect(parseDimension('Auto', opts)).toEqual({ value: null, unit: 'auto' })
    expect(parseDimension('auto', { units: ['px'], fallbackUnit: 'px' })).toBeNull()
  })

  it('rejects units outside the allowed list and junk', () => {
    expect(parseDimension('2rem', opts)).toBeNull()
    expect(parseDimension('abc', opts)).toBeNull()
    expect(parseDimension('', opts)).toBeNull()
    expect(parseDimension('12autopx', opts)).toBeNull()
  })

  it('evaluates simple math', () => {
    expect(parseDimension('10+4', opts)).toEqual({ value: 14, unit: 'px' })
    expect(parseDimension('100/4%', opts)).toEqual({ value: 25, unit: '%' })
    expect(parseDimension('10px * 2', opts)).toEqual({ value: 20, unit: 'px' })
    expect(parseDimension('10px - 2%', opts)).toBeNull()
    expect(parseDimension('1/0', opts)).toBeNull()
  })

  it('supports unitless fields', () => {
    expect(parseDimension('0.9', { units: [''], fallbackUnit: '' })).toEqual({ value: 0.9, unit: '' })
  })
})

describe('formatDimension', () => {
  it('formats compactly', () => {
    expect(formatDimension({ value: 12, unit: 'px' })).toBe('12px')
    expect(formatDimension({ value: 1 / 3, unit: '%' })).toBe('0.33%')
    expect(formatDimension({ value: null, unit: 'auto' })).toBe('auto')
    expect(formatDimension({ value: null, unit: 'px' })).toBe('')
    expect(formatDimension({ value: -0, unit: '' })).toBe('0')
  })

  it('reads stored CSS leniently', () => {
    expect(cssToDimension('1.5rem')).toEqual({ value: 1.5, unit: 'rem' })
    expect(cssToDimension('1fr')).toEqual({ value: 1, unit: 'fr' })
  })
})
