// The JSON Schema subset SchemaForm renders: what `z.toJSONSchema` emits for
// plugin config and operation inputs, plus a few `x-` hints.
import { formatPath, type PathSegment } from './jsonPath'

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'
export type JsonPrimitive = string | number | boolean | null

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[]
  title?: string
  description?: string
  default?: unknown
  enum?: JsonPrimitive[]
  const?: JsonPrimitive
  /** `email`, `uri` and `url` pick a matching input; others are kept as hints. */
  format?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  readOnly?: boolean
  /** Write-only field: the current value is never shown, only Set / Replace / Clear. */
  'x-secret'?: boolean
  /** Display labels for `enum` values, by position. */
  'x-enumLabels'?: string[]
  /** Render a string as a multi-line textarea. */
  'x-multiline'?: boolean
  /** Placeholder text for the control. */
  'x-placeholder'?: string
}

export type SchemaFieldKind = 'string' | 'enum' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'secret' | 'json'

export interface SchemaIssue {
  /** Formatted path (`auth.headers[0].name`, `''` for the root). */
  path: string
  segments: PathSegment[]
  message: string
}

export interface ResolvedSchema {
  schema: JsonSchema
  /** The schema also accepts `null` (`anyOf: [T, { type: 'null' }]` or `type: [T, 'null']`). */
  nullable: boolean
}

function isNullSchema(schema: JsonSchema): boolean {
  return schema.type === 'null' || (Array.isArray(schema.type) && schema.type.length === 1 && schema.type[0] === 'null')
}

/** Unwraps the nullable patterns zod emits so the form sees one concrete type. */
export function resolveSchema(schema: JsonSchema): ResolvedSchema {
  const union = schema.anyOf ?? schema.oneOf
  if (union) {
    const nonNull = union.filter((s) => !isNullSchema(s))
    if (nonNull.length === 1) {
      const { anyOf: _a, oneOf: _o, ...rest } = schema
      const inner = resolveSchema(nonNull[0]!)
      return { schema: { ...inner.schema, ...rest }, nullable: inner.nullable || nonNull.length < union.length }
    }
    return { schema, nullable: union.length > nonNull.length }
  }
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((t) => t !== 'null')
    const nullable = types.length < schema.type.length
    return { schema: { ...schema, type: types.length === 1 ? types[0] : types }, nullable }
  }
  return { schema, nullable: false }
}

export function schemaType(schema: JsonSchema): JsonSchemaType | undefined {
  if (typeof schema.type === 'string') return schema.type
  if (schema.properties) return 'object'
  if (schema.items) return 'array'
  if (schema.enum && schema.enum.length > 0) {
    const first = schema.enum.find((v) => v !== null)
    if (typeof first === 'string') return 'string'
    if (typeof first === 'number') return 'number'
    if (typeof first === 'boolean') return 'boolean'
  }
  return undefined
}

/** Which control renders a (resolved) schema. Unknown shapes fall back to a JSON editor. */
export function fieldKind(schema: JsonSchema): SchemaFieldKind {
  if (schema['x-secret']) return 'secret'
  if (schema.enum && schema.enum.length > 0) return 'enum'
  if (schema.const !== undefined) return 'enum'
  switch (schemaType(schema)) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'integer':
      return 'integer'
    case 'boolean':
      return 'boolean'
    case 'object':
      return schema.properties ? 'object' : 'json'
    case 'array':
      return schema.items ? 'array' : 'json'
    default:
      return 'json'
  }
}

export function enumOptions(schema: JsonSchema): Array<{ value: JsonPrimitive; label: string }> {
  const values = schema.enum ?? (schema.const !== undefined ? [schema.const] : [])
  const labels = schema['x-enumLabels'] ?? []
  return values.map((value, i) => ({ value, label: labels[i] ?? String(value) }))
}

/** A starting value for a new field or array item: the schema default, else an empty value of its type. */
export function emptyValue(input: JsonSchema): unknown {
  const { schema } = resolveSchema(input)
  if (schema.default !== undefined) return structuredClone(schema.default)
  switch (fieldKind(schema)) {
    case 'enum':
      return enumOptions(schema)[0]?.value ?? null
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return schema.minimum ?? 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return schemaDefaults(schema) ?? {}
    default:
      return undefined
  }
}

/** Defaults declared in the schema, collected into a value (`undefined` when none). */
export function schemaDefaults(input: JsonSchema): unknown {
  const { schema } = resolveSchema(input)
  if (schema.default !== undefined) return structuredClone(schema.default)
  if (fieldKind(schema) !== 'object' || !schema.properties) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(schema.properties)) {
    const value = schemaDefaults(child)
    if (value !== undefined) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Field label: `title`, else the key split into words (`apiKey` → `Api key`). */
export function fieldLabel(schema: JsonSchema, key: PathSegment | null): string {
  if (schema.title) return schema.title
  if (key === null) return ''
  if (typeof key === 'number') return `Item ${key + 1}`
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

export interface ValidateOptions {
  /** Formatted paths of secrets already stored server-side (they satisfy `required`). */
  storedSecrets?: ReadonlySet<string>
}

/**
 * Checks a value against the subset. Secrets are valid when a new value is set
 * or one is stored (and not being cleared with `null`).
 */
export function validateSchema(input: JsonSchema, value: unknown, options: ValidateOptions = {}, segments: PathSegment[] = [], required = false): SchemaIssue[] {
  const { schema, nullable } = resolveSchema(input)
  const path = formatPath(segments)
  const issue = (message: string): SchemaIssue[] => [{ path, segments, message }]
  const kind = fieldKind(schema)

  if (kind === 'secret') {
    const stored = options.storedSecrets?.has(path) ?? false
    const present = typeof value === 'string' ? value !== '' : value === undefined && stored
    return required && !present ? issue('Required') : []
  }
  if (isEmpty(value)) {
    if (value === null && nullable) return []
    return required ? issue('Required') : []
  }

  switch (kind) {
    case 'enum': {
      const allowed = enumOptions(schema).map((o) => o.value)
      return allowed.includes(value as JsonPrimitive) ? [] : issue('Choose one of the listed values')
    }
    case 'string': {
      if (typeof value !== 'string') return issue('Must be text')
      if (schema.minLength !== undefined && value.length < schema.minLength) return issue(`At least ${schema.minLength} characters`)
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return issue(`At most ${schema.maxLength} characters`)
      if (schema.format === 'email' && !EMAIL.test(value)) return issue('Enter a valid email address')
      if ((schema.format === 'uri' || schema.format === 'url') && !isUrl(value)) return issue('Enter a valid URL (https://…)')
      if (schema.pattern !== undefined) {
        try {
          if (!new RegExp(schema.pattern, 'u').test(value)) return issue('Does not match the expected format')
        } catch {
          return []
        }
      }
      return []
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value)) return issue('Must be a number')
      if (kind === 'integer' && !Number.isInteger(value)) return issue('Must be a whole number')
      if (schema.minimum !== undefined && value < schema.minimum) return issue(`Must be at least ${schema.minimum}`)
      if (schema.maximum !== undefined && value > schema.maximum) return issue(`Must be at most ${schema.maximum}`)
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) return issue(`Must be more than ${schema.exclusiveMinimum}`)
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) return issue(`Must be less than ${schema.exclusiveMaximum}`)
      return []
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : issue('Must be true or false')
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return issue('Must be an object')
      const record = value as Record<string, unknown>
      const requiredKeys = new Set(schema.required ?? [])
      return Object.entries(schema.properties ?? {}).flatMap(([key, child]) =>
        validateSchema(child, record[key], options, [...segments, key], requiredKeys.has(key)),
      )
    }
    case 'array': {
      if (!Array.isArray(value)) return issue('Must be a list')
      if (schema.minItems !== undefined && value.length < schema.minItems) return issue(`Add at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`)
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return issue(`At most ${schema.maxItems} items`)
      const items = schema.items ?? {}
      return value.flatMap((item, i) => validateSchema(items, item, options, [...segments, i], true))
    }
    default:
      return []
  }
}
