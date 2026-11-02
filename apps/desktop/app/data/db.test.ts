import { describe, expect, it } from 'vitest'
import { MIGRATION, migrate, type SqlExecutor } from './db'

function recorder(): SqlExecutor & { statements: string[] } {
  const statements: string[] = []
  return {
    statements,
    async execute(query: string) {
      statements.push(query)
    },
  }
}

describe('migrate', () => {
  it('creates the songs, setlists and rigs tables', async () => {
    const db = recorder()
    await migrate(db)
    for (const table of ['songs', 'setlists', 'rigs']) {
      expect(db.statements.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true)
    }
  })

  it('only uses idempotent statements', () => {
    for (const sql of MIGRATION) expect(sql).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /)
  })

  it('stores each document as JSON in a doc column', () => {
    const tables = MIGRATION.filter((sql) => sql.startsWith('CREATE TABLE'))
    for (const sql of tables) expect(sql).toContain('doc TEXT NOT NULL')
  })
})
