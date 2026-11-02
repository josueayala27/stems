import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS, isNavActive } from './nav'

const item = (href: string) => NAV_SECTIONS.flatMap((section) => section.items).find((entry) => entry.href === href)!

describe('isNavActive', () => {
  it('keeps Play to the root route only', () => {
    expect(isNavActive(item('/'), '/')).toBe(true)
    expect(isNavActive(item('/'), '/mixer')).toBe(false)
  })

  it('highlights Arrange on song routes', () => {
    expect(isNavActive(item('/arrange'), '/arrange')).toBe(true)
    expect(isNavActive(item('/arrange'), '/arrange/song-1')).toBe(true)
    expect(isNavActive(item('/arrange'), '/arranger')).toBe(false)
  })

  it('lists the workspaces in sidebar order', () => {
    expect(NAV_SECTIONS.map((section) => section.title)).toEqual(['Perform', 'Build', 'Library', 'System'])
  })
})
