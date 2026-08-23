// A root mount used to be accepted and then quietly break everything:
// `stripTrailingSlash('/')` yields `''`, so the middleware's exclude became
// `/api/(.*)` while its routes became `/(.*)`. The admin API lives at the
// hardcoded `/admin/api/*`, no longer matched the exclude, and every API call
// — plus every other GET route in the host app — was answered with the SPA
// shell. It now fails at boot instead.

import { describe, expect, test } from 'bun:test'
import { assertMountPath } from '../src/static-ui.middleware.js'

describe('assertMountPath', () => {
  test('accepts a normal sub-path', () => {
    expect(assertMountPath('/admin')).toBe('/admin')
  })

  test('strips a trailing slash', () => {
    expect(assertMountPath('/admin/')).toBe('/admin')
  })

  test('accepts a nested mount', () => {
    expect(assertMountPath('/internal/admin')).toBe('/internal/admin')
  })

  test('rejects a root mount', () => {
    expect(() => assertMountPath('/')).toThrow(/root path/)
  })

  test('rejects an empty path', () => {
    expect(() => assertMountPath('')).toThrow(/root path/)
  })

  test('rejects a path that does not start with a slash', () => {
    expect(() => assertMountPath('admin')).toThrow(/must start with/)
  })
})
