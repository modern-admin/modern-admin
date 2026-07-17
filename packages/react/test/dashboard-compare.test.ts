import { describe, expect, it } from 'bun:test'
import {
  serverPreviousRangeOf,
  alignPreviousSeries,
  sumSeries,
  computeDelta,
  PREVIOUS_KEY_PREFIX,
} from '../src/dashboard/compare.js'
import { generateBuckets } from '../src/dashboard/time-series.js'

describe('serverPreviousRangeOf', () => {
  it('returns the equal-length window ending the day before the current one', () => {
    // 30d preset resolved window: 31 inclusive days.
    expect(serverPreviousRangeOf({ from: '2026-06-16', to: '2026-07-16' })).toEqual({
      from: '2026-05-16',
      to: '2026-06-15',
    })
  })

  it('handles a single-day window', () => {
    expect(serverPreviousRangeOf({ from: '2026-07-16', to: '2026-07-16' })).toEqual({
      from: '2026-07-15',
      to: '2026-07-15',
    })
  })

  it('returns null for invalid or inverted ranges', () => {
    expect(serverPreviousRangeOf({ from: 'nope', to: '2026-07-16' })).toBeNull()
    expect(serverPreviousRangeOf({ from: '2026-07-16', to: '2026-07-01' })).toBeNull()
  })

  it('matches the adapter formula bucket-wise for day step', () => {
    // Adapter: prevTo = from(start-of-day), prevFrom = from − (N days − 1ms).
    // Data buckets it can return: [from−N .. from−1] plus a degenerate 1 ms
    // bucket at `from` itself; our whole-day window is exactly the former.
    const range = { from: '2026-06-16', to: '2026-07-16' }
    const prev = serverPreviousRangeOf(range)!
    const cur = generateBuckets(range.from, range.to, 'day')
    const prevBuckets = generateBuckets(prev.from, prev.to, 'day')
    expect(prevBuckets.length).toBe(cur.length)
    expect(prevBuckets[prevBuckets.length - 1]).toBe('2026-06-15')
  })
})

describe('alignPreviousSeries', () => {
  const currentBuckets = generateBuckets('2026-07-01', '2026-07-05', 'day')

  it('re-plots previous points onto current buckets keeping sourceDate', () => {
    const prevRange = { from: '2026-06-26', to: '2026-06-30' }
    const aligned = alignPreviousSeries(
      [{ key: '__total__', points: [
        { date: '2026-06-26', value: 10 },
        { date: '2026-06-28', value: 30 },
      ] }],
      prevRange,
      currentBuckets,
      'day',
    )
    expect(aligned).toHaveLength(1)
    const s = aligned[0]!
    expect(s.key).toBe(`${PREVIOUS_KEY_PREFIX}__total__`)
    expect(s.sourceKey).toBe('__total__')
    expect(s.points).toEqual([
      { date: '2026-07-01', value: 10, sourceDate: '2026-06-26' },
      { date: '2026-07-02', value: 0, sourceDate: '2026-06-27' },
      { date: '2026-07-03', value: 30, sourceDate: '2026-06-28' },
      { date: '2026-07-04', value: 0, sourceDate: '2026-06-29' },
      { date: '2026-07-05', value: 0, sourceDate: '2026-06-30' },
    ])
  })

  it('end-anchors when the previous window has more buckets', () => {
    // Month step: current window spans 2 month buckets, previous spans 3.
    const curBuckets = ['2026-06-01', '2026-07-01']
    const aligned = alignPreviousSeries(
      [{ key: '__total__', points: [
        { date: '2026-04-01', value: 1 },
        { date: '2026-05-01', value: 2 },
        { date: '2026-06-01', value: 3 },
      ] }],
      { from: '2026-04-20', to: '2026-06-15' },
      curBuckets,
      'month',
    )
    // Last prev bucket pairs with last current bucket.
    expect(aligned[0]!.points).toEqual([
      { date: '2026-06-01', value: 2, sourceDate: '2026-05-01' },
      { date: '2026-07-01', value: 3, sourceDate: '2026-06-01' },
    ])
  })

  it('zero-pads the start when the previous window has fewer buckets', () => {
    const curBuckets = ['2026-05-01', '2026-06-01', '2026-07-01']
    const aligned = alignPreviousSeries(
      [{ key: '__total__', points: [
        { date: '2026-03-01', value: 5 },
        { date: '2026-04-01', value: 7 },
      ] }],
      { from: '2026-03-10', to: '2026-04-20' },
      curBuckets,
      'month',
    )
    expect(aligned[0]!.points).toEqual([
      { date: '2026-05-01', value: 0 },
      { date: '2026-06-01', value: 5, sourceDate: '2026-03-01' },
      { date: '2026-07-01', value: 7, sourceDate: '2026-04-01' },
    ])
  })

  it('returns empty for empty current buckets', () => {
    expect(
      alignPreviousSeries(
        [{ key: '__total__', points: [] }],
        { from: '2026-01-01', to: '2026-01-05' },
        [],
        'day',
      ),
    ).toEqual([])
  })
})

describe('sumSeries / computeDelta', () => {
  it('sums across all series points and returns null for empty input', () => {
    expect(sumSeries(undefined)).toBeNull()
    expect(sumSeries([])).toBeNull()
    expect(
      sumSeries([
        { key: 'a', points: [{ date: 'x', value: 1 }, { date: 'y', value: 2 }] },
        { key: 'b', points: [{ date: 'x', value: 3 }] },
      ]),
    ).toBe(6)
  })

  it('computes signed percent with one decimal', () => {
    expect(computeDelta(550, 3007)).toEqual({ percent: -81.7, direction: 'down' })
    expect(computeDelta(150, 100)).toEqual({ percent: 50, direction: 'up' })
    expect(computeDelta(100, 100)).toEqual({ percent: 0, direction: 'flat' })
  })

  it('returns null when previous is missing or zero', () => {
    expect(computeDelta(100, 0)).toBeNull()
    expect(computeDelta(100, null)).toBeNull()
    expect(computeDelta(null, 100)).toBeNull()
  })
})
