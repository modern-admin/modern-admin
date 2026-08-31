import {
  filterCriterionZ,
  type FilterCriterion,
  type FilterInput,
  type FilterMap,
} from '@modern-admin/core'

const FILTER_KEY = /^filters\[([^\]]+)](?:\[([^\]]+)])?(\[\])?$/

/** Append collision-free filter parameters using standard qs bracket notation. */
export function appendFilterQuery(params: URLSearchParams, filters: FilterMap): void {
  for (const [path, input] of Object.entries(filters)) {
    const parsed = filterCriterionZ.safeParse(input)
    if (!parsed.success) {
      if (Array.isArray(input)) {
        params.set(`filters[${path}][operator]`, 'in')
        for (const value of input) params.append(`filters[${path}][values][]`, String(value))
      } else if (input !== null && typeof input === 'object') {
        const range = input as { from?: string; to?: string }
        params.set(`filters[${path}][operator]`, 'between')
        if (range.from !== undefined) params.set(`filters[${path}][from]`, range.from)
        if (range.to !== undefined) params.set(`filters[${path}][to]`, range.to)
      } else if (input !== '' && input != null) {
        params.set(`filters[${path}]`, String(input))
      }
      continue
    }

    const filter = parsed.data
    params.set(`filters[${path}][operator]`, filter.operator)
    if ('value' in filter) {
      params.set(`filters[${path}][value]`, String(filter.value ?? ''))
    } else if (filter.operator === 'in') {
      for (const value of filter.values) {
        params.append(`filters[${path}][values][]`, String(value))
      }
    } else if (filter.operator === 'between') {
      if (filter.from !== undefined) params.set(`filters[${path}][from]`, filter.from)
      if (filter.to !== undefined) params.set(`filters[${path}][to]`, filter.to)
    }
  }
}

/** Parse both new bracketed criteria and legacy scalar filter parameters. */
export function parseFilterQuery(params: URLSearchParams): FilterMap | undefined {
  const filters: FilterMap = {}
  const structured = new Map<string, Record<string, unknown>>()

  params.forEach((value, key) => {
    const match = FILTER_KEY.exec(key)
    const path = match?.[1]
    if (!path) return
    const member = match[2]
    if (!member) {
      if (value !== '') filters[path] = value
      return
    }

    const candidate = structured.get(path) ?? {}
    if (member === 'values') {
      const values = (candidate.values as string[] | undefined) ?? []
      values.push(value)
      candidate.values = values
    } else {
      candidate[member] = value
    }
    structured.set(path, candidate)
  })

  for (const [path, candidate] of structured) {
    const parsed = filterCriterionZ.safeParse(candidate)
    if (parsed.success) filters[path] = parsed.data
  }

  return Object.keys(filters).length ? filters : undefined
}

export const isActiveFilter = (value: FilterInput | undefined): value is FilterInput =>
  value !== undefined && value !== null && value !== ''

export type { FilterCriterion }
