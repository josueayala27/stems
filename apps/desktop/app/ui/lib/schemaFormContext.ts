import type { Component, InjectionKey, Ref, Slot } from 'vue'
import type { PathSegment } from './jsonPath'
import type { JsonSchema, SchemaFieldKind } from './jsonSchema'

/** Props of SchemaForm's `field` and `field:<path>` slots. */
export interface SchemaFieldSlotProps {
  /** Formatted path, e.g. `auth.headers[0].value` (`''` for a primitive root). */
  path: string
  segments: PathSegment[]
  /** The field's schema with nullable wrappers removed. */
  schema: JsonSchema
  kind: SchemaFieldKind
  value: unknown
  /** Writes this field; `undefined` removes the key from its object. */
  update: (value: unknown) => void
  /** Marks the field as visited so its validation message shows. */
  touch: () => void
  /** Id the field label points at (`<label for>`); put it on your control. */
  id: string
  label: string
  required: boolean
  invalid: boolean
  /** Validation message shown under the field, if any. */
  error: string | undefined
  disabled: boolean
  /** The built-in control for this field, to render inside a wrapper. */
  Default: Component
}

export interface SchemaFormContext {
  update: (segments: PathSegment[], value: unknown) => void
  touch: (path: string) => void
  errorFor: (path: string) => string | undefined
  storedSecrets: Ref<ReadonlySet<string>>
  disabled: Ref<boolean>
  idPrefix: string
  slots: Record<string, Slot | undefined>
}

export const SCHEMA_FORM: InjectionKey<SchemaFormContext> = Symbol('SchemaForm')
