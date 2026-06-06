import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '@modern-admin/core'
import { PrismaDatabase } from '../src'
import { PrismaResource } from '../src'
import { dmmf } from './_helpers/dmmf.js'
import { createClient, createDelegate } from './_helpers/fake-client.js'

const buildClient = () =>
  createClient({
    user: createDelegate(),
    post: createDelegate(),
  })

describe('PrismaDatabase', () => {
  test('isAdapterFor accepts only client+dmmf shapes', () => {
    expect(PrismaDatabase.isAdapterFor({ client: {}, dmmf })).toBe(true)
    expect(PrismaDatabase.isAdapterFor({})).toBe(false)
    expect(PrismaDatabase.isAdapterFor(null)).toBe(false)
  })

  test('resources() yields one PrismaResource per DMMF model', () => {
    const db = new PrismaDatabase({ client: buildClient(), dmmf })
    const resources = db.resources()
    expect(resources).toHaveLength(2)
    expect(resources.every((r) => r instanceof PrismaResource)).toBe(true)
    expect(resources.map((r) => r.id())).toEqual(['User', 'Post'])
  })

  test('integrates with ModernAdmin via the standard adapter contract', () => {
    const admin = new ModernAdmin({
      databases: [{ client: buildClient(), dmmf }],
      adapters: [
        {
          Database: PrismaDatabase as unknown as typeof PrismaDatabase,
          Resource: PrismaResource as unknown as typeof PrismaResource,
        } as unknown as { Database: never; Resource: never },
      ],
    })
    expect(admin.findResource('User').id()).toBe('User')
    expect(admin.findResource('Post').id()).toBe('Post')
  })
})
