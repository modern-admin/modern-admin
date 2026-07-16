import { describe, expect, test } from 'bun:test'
import {
  encodeFilter,
  encodeNumericFilter,
  parseFilterString,
  parseNumericFilter,
} from '../src/pages/filter-codecs.js'

describe('parseFilterString', () => {
  test('empty input defaults to contains', () => {
    expect(parseFilterString('')).toEqual({ op: 'co', val: '' })
  })

  test('bare value (no prefix) defaults to contains', () => {
    expect(parseFilterString('ada')).toEqual({ op: 'co', val: 'ada' })
  })

  test('recognised operator prefix splits at the first colon', () => {
    expect(parseFilterString('sw:ada')).toEqual({ op: 'sw', val: 'ada' })
    expect(parseFilterString('eq:foo')).toEqual({ op: 'eq', val: 'foo' })
  })

  test('nullary operators keep an empty value', () => {
    expect(parseFilterString('empty:')).toEqual({ op: 'empty', val: '' })
    expect(parseFilterString('nempty:')).toEqual({ op: 'nempty', val: '' })
  })

  test('value may itself contain colons', () => {
    expect(parseFilterString('co:a:b:c')).toEqual({ op: 'co', val: 'a:b:c' })
  })

  test('unknown prefix is treated as a literal contains value', () => {
    expect(parseFilterString('http://x')).toEqual({ op: 'co', val: 'http://x' })
  })

  test('in operator preserves the comma-joined value', () => {
    expect(parseFilterString('in:a,b,c')).toEqual({ op: 'in', val: 'a,b,c' })
  })
})

describe('encodeFilter', () => {
  test('nullary operators encode with a trailing colon regardless of value', () => {
    expect(encodeFilter('empty', '')).toBe('empty:')
    expect(encodeFilter('nempty', 'ignored')).toBe('nempty:')
  })

  test('empty value on a value-taking operator yields no filter', () => {
    expect(encodeFilter('co', '')).toBe('')
    expect(encodeFilter('eq', '')).toBe('')
  })

  test('value-taking operator encodes op:value', () => {
    expect(encodeFilter('co', 'ada')).toBe('co:ada')
    expect(encodeFilter('sw', 'foo')).toBe('sw:foo')
  })

  test('in with a value encodes, empty in drops the filter', () => {
    expect(encodeFilter('in', 'a,b')).toBe('in:a,b')
    expect(encodeFilter('in', '')).toBe('')
  })

  test('round-trips through parse', () => {
    for (const raw of ['co:ada', 'sw:x', 'empty:', 'nempty:', 'in:a,b,c', 'eq:1']) {
      const { op, val } = parseFilterString(raw)
      expect(encodeFilter(op, val)).toBe(raw)
    }
  })
})

describe('parseNumericFilter', () => {
  test('empty input defaults to eq with blank bounds', () => {
    expect(parseNumericFilter('')).toEqual({ op: 'eq', from: '', to: '' })
  })

  test('bare value (no prefix) defaults to eq', () => {
    expect(parseNumericFilter('42')).toEqual({ op: 'eq', from: '42', to: '' })
  })

  test('unknown prefix is treated as a literal eq value', () => {
    expect(parseNumericFilter('foo:42')).toEqual({ op: 'eq', from: 'foo:42', to: '' })
  })

  test('single-bound operators parse into from', () => {
    expect(parseNumericFilter('gt:5')).toEqual({ op: 'gt', from: '5', to: '' })
    expect(parseNumericFilter('lt:9')).toEqual({ op: 'lt', from: '9', to: '' })
    expect(parseNumericFilter('neq:3')).toEqual({ op: 'neq', from: '3', to: '' })
  })

  test('between splits from,to on the comma', () => {
    expect(parseNumericFilter('between:1,10')).toEqual({ op: 'between', from: '1', to: '10' })
  })

  test('between without a comma leaves to blank', () => {
    expect(parseNumericFilter('between:5')).toEqual({ op: 'between', from: '5', to: '' })
  })

  test('nullary operators parse with blank bounds', () => {
    expect(parseNumericFilter('empty:')).toEqual({ op: 'empty', from: '', to: '' })
    expect(parseNumericFilter('nempty:')).toEqual({ op: 'nempty', from: '', to: '' })
  })
})

describe('encodeNumericFilter', () => {
  test('nullary operators encode with a trailing colon', () => {
    expect(encodeNumericFilter('empty', '', '')).toBe('empty:')
    expect(encodeNumericFilter('nempty', 'x', 'y')).toBe('nempty:')
  })

  test('single-bound operator needs a from', () => {
    expect(encodeNumericFilter('gt', '5', '')).toBe('gt:5')
    expect(encodeNumericFilter('gt', '', '')).toBe('')
  })

  test('between encodes both bounds when either is present', () => {
    expect(encodeNumericFilter('between', '1', '10')).toBe('between:1,10')
    expect(encodeNumericFilter('between', '1', '')).toBe('between:1,')
    expect(encodeNumericFilter('between', '', '10')).toBe('between:,10')
    expect(encodeNumericFilter('between', '', '')).toBe('')
  })

  test('round-trips through parse', () => {
    for (const raw of ['eq:1', 'gt:5', 'lt:9', 'neq:3', 'between:1,10', 'empty:', 'nempty:']) {
      const { op, from, to } = parseNumericFilter(raw)
      expect(encodeNumericFilter(op, from, to)).toBe(raw)
    }
  })
})
