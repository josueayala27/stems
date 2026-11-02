export interface MenuItem {
  type?: 'item'
  id: string
  label: string
  /** Lucide icon name, e.g. `'lucide:copy'`. */
  icon?: string
  /** Shortcut hint like `'Mod+D'`, rendered with platform symbols. */
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  /** Shows a check mark (toggle items). */
  checked?: boolean
}

export interface MenuSeparator {
  type: 'separator'
}

export interface MenuGroupLabel {
  type: 'label'
  label: string
}

export type MenuEntry = MenuItem | MenuSeparator | MenuGroupLabel

export function isMenuItem(entry: MenuEntry): entry is MenuItem {
  return entry.type === undefined || entry.type === 'item'
}

export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
  icon?: string
  disabled?: boolean
}

export interface SegmentOption<T extends string | number = string> {
  value: T
  /** Text label; omit for icon-only segments (then `title` is required for a11y). */
  label?: string
  icon?: string
  title?: string
  disabled?: boolean
  /** Small accent dot in the corner (e.g. "has overrides"). */
  dot?: boolean
}

export interface TabItem<T extends string = string> {
  value: T
  label: string
  icon?: string
  disabled?: boolean
}

export type ControlSize = 'sm' | 'md'

/** A site colour token; ColorField writes it as `var(--color-<key>)`. */
export interface ColorToken {
  key: string
  /** Resolved colour used for display (the editor DOM does not define site variables). */
  value: string
  name?: string
}

export function colorTokenVar(key: string): string {
  return `var(--color-${key})`
}

export interface DataTableColumn<Row = unknown> {
  /** Unique column id; also the default accessor (`row[key]`) and the cell slot name `cell-<key>`. */
  key: string
  header: string
  /** Value for display and sorting. Defaults to `row[key]`. */
  accessor?: (row: Row) => unknown
  sortable?: boolean
  /** CSS width, e.g. `'120px'` or `'30%'`. Columns without one share the rest. */
  width?: string
  align?: 'left' | 'center' | 'right'
  /** Hides the header text visually (it stays for screen readers), e.g. for action columns. */
  hideHeader?: boolean
}

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  /** Lucide icon name. */
  icon?: string
  disabled?: boolean
}

/** One row of KeyValueEditor. */
export interface KeyValuePair<V = string> {
  key: string
  value: V
}

/** One pane of SplitPane. Its content is the slot named after `id`. */
export interface SplitPaneItem {
  id: string
  /** Smallest size in px. */
  min?: number
  /** Largest size in px. */
  max?: number
  /** Names the separator after this pane: "Resize {label}". Defaults to `id`. */
  label?: string
}
