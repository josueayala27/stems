import { describe, expect, it } from 'vitest'
import { addDays, addMonths, buildValue, fromIsoDate, inRange, monthGrid, parseValue, weekdayIndex } from './calendar'

describe('calendar', () => {
  it('parses date-only and instant values to local parts', () => {
    expect(parseValue('2026-02-03')).toEqual({ date: '2026-02-03', time: '00:00' })
    const instant = new Date(2026, 1, 3, 14, 5).toISOString()
    expect(parseValue(instant)).toEqual({ date: '2026-02-03', time: '14:05' })
    expect(parseValue('2026-02-30')).toBeNull()
    expect(parseValue('nope')).toBeNull()
    expect(parseValue(null)).toBeNull()
  })

  it('builds date-only or instant values', () => {
    expect(buildValue('2026-02-03', null)).toBe('2026-02-03')
    expect(buildValue('2026-02-03', '14:05')).toBe(new Date(2026, 1, 3, 14, 5).toISOString())
    expect(buildValue('bad', null)).toBeNull()
  })

  it('moves by days and clamps months', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15')
  })

  it('builds a 6-week grid starting on Monday', () => {
    const grid = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42)
    expect(grid[0]).toEqual({ date: '2026-09-28', day: 28, inMonth: false })
    expect(grid[3]).toEqual({ date: '2026-10-01', day: 1, inMonth: true })
    expect(monthGrid(2026, 9, 0)[0]!.date).toBe('2026-09-27')
    expect(weekdayIndex('2026-10-01')).toBe(3)
  })

  it('checks bounds', () => {
    expect(inRange('2026-05-05', '2026-05-01', '2026-05-10')).toBe(true)
    expect(inRange('2026-04-30', '2026-05-01')).toBe(false)
    expect(fromIsoDate('2026-05-05')?.getDate()).toBe(5)
  })
})
