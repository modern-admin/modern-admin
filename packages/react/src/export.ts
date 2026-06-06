// Client-side export helpers.
//
// Pulls every record matching the current list query by paginating with a
// large pageSize, then serializes to CSV or JSON and triggers a browser
// download. Pure functions live here so they're trivially unit-testable;
// the dialog UI in pages/export-dialog.tsx wires them together.

import type { AdminClient } from './client.js'
import type { ListQuery, PropertyJSON, RecordJSON } from './types.js'

export type ExportFormat = 'csv' | 'json'

export interface FetchAllOptions {
  /** Page size used for each list request. */
  batchSize?: number
  /** Optional progress callback: `(loaded, total)`. */
  onProgress?(loaded: number, total: number): void
  /** AbortSignal — drop pagination loop on cancel. */
  signal?: AbortSignal
}

/**
 * Page through `client.list()` until exhausted, returning every record that
 * matches the same filters/sorting as the current list view. `query.page`
 * and `query.perPage` are overwritten — pass the user's filters/sorting only.
 */
export async function fetchAllRecords(
  client: AdminClient,
  resourceId: string,
  query: ListQuery | undefined,
  opts: FetchAllOptions = {},
): Promise<RecordJSON[]> {
  // Backend caps `perPage` at 200 (see listQueryZ in @modern-admin/nest).
  const batchSize = opts.batchSize ?? 200
  const baseQuery: ListQuery = { ...(query ?? {}), perPage: batchSize, page: 1 }
  const all: RecordJSON[] = []
  let total = 0
  for (let page = 1; ; page++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const res = await client.list(resourceId, { ...baseQuery, page })
    total = res.meta.total
    all.push(...res.records)
    opts.onProgress?.(all.length, total)
    if (res.records.length < batchSize) break
    if (all.length >= total) break
  }
  return all
}

/** Escape a single CSV field per RFC 4180 (wrap in quotes when needed). */
export function csvEscape(value: unknown): string {
  if (value == null) return ''
  let str: string
  if (typeof value === 'string') str = value
  else if (typeof value === 'number' || typeof value === 'boolean') str = String(value)
  else if (value instanceof Date) str = value.toISOString()
  else str = JSON.stringify(value)
  // Quote if it contains comma, quote, CR or LF.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export interface SerializeOptions {
  /** Properties to export in this order. Defaults to union of keys in `records`. */
  properties?: PropertyJSON[]
  /** When provided, the active list query is embedded as a comment at the top
   *  of the exported file so the export is self-documenting:
   *  – CSV: `# Query: {...}` line before the header row
   *  – JSON: `// Query: {...}` line before the JSON array  */
  query?: ListQuery
}

/** Build a CSV document for the given records. UTF-8 BOM for Excel friendliness. */
export function recordsToCsv(records: RecordJSON[], opts: SerializeOptions = {}): string {
  const columns = opts.properties
    ? opts.properties.map((p) => ({ path: p.path, label: p.label }))
    : columnsFromRecords(records)
  const header = columns.map((c) => csvEscape(c.label)).join(',')
  const lines = records.map((r) =>
    columns.map((c) => csvEscape(r.params[c.path])).join(','),
  )
  const queryComment = opts.query
    ? `# Query: ${JSON.stringify(opts.query)}\r\n`
    : ''
  return `\uFEFF${queryComment}${[header, ...lines].join('\r\n')}`
}

/** Build a pretty-printed JSON document for the given records.
 *  When `opts.query` is set, a `// Query: ...` comment is prepended so the
 *  export is self-documenting (JSONC — understood by VS Code, TypeScript, etc.) */
export function recordsToJson(records: RecordJSON[], opts: SerializeOptions = {}): string {
  const paths = opts.properties?.map((p) => p.path)
  const items = records.map((r) => {
    if (!paths) return { id: r.id, ...r.params }
    const row: Record<string, unknown> = { id: r.id }
    for (const p of paths) row[p] = r.params[p]
    return row
  })
  const json = JSON.stringify(items, null, 2)
  return opts.query ? `// Query: ${JSON.stringify(opts.query)}\n${json}` : json
}

function columnsFromRecords(records: RecordJSON[]): { path: string; label: string }[] {
  const seen = new Set<string>()
  const out: { path: string; label: string }[] = []
  for (const r of records) {
    for (const k of Object.keys(r.params)) {
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ path: k, label: k })
    }
  }
  return out
}

/** Trigger a browser download for the given text payload. */
export function downloadText(filename: string, mime: string, body: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([body], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after a tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Build a stable filename like `users-20260506-143015.csv`. */
export function exportFilename(resourceId: string, format: ExportFormat, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${resourceId}-${stamp}.${format}`
}
