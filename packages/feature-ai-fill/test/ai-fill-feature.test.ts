import { describe, it, expect } from 'bun:test'
import { aiFillFeature, AI_FILL_ACTION_NAME, buildAiFillSchema } from '../src/index.js'
import type { PropertyJSON, ResourceOptions } from '@modern-admin/core'

const emptyOptions: ResourceOptions = {}

/** Build a minimal PropertyJSON for tests. */
function prop(over: Partial<PropertyJSON> & { path: string; type: string }): PropertyJSON {
  return {
    path: over.path,
    label: over.label ?? over.path,
    type: over.type,
    isId: over.isId ?? false,
    isSortable: false,
    isRequired: false,
    isDisabled: over.isDisabled ?? false,
    isArray: over.isArray ?? false,
    reference: null,
    availableValues: over.availableValues ?? null,
    components: {},
    visibility: { list: true, show: true, edit: true, filter: true },
    position: 0,
    description: over.description,
    custom: over.custom ?? {},
  } as PropertyJSON
}

describe('aiFillFeature()', () => {
  it('returns a FeatureFn', () => {
    const f = aiFillFeature()
    expect(typeof f).toBe('function')
  })

  it('registers an aiFill action with custom.aiFill === true', () => {
    const result = aiFillFeature()(emptyOptions)
    const action = result.actions?.[AI_FILL_ACTION_NAME]
    expect(action).toBeDefined()
    expect((action?.custom as { aiFill?: boolean }).aiFill).toBe(true)
    expect(action?.actionType).toBe('resource')
    expect(action?.component).toBe('AiFill')
  })

  it('stores prompt/model/fields in action.custom when provided', () => {
    const result = aiFillFeature({
      prompt: 'Hi',
      model: 'openai/gpt-4o',
      fields: { name: { hint: 'Product name' } },
    })(emptyOptions)
    const custom = result.actions?.[AI_FILL_ACTION_NAME]?.custom as Record<string, unknown>
    expect(custom.prompt).toBe('Hi')
    expect(custom.model).toBe('openai/gpt-4o')
    expect(custom.fields).toEqual({ name: { hint: 'Product name' } })
  })

  it('omits prompt/model/fields keys when not provided', () => {
    const custom = aiFillFeature()(emptyOptions).actions?.[AI_FILL_ACTION_NAME]?.custom as Record<string, unknown>
    expect('prompt' in custom).toBe(false)
    expect('model' in custom).toBe(false)
    expect('fields' in custom).toBe(false)
  })

  it('preserves existing actions on the resource', () => {
    const result = aiFillFeature()({
      actions: { foo: { actionType: 'resource' } },
    } as unknown as ResourceOptions)
    expect(result.actions?.foo).toBeDefined()
    expect(result.actions?.[AI_FILL_ACTION_NAME]).toBeDefined()
  })

  it('merges with a user-provided aiFill action override', () => {
    const result = aiFillFeature()({
      actions: { [AI_FILL_ACTION_NAME]: { guard: 'admin' } },
    } as unknown as ResourceOptions)
    const action = result.actions?.[AI_FILL_ACTION_NAME]
    expect(action?.guard).toBe('admin')
    expect((action?.custom as { aiFill?: boolean }).aiFill).toBe(true)
  })
})

describe('buildAiFillSchema()', () => {
  it('returns empty schema and guide when no fillable properties', () => {
    const built = buildAiFillSchema([prop({ path: 'id', type: 'id', isId: true })], undefined)
    expect(built.includedPaths).toEqual([])
    expect(built.fieldGuide).toBe('(no fields available)')
  })

  it('skips id, disabled, array, and SKIP_TYPES properties', () => {
    const built = buildAiFillSchema(
      [
        prop({ path: 'id', type: 'string', isId: true }),
        prop({ path: 'pwd', type: 'password' }),
        prop({ path: 'meta', type: 'json' }),
        prop({ path: 'tags', type: 'string', isArray: true }),
        prop({ path: 'banner', type: 'file' }),
        prop({ path: 'dis', type: 'string', isDisabled: true }),
      ],
      undefined,
    )
    expect(built.includedPaths).toEqual([])
  })

  it('includes string, number, integer, boolean, date as nullable types', () => {
    const built = buildAiFillSchema(
      [
        prop({ path: 'name', type: 'string' }),
        prop({ path: 'price', type: 'number' }),
        prop({ path: 'qty', type: 'integer' }),
        prop({ path: 'active', type: 'boolean' }),
        prop({ path: 'born', type: 'date' }),
      ],
      undefined,
    )
    expect(built.includedPaths).toEqual(['name', 'price', 'qty', 'active', 'born'])
    // All schema fields should accept null
    const sample = built.schema.parse({ name: null, price: null, qty: null, active: null, born: null })
    expect(sample).toEqual({ name: null, price: null, qty: null, active: null, born: null })
  })

  it('respects fieldConfig.exclude', () => {
    const built = buildAiFillSchema(
      [prop({ path: 'name', type: 'string' }), prop({ path: 'note', type: 'string' })],
      { note: { exclude: true } },
    )
    expect(built.includedPaths).toEqual(['name'])
  })

  it('appends fieldConfig.hint to the guide line', () => {
    const built = buildAiFillSchema(
      [prop({ path: 'price', type: 'number', label: 'Price' })],
      { price: { hint: 'In USD, no symbol' } },
    )
    expect(built.fieldGuide).toContain('In USD, no symbol')
    expect(built.fieldGuide).toContain('price')
  })

  it('maps availableValues to a union schema and lists them in the guide', () => {
    const built = buildAiFillSchema(
      [
        prop({
          path: 'status',
          type: 'string',
          label: 'Status',
          availableValues: [
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
          ],
        }),
      ],
      undefined,
    )
    expect(built.includedPaths).toEqual(['status'])
    expect(built.fieldGuide).toContain('"draft"')
    expect(built.fieldGuide).toContain('"published"')
    // Valid enum value parses cleanly.
    expect(built.schema.parse({ status: 'draft' })).toEqual({ status: 'draft' })
    // Null is allowed (model could not decide).
    expect(built.schema.parse({ status: null })).toEqual({ status: null })
    // Out-of-domain value rejected.
    expect(() => built.schema.parse({ status: 'unknown' })).toThrow()
  })

  it('rejects extra keys (strict)', () => {
    const built = buildAiFillSchema([prop({ path: 'name', type: 'string' })], undefined)
    expect(() => built.schema.parse({ name: 'foo', bogus: 'x' })).toThrow()
  })
})
