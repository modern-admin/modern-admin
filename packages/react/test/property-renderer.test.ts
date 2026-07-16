import { describe, expect, test } from 'bun:test'
import { formatDate } from '../src/property-renderer.js'

describe('formatDate', () => {
  test('returns empty string for null/undefined', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })

  test('date-only (withTime=false) truncates to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-07-16T14:32:00.000Z'))).toBe('2026-07-16')
    expect(formatDate('2026-07-16T14:32:00.000Z')).toBe('2026-07-16')
  })

  test('datetime (withTime=true) includes hours and minutes', () => {
    expect(formatDate(new Date('2026-07-16T14:32:00.000Z'), true)).toBe('2026-07-16 14:32')
    expect(formatDate('2026-07-16T14:32:00.000Z', true)).toBe('2026-07-16 14:32')
  })

  test('datetime truncates seconds/milliseconds, keeps minute precision', () => {
    expect(formatDate('2026-07-16T14:32:59.999Z', true)).toBe('2026-07-16 14:32')
  })

  test('returns the raw string for unparsable values', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatDate('not-a-date', true)).toBe('not-a-date')
  })
})
