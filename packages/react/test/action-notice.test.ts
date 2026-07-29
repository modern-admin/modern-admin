// Custom-action `notice` → toast mapping, shared by every action surface.

import { describe, expect, test } from 'bun:test'
import { showActionNotice } from '../src/action-notice.js'
import type { useNotify } from '../src/notify.js'

type NotifyApi = ReturnType<typeof useNotify>

const spyNotify = (): { api: NotifyApi; calls: Array<[string, unknown]> } => {
  const calls: Array<[string, unknown]> = []
  const make = (kind: string) => (msg: unknown) => {
    calls.push([kind, msg])
  }
  const api = {
    success: make('success'),
    error: make('error'),
    info: make('info'),
    warning: make('warning'),
  } as unknown as NotifyApi
  return { api, calls }
}

describe('showActionNotice', () => {
  test('no notice is a no-op', () => {
    const { api, calls } = spyNotify()
    showActionNotice(api, undefined)
    expect(calls).toEqual([])
  })

  test.each([
    ['success', 'success'],
    ['error', 'error'],
    ['info', 'info'],
    ['warning', 'warning'],
  ] as const)('maps notice type %s to the %s toast', (type, expected) => {
    const { api, calls } = spyNotify()
    showActionNotice(api, { message: 'done', type })
    expect(calls).toEqual([[expected, { message: 'done' }]])
  })

  test('an unrecognised type falls back to success', () => {
    const { api, calls } = spyNotify()
    showActionNotice(api, { message: 'done', type: 'weird' as 'success' })
    expect(calls).toEqual([['success', { message: 'done' }]])
  })
})
