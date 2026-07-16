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

  const localExpected = (iso: string): string => {
    const d = new Date(iso)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`
    )
  }

  test('datetime (withTime=true) includes hours and minutes in local time', () => {
    const expected = localExpected('2026-07-16T14:32:00.000Z')
    expect(formatDate(new Date('2026-07-16T14:32:00.000Z'), true)).toBe(expected)
    expect(formatDate('2026-07-16T14:32:00.000Z', true)).toBe(expected)
  })

  test('datetime truncates seconds/milliseconds, keeps minute precision', () => {
    expect(formatDate('2026-07-16T14:32:59.999Z', true)).toBe(
      localExpected('2026-07-16T14:32:59.999Z'),
    )
  })

  test('returns the raw string for unparsable values', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatDate('not-a-date', true)).toBe('not-a-date')
  })
})
