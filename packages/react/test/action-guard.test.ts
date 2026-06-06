import { describe, expect, test } from 'bun:test'
import { confirmGuard } from '../src/action-guard.js'
import type { ConfirmOptions } from '../src/dialogs.js'

describe('confirmGuard', () => {
  test('returns true immediately when no guard is set', async () => {
    let called = false
    const dialogs = {
      confirm: async (_opts?: ConfirmOptions) => {
        called = true
        return true
      },
    }
    const result = await confirmGuard({ guard: undefined }, dialogs)
    expect(result).toBe(true)
    expect(called).toBe(false)
  })

  test('calls confirm and returns true when user confirms', async () => {
    const dialogs = { confirm: async (_opts?: ConfirmOptions) => true }
    const result = await confirmGuard({ guard: 'Are you sure?' }, dialogs)
    expect(result).toBe(true)
  })

  test('calls confirm and returns false when user cancels', async () => {
    const dialogs = { confirm: async (_opts?: ConfirmOptions) => false }
    const result = await confirmGuard({ guard: 'Are you sure?' }, dialogs)
    expect(result).toBe(false)
  })

  test('passes guard text as description to confirm dialog', async () => {
    let receivedDescription: string | undefined
    const dialogs = {
      confirm: async (opts?: ConfirmOptions) => {
        receivedDescription = opts?.description
        return true
      },
    }
    await confirmGuard({ guard: 'Delete this record?' }, dialogs)
    expect(receivedDescription).toBe('Delete this record?')
  })

  test('merges extra options into confirm call', async () => {
    let receivedOpts: ConfirmOptions | undefined
    const dialogs = {
      confirm: async (opts?: ConfirmOptions) => {
        receivedOpts = opts
        return true
      },
    }
    await confirmGuard({ guard: 'Really?' }, dialogs, { destructive: true, title: 'Danger' })
    expect(receivedOpts?.description).toBe('Really?')
    expect(receivedOpts?.destructive).toBe(true)
    expect(receivedOpts?.title).toBe('Danger')
  })

  test('extra options do not override description', async () => {
    let receivedOpts: ConfirmOptions | undefined
    const dialogs = {
      confirm: async (opts?: ConfirmOptions) => {
        receivedOpts = opts
        return true
      },
    }
    // TypeScript prevents passing `description` in extra, but validate runtime too
    await confirmGuard({ guard: 'Guard text' }, dialogs)
    expect(receivedOpts?.description).toBe('Guard text')
  })
})
