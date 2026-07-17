import { describe, expect, it } from 'bun:test'
import {
  applyTransform,
  transformSeries,
  makeValueFormatter,
  makeAxisFormatter,
} from '../src/dashboard/value-format.js'
import type { ChartTransformStep } from '@modern-admin/core'

describe('applyTransform', () => {
  it('returns the value untouched without steps', () => {
    expect(applyTransform(1234, undefined)).toBe(1234)
    expect(applyTransform(1234, [])).toBe(1234)
  })

  it('applies steps in order (fold, not commutative shuffle)', () => {
    const steps: ChartTransformStep[] = [
      { op: 'add', value: 100 },
      { op: 'divide', value: 2 },
    ]
    // (100 + 100) / 2 = 100 — order matters: divide-then-add would be 150.
    expect(applyTransform(100, steps)).toBe(100)
  })

  it('supports all four ops', () => {
    expect(applyTransform(100, [{ op: 'divide', value: 100 }])).toBe(1)
    expect(applyTransform(100, [{ op: 'multiply', value: 3 }])).toBe(300)
    expect(applyTransform(100, [{ op: 'add', value: 5 }])).toBe(105)
    expect(applyTransform(100, [{ op: 'subtract', value: 5 }])).toBe(95)
  })

  it('skips divide-by-zero steps instead of producing Infinity', () => {
    expect(
      applyTransform(100, [
        { op: 'divide', value: 0 },
        { op: 'multiply', value: 2 },
      ]),
    ).toBe(200)
  })
})

describe('transformSeries', () => {
  it('maps every point of every series and keeps other fields', () => {
    const series = [
      { key: 'a', points: [{ date: '2026-01-01', value: 100 }, { date: '2026-01-02', value: 250 }] },
      { key: 'b', points: [{ date: '2026-01-01', value: 0 }] },
    ]
    const out = transformSeries(series, [{ op: 'divide', value: 100 }])
    expect(out[0]!.key).toBe('a')
    expect(out[0]!.points.map((p) => p.value)).toEqual([1, 2.5])
    expect(out[1]!.points[0]!.value).toBe(0)
    // Source untouched
    expect(series[0]!.points[0]!.value).toBe(100)
  })
})

describe('makeValueFormatter', () => {
  it('defaults to plain locale number formatting', () => {
    expect(makeValueFormatter(undefined, 'en-US')(1234567.5)).toBe('1,234,567.5')
  })

  it('formats currency with fallback USD', () => {
    const fmt = makeValueFormatter({ style: 'currency' }, 'en-US')
    expect(fmt(12.34)).toBe('$12.34')
    const eur = makeValueFormatter({ style: 'currency', currency: 'EUR' }, 'en-US')
    expect(eur(12.34)).toBe('€12.34')
  })

  it('formats percent with Intl semantics (0.42 → 42%)', () => {
    expect(makeValueFormatter({ style: 'percent' }, 'en-US')(0.42)).toBe('42%')
  })

  it('honours decimals, compact, prefix and suffix', () => {
    const fmt = makeValueFormatter(
      { style: 'number', decimals: 2, prefix: '~', suffix: ' ms' },
      'en-US',
    )
    expect(fmt(3.14159)).toBe('~3.14 ms')
    const compact = makeValueFormatter({ style: 'number', compact: true }, 'en-US')
    expect(compact(1_250_000)).toBe('1.3M')
  })

  it('passes non-finite values through as strings', () => {
    expect(makeValueFormatter(undefined, 'en-US')(Number.NaN)).toBe('NaN')
  })
})

describe('makeAxisFormatter', () => {
  it('is compact by default with at most one fraction digit', () => {
    const fmt = makeAxisFormatter(undefined, 'en-US')
    expect(fmt(12_500)).toBe('12.5K')
    expect(fmt(1_200_000)).toBe('1.2M')
    expect(fmt(950)).toBe('950')
  })

  it('keeps currency style but stays compact', () => {
    const fmt = makeAxisFormatter({ style: 'currency', currency: 'USD' }, 'en-US')
    expect(fmt(1_200_000)).toBe('$1.2M')
  })
})
