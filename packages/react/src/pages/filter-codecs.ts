// Filter operator codecs for the list page.
//
// Operators are encoded in the filter value string as `OPERATOR:VALUE`, which
// travels through the URL hash / controlled query state. These pure functions
// are the single boundary between that wire format and the structured
// `{ op, val }` / `{ op, from, to }` shapes the filter UIs work with. Kept
// framework-free so they're unit-testable without React.

// ─── String filters ─────────────────────────────────────────────────────────
// Legacy values (no prefix) default to `co` (contains) for strings.

export type StringFilterOp =
  | 'co'
  | 'nco'
  | 'sw'
  | 'ew'
  | 'eq'
  | 'neq'
  | 'empty'
  | 'nempty'
  | 'in'

const STRING_OPS: ReadonlySet<string> = new Set(['co', 'nco', 'sw', 'ew', 'eq', 'neq', 'empty', 'nempty', 'in'])
export const ALL_STRING_OPS: StringFilterOp[] = ['co', 'nco', 'sw', 'ew', 'in', 'empty', 'nempty']
export const NULLARY_OPS: ReadonlySet<string> = new Set(['empty', 'nempty'])

/** Max distinct values for which a string filter defaults to "is one of"
 *  (checkbox list). Fields with more choices default to "contains". */
export const ONE_OF_DEFAULT_MAX = 10

export function parseFilterString(raw: string): { op: StringFilterOp; val: string } {
  if (!raw) return { op: 'co', val: '' }
  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) return { op: 'co', val: raw }
  const prefix = raw.slice(0, colonIdx)
  if (STRING_OPS.has(prefix)) return { op: prefix as StringFilterOp, val: raw.slice(colonIdx + 1) }
  return { op: 'co', val: raw }
}

export function encodeFilter(op: StringFilterOp, val: string): string {
  if (op === 'empty' || op === 'nempty') return `${op}:`
  // Unchecking the last item in the "Is one of" picker ⇒ no filter.
  // We deliberately do NOT emit `in:` here: it would survive
  // `setDraftFilter`'s empty-string guard and ship a phantom
  // `filters[col]=in:` URL param (and a "1 active filter" badge) while
  // the adapter layer drops the clause anyway. The operator resets to
  // `co` on close, but `StringFilterField`'s auto-switch re-promotes
  // low-cardinality fields back to `in` the next time the panel opens.
  if (op === 'in') return val ? `in:${val}` : ''
  if (!val) return ''
  return `${op}:${val}`
}

// ─── Numeric filters ─────────────────────────────────────────────────────────

export type NumericFilterOp = 'eq' | 'neq' | 'gt' | 'lt' | 'between' | 'empty' | 'nempty'

const NUMERIC_OP_SET = new Set<string>(['eq', 'neq', 'gt', 'lt', 'between', 'empty', 'nempty'])
export const ALL_NUMERIC_OPS: NumericFilterOp[] = ['eq', 'neq', 'gt', 'lt', 'between', 'empty', 'nempty']
export const NUMERIC_NULLARY: ReadonlySet<string> = new Set(['empty', 'nempty'])

export function parseNumericFilter(raw: string): { op: NumericFilterOp; from: string; to: string } {
  if (!raw) return { op: 'eq', from: '', to: '' }
  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) return { op: 'eq', from: raw, to: '' }
  const prefix = raw.slice(0, colonIdx)
  if (!NUMERIC_OP_SET.has(prefix)) return { op: 'eq', from: raw, to: '' }
  const rest = raw.slice(colonIdx + 1)
  if (prefix === 'between') {
    const commaIdx = rest.indexOf(',')
    return commaIdx !== -1
      ? { op: 'between', from: rest.slice(0, commaIdx), to: rest.slice(commaIdx + 1) }
      : { op: 'between', from: rest, to: '' }
  }
  return { op: prefix as NumericFilterOp, from: rest, to: '' }
}

export function encodeNumericFilter(op: NumericFilterOp, from: string, to: string): string {
  if (op === 'empty' || op === 'nempty') return `${op}:`
  if (op === 'between') return (from || to) ? `between:${from},${to}` : ''
  return from ? `${op}:${from}` : ''
}
