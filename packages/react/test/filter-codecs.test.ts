import { describe, expect, test } from 'bun:test'
import {
  encodeDateFilter,
  encodeFilter,
  encodeInFilterValues,
  encodeNumericFilter,
  encodeReferenceFilter,
  parseDateFilter,
  parseFilterString,
  parseNumericFilter,
  parseReferenceFilter,
} from '../src/pages/filter-codecs.js'

describe('string filter codec', () => {
  test('reads bare and operator-prefixed legacy values', () => {
    expect(parseFilterString('ada')).toEqual({ op: 'co', val: 'ada', values: [] })
    expect(parseFilterString('sw:ada')).toEqual({ op: 'sw', val: 'ada', values: [] })
    expect(parseFilterString('in:a,b')).toEqual({ op: 'in', val: '', values: ['a', 'b'] })
  })

  test('treats every former in-json marker as literal user data', () => {
    for (const raw of ['in-json:not-json', 'in-json:["a"]']) {
      expect(parseFilterString(raw)).toEqual({ op: 'co', val: raw, values: [] })
    }
  })

  test('writes structured criteria only', () => {
    expect(encodeFilter('co', 'ada')).toEqual({ operator: 'co', value: 'ada' })
    expect(encodeFilter('empty', '')).toEqual({ operator: 'empty' })
    expect(encodeFilter('co', '')).toBeNull()
  })

  test('structured in values preserve commas and delimiters', () => {
    const encoded = encodeInFilterValues(['Smith, John', 'in-json:["a"]'])
    expect(encoded).toEqual({
      operator: 'in',
      values: ['Smith, John', 'in-json:["a"]'],
    })
    expect(parseFilterString(encoded ?? undefined)).toEqual({
      op: 'in',
      val: '',
      values: ['Smith, John', 'in-json:["a"]'],
    })
  })
})

describe('numeric filter codec', () => {
  test('reads legacy filters and writes structured criteria', () => {
    expect(parseNumericFilter('gt:5')).toEqual({ op: 'gt', from: '5', to: '' })
    expect(parseNumericFilter('between:1,10')).toEqual({
      op: 'between',
      from: '1',
      to: '10',
    })
    expect(encodeNumericFilter('gt', '5', '')).toEqual({ operator: 'gt', value: '5' })
    expect(encodeNumericFilter('between', '1', '10')).toEqual({
      operator: 'between',
      from: '1',
      to: '10',
    })
  })

  test('supports nullary and blank filters', () => {
    expect(encodeNumericFilter('nempty', '', '')).toEqual({ operator: 'nempty' })
    expect(encodeNumericFilter('between', '', '')).toBeNull()
  })
})

describe('reference filter codec', () => {
  test('supports equality, negation, and emptiness', () => {
    expect(parseReferenceFilter('customer-1')).toEqual({ op: 'eq', val: 'customer-1' })
    expect(parseReferenceFilter({ operator: 'neq', value: 'customer-1' })).toEqual({
      op: 'neq',
      val: 'customer-1',
    })
    expect(encodeReferenceFilter('eq', 'customer-1')).toEqual({
      operator: 'eq',
      value: 'customer-1',
    })
    expect(encodeReferenceFilter('empty', '')).toEqual({ operator: 'empty' })
    expect(encodeReferenceFilter('eq', '')).toBeNull()
  })
})

describe('date filter codec', () => {
  test('supports structured ranges', () => {
    const encoded = encodeDateFilter('between', '2026-01-01', '2026-01-31')
    expect(encoded).toEqual({
      operator: 'between',
      from: '2026-01-01',
      to: '2026-01-31',
    })
    expect(parseDateFilter(encoded ?? undefined)).toEqual({
      op: 'between',
      from: '2026-01-01',
      to: '2026-01-31',
    })
  })

  test('supports empty and non-empty dates', () => {
    expect(encodeDateFilter('empty', '', '')).toEqual({ operator: 'empty' })
    expect(encodeDateFilter('nempty', '', '')).toEqual({ operator: 'nempty' })
    expect(encodeDateFilter('between', '', '')).toBeNull()
  })
})
