import { describe, expect, it } from 'vitest'
import { emptyValue, enumOptions, fieldKind, fieldLabel, resolveSchema, schemaDefaults, validateSchema, type JsonSchema } from './jsonSchema'

describe('resolveSchema', () => {
  it('unwraps zod nullable unions and type arrays', () => {
    expect(resolveSchema({ anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }], description: 'd' })).toEqual({
      schema: { type: 'string', minLength: 1, description: 'd' },
      nullable: true,
    })
    expect(resolveSchema({ type: ['number', 'null'] })).toEqual({ schema: { type: 'number' }, nullable: true })
    expect(resolveSchema({ type: 'string' }).nullable).toBe(false)
  })
})

describe('fieldKind', () => {
  it('maps schemas to controls', () => {
    const cases: Array<[JsonSchema, string]> = [
      [{ type: 'string' }, 'string'],
      [{ type: 'string', enum: ['a', 'b'] }, 'enum'],
      [{ const: 'x' }, 'enum'],
      [{ type: 'integer' }, 'integer'],
      [{ type: 'number' }, 'number'],
      [{ type: 'boolean' }, 'boolean'],
      [{ type: 'object', properties: {} }, 'object'],
      [{ type: 'object' }, 'json'],
      [{ type: 'array', items: { type: 'string' } }, 'array'],
      [{ type: 'string', 'x-secret': true }, 'secret'],
      [{}, 'json'],
    ]
    for (const [schema, kind] of cases) expect(fieldKind(schema)).toBe(kind)
  })
})

describe('labels, options, defaults', () => {
  it('humanizes keys unless a title is given', () => {
    expect(fieldLabel({}, 'apiKey')).toBe('Api key')
    expect(fieldLabel({}, 'response_path')).toBe('Response path')
    expect(fieldLabel({ title: 'Token' }, 'apiKey')).toBe('Token')
    expect(fieldLabel({}, 2)).toBe('Item 3')
  })

  it('labels enum options', () => {
    expect(enumOptions({ enum: ['GET', 'POST'], 'x-enumLabels': ['Get'] })).toEqual([
      { value: 'GET', label: 'Get' },
      { value: 'POST', label: 'POST' },
    ])
  })

  it('collects defaults and empty values', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { method: { type: 'string', default: 'GET' }, retries: { type: 'integer', minimum: 1 }, auth: { type: 'object', properties: { kind: { type: 'string', default: 'none' } } } },
    }
    expect(schemaDefaults(schema)).toEqual({ method: 'GET', auth: { kind: 'none' } })
    expect(emptyValue({ type: 'integer', minimum: 1 })).toBe(1)
    expect(emptyValue({ enum: ['a', 'b'] })).toBe('a')
    expect(emptyValue({ type: 'object', properties: { x: { type: 'string' } } })).toEqual({})
  })
})

describe('validateSchema', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['url', 'method'],
    properties: {
      url: { type: 'string', format: 'uri' },
      method: { type: 'string', enum: ['GET', 'POST'] },
      email: { type: 'string', format: 'email' },
      timeout: { type: 'integer', minimum: 1, maximum: 60 },
      name: { type: 'string', minLength: 2, pattern: '^[a-z]+$' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      token: { type: 'string', 'x-secret': true },
      note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
  }
  const paths = (value: unknown, stored: string[] = []) => validateSchema({ ...schema, required: [...schema.required!, 'token'] }, value, { storedSecrets: new Set(stored) }).map((i) => `${i.path}: ${i.message}`)

  it('reports required fields', () => {
    expect(paths({})).toEqual(['url: Required', 'method: Required', 'token: Required'])
  })

  it('checks formats, ranges, patterns and list sizes', () => {
    expect(paths({ url: 'nope', method: 'PUT', email: 'x@', timeout: 1.5, name: 'A', tags: ['a', '', 'c'], token: 's' })).toEqual([
      'url: Enter a valid URL (https://…)',
      'method: Choose one of the listed values',
      'email: Enter a valid email address',
      'timeout: Must be a whole number',
      'name: At least 2 characters',
      'tags: At most 2 items',
    ])
    expect(paths({ url: 'https://a.dev', method: 'GET', timeout: 90, name: 'ab1', token: 's' })).toEqual(['timeout: Must be at most 60', 'name: Does not match the expected format'])
  })

  it('accepts null for nullable fields', () => {
    expect(paths({ url: 'https://a.dev', method: 'GET', note: null, token: 'x' })).toEqual([])
  })

  it('treats stored secrets as present unless cleared', () => {
    expect(paths({ url: 'https://a.dev', method: 'GET' }, ['token'])).toEqual([])
    expect(paths({ url: 'https://a.dev', method: 'GET', token: null }, ['token'])).toEqual(['token: Required'])
    expect(paths({ url: 'https://a.dev', method: 'GET', token: '' }, ['token'])).toEqual(['token: Required'])
  })

  it('flags empty items in lists', () => {
    const list: JsonSchema = { type: 'array', items: { type: 'object', required: ['k'], properties: { k: { type: 'string' } } } }
    expect(validateSchema(list, [{ k: 'a' }, {}]).map((i) => i.path)).toEqual(['[1].k'])
  })
})
