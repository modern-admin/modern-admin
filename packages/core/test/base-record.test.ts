import { describe, expect, test } from 'bun:test'
import { BaseRecord } from '../src/adapters/base-record.js'
import { ValidationError } from '../src/errors'
import { FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const makeResource = (rows: FakeTable['rows'] = []): FakeResource =>
  new FakeResource({ name: 'users', rows })

describe('BaseRecord', () => {
  test('id() returns the value of the id property', () => {
    const rec = new BaseRecord({ id: 'r1', name: 'Ann' }, makeResource())
    expect(rec.id()).toBe('r1')
  })

  test('title() falls back to id when no title property matches', () => {
    const rec = new BaseRecord({ id: 'r1' }, makeResource())
    expect(rec.title()).toBe('r1')
  })

  test('get/set work over flat dotted-path params', () => {
    const rec = new BaseRecord({ id: '1', meta: { tag: 'a' } }, makeResource())
    expect(rec.get('meta.tag')).toBe('a')
    rec.set('meta.tag', 'b')
    expect(rec.get('meta.tag')).toBe('b')
  })

  test('save() creates when no id, updates when id present', async () => {
    const resource = makeResource()
    const created = new BaseRecord({ name: 'A' }, resource)
    await created.save()
    expect(created.params.id).toBe('1')

    const existing = new BaseRecord({ id: '1', name: 'B' }, resource)
    await existing.save()
    expect(existing.params.name).toBe('B')
  })

  test('save() captures ValidationError into errors map without throwing', async () => {
    const resource = makeResource()
    // Override create to throw a ValidationError
    resource.create = async () => {
      throw new ValidationError({ name: { type: 'required', message: 'is required' } })
    }
    const rec = new BaseRecord({ name: '' }, resource)
    await rec.save()
    expect(rec.isValid()).toBe(false)
    expect(rec.error('name')).toBeDefined()
  })

  test('toJSON exposes id, title, params, populated, errors', () => {
    const rec = new BaseRecord({ id: 'r1', name: 'Ann' }, makeResource())
    const json = rec.toJSON()
    expect(json.id).toBe('r1')
    expect(json.params).toEqual({ id: 'r1', name: 'Ann' })
    expect(json.errors).toEqual({})
    expect(json.baseError).toBeNull()
  })
})
