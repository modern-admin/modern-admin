import { describe, expect, test } from 'bun:test'
import { parseDateValue } from '../src/utils/date.js'
import { coerceScalar } from '../src/adapters/filter-coerce.js'

// ---------------------------------------------------------------------------
// parseDateValue — offset-less date-times mean UTC, not "the server's TZ"
// ---------------------------------------------------------------------------
//
// `new Date('2026-08-04T15:00')` resolves against `process.env.TZ`, so the
// exact same payload used to store a different instant depending on where the
// API ran, and every browser→server→browser round trip shifted the value again
// by the timezone gap. These assertions are absolute (`...Z`), so they fail if
// the local-time behaviour ever comes back — regardless of the TZ the suite
// runs under.

describe('parseDateValue', () => {
  test('reads an offset-less date-time as UTC', () => {
    expect(parseDateValue('2026-08-04T15:00').toISOString()).toBe('2026-08-04T15:00:00.000Z')
  })

  test('accepts seconds and milliseconds', () => {
    expect(parseDateValue('2026-08-04T15:00:30').toISOString()).toBe('2026-08-04T15:00:30.000Z')
    expect(parseDateValue('2026-08-04T15:00:30.250').toISOString()).toBe('2026-08-04T15:00:30.250Z')
  })

  test('accepts a space separator (form posts, hand-written payloads)', () => {
    expect(parseDateValue('2026-08-04 15:00').toISOString()).toBe('2026-08-04T15:00:00.000Z')
  })

  test('preserves an explicit offset instead of overriding it', () => {
    expect(parseDateValue('2026-08-04T15:00:00+03:00').toISOString()).toBe(
      '2026-08-04T12:00:00.000Z',
    )
    expect(parseDateValue('2026-08-04T15:00:00.000Z').toISOString()).toBe(
      '2026-08-04T15:00:00.000Z',
    )
  })

  test('date-only stays UTC midnight', () => {
    expect(parseDateValue('2026-08-04').toISOString()).toBe('2026-08-04T00:00:00.000Z')
  })

  test('surfaces unparseable input as an Invalid Date', () => {
    expect(Number.isNaN(parseDateValue('not-a-date').getTime())).toBe(true)
  })
})

// Filters go through the same parse, so a datetime range bound must not drift
// either — an off-by-offset `gte` silently returns the wrong rows.
describe('coerceScalar (datetime)', () => {
  const datetime = { type: () => 'datetime' as const }

  test('coerces an offset-less bound to the UTC instant', () => {
    const coerced = coerceScalar('2026-08-04T15:00', datetime)
    expect(coerced).toBeInstanceOf(Date)
    expect((coerced as Date).toISOString()).toBe('2026-08-04T15:00:00.000Z')
  })

  test('leaves an unparseable value as-is for the adapter to reject', () => {
    expect(coerceScalar('tomorrow', datetime)).toBe('tomorrow')
  })
})
