import { describe, expect, test } from 'bun:test'
import { PrismaProperty } from '../src/property.js'
import { roleEnum, userModel, postModel } from './_helpers/dmmf.js'

describe('PrismaProperty', () => {
  test('maps Prisma scalar types onto core PropertyType', () => {
    const email = userModel.fields.find((f) => f.name === 'email')!
    const age = userModel.fields.find((f) => f.name === 'age')!
    const createdAt = userModel.fields.find((f) => f.name === 'createdAt')!
    expect(new PrismaProperty(email).type()).toBe('string')
    expect(new PrismaProperty(age).type()).toBe('number')
    expect(new PrismaProperty(createdAt).type()).toBe('datetime')
  })

  test('promotes string id columns named like uuid to "uuid" type', () => {
    const id = userModel.fields.find((f) => f.name === 'id')!
    expect(new PrismaProperty(id).type()).toBe('uuid')
  })

  test('detects enum fields and exposes available values', () => {
    const role = userModel.fields.find((f) => f.name === 'role')!
    const prop = new PrismaProperty(role, [roleEnum])
    expect(prop.type()).toBe('enum')
    expect(prop.availableValues()).toEqual(['ADMIN', 'EDITOR', 'VIEWER'])
  })

  test('marks relation fields as references', () => {
    const author = postModel.fields.find((f) => f.name === 'author')!
    const prop = new PrismaProperty(author)
    expect(prop.type()).toBe('reference')
    expect(prop.reference()).toBe('User')
    expect(prop.foreignKeyFields()).toEqual(['authorId'])
    expect(prop.isEditable()).toBe(false)
  })

  test('isRequired ignores fields that have a default value', () => {
    const id = userModel.fields.find((f) => f.name === 'id')!
    expect(new PrismaProperty(id).isRequired()).toBe(false)
  })

  test('isSortable is true only for non-array scalars', () => {
    const email = userModel.fields.find((f) => f.name === 'email')!
    const posts = userModel.fields.find((f) => f.name === 'posts')!
    expect(new PrismaProperty(email).isSortable()).toBe(true)
    expect(new PrismaProperty(posts).isSortable()).toBe(false)
  })
})
