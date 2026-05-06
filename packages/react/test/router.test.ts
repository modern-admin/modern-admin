import { describe, expect, test } from 'bun:test'
import { buildHref } from '../src/router.js'

describe('buildHref', () => {
  test('home', () => {
    expect(buildHref({ name: 'home' })).toBe('#/')
  })

  test('list', () => {
    expect(buildHref({ name: 'list', resourceId: 'users' })).toBe('#/resources/users')
  })

  test('show', () => {
    expect(buildHref({ name: 'show', resourceId: 'users', recordId: '42' })).toBe(
      '#/resources/users/42',
    )
  })

  test('edit', () => {
    expect(buildHref({ name: 'edit', resourceId: 'users', recordId: '42' })).toBe(
      '#/resources/users/42/edit',
    )
  })

  test('new', () => {
    expect(buildHref({ name: 'new', resourceId: 'users' })).toBe('#/resources/users/new')
  })

  test('encodes special characters in ids', () => {
    expect(buildHref({ name: 'show', resourceId: 'a b', recordId: 'x/y' })).toBe(
      '#/resources/a%20b/x%2Fy',
    )
  })
})
