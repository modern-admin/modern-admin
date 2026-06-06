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

  test('toJSON normalises BigInt fields to decimal strings (JSON-safe)', () => {
    // Prisma surfaces `BigInt` columns as native bigint. Without
    // normalisation, both Express `res.json()` and the Redis cache
    // (`@modern-admin/cache-redis`) crash with
    // "TypeError: JSON.stringify cannot serialize BigInt" on the first
    // record carrying one. We render those as decimal strings so the wire
    // shape stays JSON-stringifiable end-to-end.
    const rec = new BaseRecord(
      { id: 'r1', rustoreCommentId: 9007199254740993n, nested: { other: 1n } },
      makeResource(),
    )
    const json = rec.toJSON()
    expect(json.params.rustoreCommentId).toBe('9007199254740993')
    expect((json.params.nested as { other: unknown }).other).toBe('1')
    // Final smoke check: the whole record must round-trip through JSON.
    expect(() => JSON.stringify(json)).not.toThrow()
  })
})
