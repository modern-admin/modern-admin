import { describe, expect, test } from 'bun:test'
import { formatJsonValue } from '../src/components/json-editor.js'

describe('formatJsonValue', () => {
  test('pretty-prints structured values and JSON strings consistently', () => {
    const expected = '{\n  "permissions": [\n    "read"\n  ]\n}'
    expect(formatJsonValue({ permissions: ['read'] })).toBe(expected)
    expect(formatJsonValue('{"permissions":["read"]}')).toBe(expected)
  })
})
