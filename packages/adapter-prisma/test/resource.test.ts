import { describe, expect, test } from 'bun:test'
import { Filter, ValidationError } from '@modern-admin/core'
import { PrismaResource } from '../src/resource.js'
import { userModel, roleEnum } from './_helpers/dmmf.js'
import { createClient, createDelegate, type FakeDelegate } from './_helpers/fake-client.js'

const buildResource = (
  initial: Array<Record<string, unknown>> = [],
): { resource: PrismaResource; delegate: FakeDelegate } => {
  const delegate = createDelegate(initial)
  const client = createClient({ user: delegate })
  const resource = new PrismaResource({
    model: userModel,
    client,
    enums: [roleEnum],
  })
  return { resource, delegate }
}

const emptyFilter = (resource: PrismaResource) => new Filter(undefined, resource)

describe('PrismaResource', () => {
  test('id() returns the model name', () => {
    const { resource } = buildResource()
    expect(resource.id()).toBe('User')
    expect(resource.databaseType()).toBe('prisma')
  })

  test('properties are derived from DMMF', () => {
    const { resource } = buildResource()
    const paths = resource.properties().map((p) => p.path())
    expect(paths).toEqual(['id', 'email', 'age', 'role', 'createdAt', 'posts'])
  })

  test('count delegates to Prisma with the where clause', async () => {
    const { resource, delegate } = buildResource([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@y' },
    ])
    expect(await resource.count(emptyFilter(resource))).toBe(2)
    expect(delegate.calls.at(-1)?.method).toBe('count')
  })

  test('find applies pagination and returns BaseRecords', async () => {
    const { resource } = buildResource([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@y' },
      { id: '3', email: 'c@z' },
    ])
    const recs = await resource.find(emptyFilter(resource), { limit: 2, offset: 1 })
    expect(recs).toHaveLength(2)
    expect(recs[0]!.id()).toBe('2')
  })

  test('findOne returns null when row missing', async () => {
    const { resource } = buildResource([{ id: '1', email: 'a@x' }])
    expect(await resource.findOne('missing')).toBeNull()
    const rec = await resource.findOne('1')
    expect(rec?.id()).toBe('1')
  })

  test('findMany filters by id list', async () => {
    const { resource } = buildResource([
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ])
    const recs = await resource.findMany(['1', '3'])
    expect(recs.map((r) => r.id()).sort()).toEqual(['1', '3'])
  })

  test('create strips relations and read-only fields', async () => {
    const { resource, delegate } = buildResource()
    await resource.create({
      email: 'new@x',
      role: 'EDITOR',
      posts: [{ title: 'ignored' }],
    })
    const args = delegate.calls.at(-1)?.args as { data: Record<string, unknown> }
    expect(args.data).not.toHaveProperty('posts')
    expect(args.data.email).toBe('new@x')
  })

  test('update routes through delegate.update with idClause', async () => {
    const { resource, delegate } = buildResource([{ id: '1', email: 'a@x' }])
    await resource.update('1', { email: 'b@x' })
    const args = delegate.calls.at(-1)?.args as { where: Record<string, unknown> }
    expect(args.where).toEqual({ id: '1' })
  })

  test('delete calls delegate.delete with id clause', async () => {
    const { resource, delegate } = buildResource([{ id: '1' }])
    await resource.delete('1')
    expect(delegate.calls.at(-1)?.method).toBe('delete')
    expect(delegate.rows).toHaveLength(0)
  })

  test('P2002 unique violation becomes ValidationError', async () => {
    const { resource, delegate } = buildResource()
    delegate.nextError = Object.assign(new Error('Unique'), {
      code: 'P2002',
      meta: { target: ['email'] },
    })
    await expect(resource.create({ email: 'dup@x' })).rejects.toBeInstanceOf(ValidationError)
  })
})
