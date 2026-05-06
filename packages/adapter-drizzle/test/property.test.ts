import { describe, expect, it } from 'bun:test'
import { DrizzleProperty, extractForeignKeys, findPrimaryColumn } from '../src/property.js'
import { posts, users } from './_helpers/schema.js'
import type { DrizzleColumn, DrizzleTable } from '../src/types.js'

const colOf = (table: DrizzleTable, key: string): DrizzleColumn =>
  table[key] as DrizzleColumn

describe('DrizzleProperty', () => {
  it('maps a text primary key to uuid type', () => {
    const id = new DrizzleProperty(colOf(users, 'id'))
    expect(id.type()).toBe('uuid')
    expect(id.isId()).toBe(true)
    expect(id.isRequired()).toBe(false)
  })

  it('maps text columns to string', () => {
    const email = new DrizzleProperty(colOf(users, 'email'))
    expect(email.type()).toBe('string')
    expect(email.isId()).toBe(false)
    expect(email.isRequired()).toBe(true)
  })

  it('treats nullable columns as optional', () => {
    const name = new DrizzleProperty(colOf(users, 'name'))
    expect(name.isRequired()).toBe(false)
  })

  it('treats columns with defaults as optional', () => {
    const active = new DrizzleProperty(colOf(users, 'active'))
    expect(active.type()).toBe('boolean')
    expect(active.isRequired()).toBe(false)
  })

  it('extracts enum values from pg enums', () => {
    const role = new DrizzleProperty(colOf(users, 'role'))
    expect(role.type()).toBe('enum')
    expect(role.availableValues()).toEqual(['admin', 'editor', 'viewer'])
  })

  it('maps integers to number', () => {
    const age = new DrizzleProperty(colOf(users, 'age'))
    expect(age.type()).toBe('number')
  })

  it('maps timestamps to datetime', () => {
    const createdAt = new DrizzleProperty(colOf(users, 'createdAt'))
    expect(createdAt.type()).toBe('datetime')
  })

  it('detects foreign-key references via the table FK index', () => {
    const fks = extractForeignKeys(posts)
    expect(fks.author_id).toBe('users')
    const authorId = new DrizzleProperty(colOf(posts, 'authorId'), fks.author_id ?? null)
    expect(authorId.type()).toBe('reference')
    expect(authorId.reference()).toBe('users')
  })
})

describe('findPrimaryColumn', () => {
  it('returns the primary key column', () => {
    const pk = findPrimaryColumn(users)
    expect(pk).not.toBeNull()
    expect(pk!.name).toBe('id')
  })

  it('returns null for tables without a primary key', () => {
    const fake = { foo: { name: 'foo', dataType: 'string' } as DrizzleColumn } as DrizzleTable
    expect(findPrimaryColumn(fake)).toBeNull()
  })
})
