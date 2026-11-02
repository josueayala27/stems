// File filtering for FileDrop: the same rules as the native `accept` attribute, which drag and drop ignores.

export type FileRejectReason = 'type' | 'size' | 'count'

export interface FileRejection {
  file: File
  reason: FileRejectReason
}

interface FileLike {
  name: string
  type: string
  size: number
}

/** `accept` like `'image/*,.pdf,application/json'`; empty accepts everything. */
export function acceptsFile(file: Pick<FileLike, 'name' | 'type'>, accept: string | undefined): boolean {
  const rules = (accept ?? '')
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
  if (rules.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

export interface FileCheckOptions {
  accept?: string
  /** Bytes. */
  maxSize?: number
  multiple?: boolean
}

export function checkFiles<F extends FileLike>(files: readonly F[], options: FileCheckOptions): { accepted: F[]; rejected: Array<{ file: F; reason: FileRejectReason }> } {
  const accepted: F[] = []
  const rejected: Array<{ file: F; reason: FileRejectReason }> = []
  for (const file of files) {
    if (!acceptsFile(file, options.accept)) rejected.push({ file, reason: 'type' })
    else if (options.maxSize !== undefined && file.size > options.maxSize) rejected.push({ file, reason: 'size' })
    else if (options.multiple === false && accepted.length > 0) rejected.push({ file, reason: 'count' })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
