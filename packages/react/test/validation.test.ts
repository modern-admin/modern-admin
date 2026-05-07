import { describe, expect, test } from 'bun:test'
import { buildPropertySchema, buildValidationSchema } from '../src/validation.js'
import type { PropertyJSON } from '../src/types.js'

const t = (key: string, params?: Record<string, unknown>): string =>
  params ? `${key}:${JSON.stringify(params)}` : key

const prop = (overrides: Partial<PropertyJSON>): PropertyJSON => ({
  path: 'name',
  label: 'Name',
  type: 'string',
  isId: false,
  isSortable: false,
  isRequired: false,
  isDisabled: false,
  isArray: false,
  reference: null,
  availableValues: null,
  components: {},
  visibility: { list: true, show: true, edit: true, filter: false },
  position: 0,
  custom: {},
  ...overrides,
})

const message = (result: { success: boolean; error?: { issues: { message: string }[] } }): string =>
  result.success ? '' : (result.error?.issues[0]?.message ?? '')

describe('buildPropertySchema', () => {
  test('required string rejects blanks with localized message', () => {
    const s = buildPropertySchema(prop({ isRequired: true }), t)
    const r = s.safeParse('') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:required')
    expect(message(r)).toContain('Name')
  })

  test('optional string allows null/empty', () => {
    const s = buildPropertySchema(prop({ isRequired: false }), t)
    expect(s.safeParse('').success).toBe(true)
    expect(s.safeParse(null).success).toBe(true)
  })

  test('email rejects malformed input', () => {
    const s = buildPropertySchema(prop({ type: 'email', isRequired: true }), t)
    const r = s.safeParse('not-an-email') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:invalidEmail')
  })

  test('email accepts valid input', () => {
    const s = buildPropertySchema(prop({ type: 'email', isRequired: true }), t)
    expect(s.safeParse('a@b.co').success).toBe(true)
  })

  test('number coerces string and rejects non-numbers', () => {
    const s = buildPropertySchema(prop({ type: 'number', isRequired: true }), t)
    expect(s.safeParse('42').success).toBe(true)
    const r = s.safeParse('not-a-number') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:invalidNumber')
  })

  test('integer rejects floats', () => {
    const s = buildPropertySchema(prop({ type: 'integer', isRequired: true }), t)
    expect(s.safeParse('5').success).toBe(true)
    const r = s.safeParse('5.4') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:invalidInteger')
  })

  test('boolean coerces falsy/truthy values', () => {
    const s = buildPropertySchema(prop({ type: 'boolean' }), t)
    expect(s.safeParse(true).success).toBe(true)
    expect(s.safeParse(false).success).toBe(true)
    expect(s.safeParse('').success).toBe(true)
  })

  test('url rejects non-http inputs', () => {
    const s = buildPropertySchema(prop({ type: 'url', isRequired: true }), t)
    expect(s.safeParse('https://example.com').success).toBe(true)
    const r = s.safeParse('not a url') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:invalidUrl')
  })

  test('date rejects unparseable input', () => {
    const s = buildPropertySchema(prop({ type: 'date', isRequired: true }), t)
    expect(s.safeParse('2024-01-15').success).toBe(true)
    const r = s.safeParse('garbage') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:invalidDate')
  })

  test('enum (availableValues) rejects values not in the set', () => {
    const s = buildPropertySchema(
      prop({
        availableValues: [
          { value: 'draft', label: 'Draft' },
          { value: 'published', label: 'Published' },
        ],
        isRequired: true,
      }),
      t,
    )
    expect(s.safeParse('draft').success).toBe(true)
    const r = s.safeParse('archived') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:notInList')
  })

  test('reference rejects empty when required', () => {
    const s = buildPropertySchema(
      prop({ type: 'reference', reference: 'users', isRequired: true }),
      t,
    )
    expect(s.safeParse('42').success).toBe(true)
    const r = s.safeParse('') as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:required')
  })

  test('multi-reference requires non-empty array when required', () => {
    const s = buildPropertySchema(
      prop({ type: 'reference', reference: 'tags', isArray: true, isRequired: true, label: 'Tags' }),
      t,
    )
    expect(s.safeParse(['1', '2']).success).toBe(true)
    const r = s.safeParse([]) as { success: boolean; error?: { issues: { message: string }[] } }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:emptySelection')
  })

  test('multi-reference allows empty array when optional', () => {
    const s = buildPropertySchema(
      prop({ type: 'reference', reference: 'tags', isArray: true, isRequired: false }),
      t,
    )
    expect(s.safeParse([]).success).toBe(true)
    expect(s.safeParse(null).success).toBe(true)
  })
})

describe('buildValidationSchema', () => {
  test('composes per-property schemas into an object', () => {
    const schema = buildValidationSchema(
      [
        prop({ path: 'name', label: 'Name', isRequired: true }),
        prop({ path: 'age', label: 'Age', type: 'number' }),
      ],
      t,
    )
    expect(schema.safeParse({ name: 'Alice', age: '30' }).success).toBe(true)
    const r = schema.safeParse({ name: '', age: '30' }) as {
      success: boolean
      error?: { issues: { message: string }[] }
    }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('validation:required')
  })

  test('localized messages via the translator', () => {
    const ru: typeof t = (key, params) =>
      key === 'validation:required' && params ? `Поле «${params.label}» обязательно` : key
    const schema = buildValidationSchema(
      [prop({ path: 'name', label: 'Имя', isRequired: true })],
      ru,
    )
    const r = schema.safeParse({ name: '' }) as {
      success: boolean
      error?: { issues: { message: string }[] }
    }
    expect(r.success).toBe(false)
    expect(message(r)).toContain('Поле «Имя» обязательно')
  })
})
