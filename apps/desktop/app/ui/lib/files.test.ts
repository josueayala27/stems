import { describe, expect, it } from 'vitest'
import { acceptsFile, checkFiles, formatBytes } from './files'

const f = (name: string, type: string, size = 10) => ({ name, type, size })

describe('files', () => {
  it('matches extensions, wildcards and exact types', () => {
    expect(acceptsFile(f('a.PNG', 'image/png'), 'image/*')).toBe(true)
    expect(acceptsFile(f('a.pdf', 'application/pdf'), 'image/*, .pdf')).toBe(true)
    expect(acceptsFile(f('a.csv', 'text/csv'), 'image/*,.pdf')).toBe(false)
    expect(acceptsFile(f('a.json', 'application/json'), 'application/json')).toBe(true)
    expect(acceptsFile(f('x', ''), '')).toBe(true)
  })

  it('splits accepted and rejected files', () => {
    const files = [f('a.png', 'image/png', 5), f('b.txt', 'text/plain'), f('c.png', 'image/png', 500), f('d.png', 'image/png', 5)]
    const { accepted, rejected } = checkFiles(files, { accept: 'image/*', maxSize: 100, multiple: false })
    expect(accepted.map((x) => x.name)).toEqual(['a.png'])
    expect(rejected.map((r) => [r.file.name, r.reason])).toEqual([['b.txt', 'type'], ['c.png', 'size'], ['d.png', 'count']])
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })
})
