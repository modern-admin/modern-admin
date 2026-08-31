import {
  filterCriterionZ,
  parseOperatorValue,
  type FilterCriterion,
  type FilterInput,
} from '@modern-admin/core'

// Filter controls work with structured criteria. String-prefixed filters are
// parsed only for backwards compatibility with saved URLs and API clients.

export type EncodedFilter = FilterCriterion | null

const criterion = (raw: FilterInput | undefined): FilterCriterion | null => {
  const parsed = filterCriterionZ.safeParse(raw)
  return parsed.success ? parsed.data : null
}

const legacyString = (raw: FilterInput | undefined): string => {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  return ''
}

// ─── String filters ─────────────────────────────────────────────────────────

export type StringFilterOp = 'co' | 'nco' | 'sw' | 'ew' | 'eq' | 'neq' | 'empty' | 'nempty' | 'in'

const STRING_OPS: ReadonlySet<string> = new Set([
  'co',
  'nco',
  'sw',
  'ew',
  'eq',
  'neq',
  'empty',
  'nempty',
  'in',
])
export const ALL_STRING_OPS: StringFilterOp[] = ['co', 'nco', 'sw', 'ew', 'in', 'empty', 'nempty']
export const NULLARY_OPS: ReadonlySet<string> = new Set(['empty', 'nempty'])

/** Max distinct values for which a string filter defaults to "is one of". */
export const ONE_OF_DEFAULT_MAX = 10

export function parseFilterString(raw: FilterInput | undefined): {
  op: StringFilterOp
  val: string
  values: string[]
} {
  const structured = criterion(raw)
  if (structured) {
    if (structured.operator === 'in') {
      return { op: 'in', val: '', values: structured.values.map(String) }
    }
    if (STRING_OPS.has(structured.operator)) {
      return {
        op: structured.operator as StringFilterOp,
        val: 'value' in structured ? String(structured.value ?? '') : '',
        values: [],
      }
    }
  }

  const value = legacyString(raw)
  if (!value) return { op: 'co', val: '', values: [] }
  const parsed = parseOperatorValue(value)
  if (parsed.operator && STRING_OPS.has(parsed.operator)) {
    return {
      op: parsed.operator as StringFilterOp,
      val: parsed.operator === 'in' ? '' : parsed.value,
      values: parsed.operator === 'in' && parsed.value ? parsed.value.split(',') : [],
    }
  }
  return { op: 'co', val: value, values: [] }
}

export function encodeFilter(op: StringFilterOp, val: string): EncodedFilter {
  if (op === 'empty' || op === 'nempty') return { operator: op }
  if (op === 'in') return val ? { operator: 'in', values: [val] } : null
  if (!val) return null
  return { operator: op, value: val }
}

export function encodeInFilterValues(values: Array<string | number>): EncodedFilter {
  return values.length ? { operator: 'in', values } : null
}

// ─── Numeric filters ─────────────────────────────────────────────────────────

export type NumericFilterOp = 'eq' | 'neq' | 'gt' | 'lt' | 'between' | 'empty' | 'nempty'

const NUMERIC_OP_SET = new Set<string>(['eq', 'neq', 'gt', 'lt', 'between', 'empty', 'nempty'])
export const ALL_NUMERIC_OPS: NumericFilterOp[] = [
  'eq',
  'neq',
  'gt',
  'lt',
  'between',
  'empty',
  'nempty',
]
export const NUMERIC_NULLARY: ReadonlySet<string> = new Set(['empty', 'nempty'])

export function parseNumericFilter(raw: FilterInput | undefined): {
  op: NumericFilterOp
  from: string
  to: string
} {
  const structured = criterion(raw)
  if (structured) {
    if (structured.operator === 'between') {
      return { op: 'between', from: structured.from ?? '', to: structured.to ?? '' }
    }
    if (NUMERIC_OP_SET.has(structured.operator)) {
      return {
        op: structured.operator as NumericFilterOp,
        from: 'value' in structured ? String(structured.value ?? '') : '',
        to: '',
      }
    }
  }

  const value = legacyString(raw)
  if (!value) return { op: 'eq', from: '', to: '' }
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1) return { op: 'eq', from: value, to: '' }
  const prefix = value.slice(0, colonIdx)
  if (!NUMERIC_OP_SET.has(prefix)) return { op: 'eq', from: value, to: '' }
  const rest = value.slice(colonIdx + 1)
  if (prefix === 'between') {
    const commaIdx = rest.indexOf(',')
    return commaIdx !== -1
      ? { op: 'between', from: rest.slice(0, commaIdx), to: rest.slice(commaIdx + 1) }
      : { op: 'between', from: rest, to: '' }
  }
  return { op: prefix as NumericFilterOp, from: rest, to: '' }
}

export function encodeNumericFilter(op: NumericFilterOp, from: string, to: string): EncodedFilter {
  if (op === 'empty' || op === 'nempty') return { operator: op }
  if (op === 'between') {
    return from || to
      ? {
          operator: 'between',
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }
      : null
  }
  return from ? { operator: op, value: from } : null
}

// ─── Reference and choice filters ───────────────────────────────────────────

export type ReferenceFilterOp = 'eq' | 'neq' | 'empty' | 'nempty'

const REFERENCE_OP_SET = new Set<string>(['eq', 'neq', 'empty', 'nempty'])
export const ALL_REFERENCE_OPS: ReferenceFilterOp[] = ['eq', 'neq', 'empty', 'nempty']
export const REFERENCE_NULLARY: ReadonlySet<string> = new Set(['empty', 'nempty'])

export function parseReferenceFilter(raw: FilterInput | undefined): {
  op: ReferenceFilterOp
  val: string
} {
  const structured = criterion(raw)
  if (structured && REFERENCE_OP_SET.has(structured.operator)) {
    return {
      op: structured.operator as ReferenceFilterOp,
      val: 'value' in structured ? String(structured.value ?? '') : '',
    }
  }

  const value = legacyString(raw)
  if (!value) return { op: 'eq', val: '' }
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1) return { op: 'eq', val: value }
  const prefix = value.slice(0, colonIdx)
  if (!REFERENCE_OP_SET.has(prefix)) return { op: 'eq', val: value }
  return { op: prefix as ReferenceFilterOp, val: value.slice(colonIdx + 1) }
}

export function encodeReferenceFilter(op: ReferenceFilterOp, val: string): EncodedFilter {
  if (op === 'empty' || op === 'nempty') return { operator: op }
  return val ? { operator: op, value: val } : null
}

// ─── Date filters ───────────────────────────────────────────────────────────

export type DateFilterOp = 'between' | 'empty' | 'nempty'

const DATE_OP_SET = new Set<string>(['between', 'empty', 'nempty'])
export const ALL_DATE_OPS: DateFilterOp[] = ['between', 'empty', 'nempty']
export const DATE_NULLARY: ReadonlySet<string> = new Set(['empty', 'nempty'])

export function parseDateFilter(raw: FilterInput | undefined): {
  op: DateFilterOp
  from: string
  to: string
} {
  const structured = criterion(raw)
  if (structured) {
    if (structured.operator === 'between') {
      return { op: 'between', from: structured.from ?? '', to: structured.to ?? '' }
    }
    if (DATE_OP_SET.has(structured.operator)) {
      return { op: structured.operator as DateFilterOp, from: '', to: '' }
    }
  }

  const value = legacyString(raw)
  if (!value) return { op: 'between', from: '', to: '' }
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1) return { op: 'between', from: value, to: '' }
  const prefix = value.slice(0, colonIdx)
  if (!DATE_OP_SET.has(prefix)) return { op: 'between', from: value, to: '' }
  if (prefix === 'between') {
    const rest = value.slice(colonIdx + 1)
    const commaIdx = rest.indexOf(',')
    return commaIdx === -1
      ? { op: 'between', from: rest, to: '' }
      : { op: 'between', from: rest.slice(0, commaIdx), to: rest.slice(commaIdx + 1) }
  }
  return { op: prefix as DateFilterOp, from: '', to: '' }
}

export function encodeDateFilter(op: DateFilterOp, from: string, to: string): EncodedFilter {
  if (DATE_NULLARY.has(op)) return { operator: op }
  return from || to
    ? {
        operator: 'between',
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }
    : null
}
