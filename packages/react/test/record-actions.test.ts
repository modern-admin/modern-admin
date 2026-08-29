// Per-record action visibility on the client.
//
// The server resolves `isVisible`/`isAccessible` against each record and
// reports the survivors in `RecordJSON.recordActions`. These helpers are the
// single place the UI consults it, so the fail-open behaviour for records
// that carry no verdict is pinned here.

import { describe, expect, test } from 'bun:test'
import {
  isActionAllowedForRecord,
  isActionAllowedForResource,
  visibleRecordActions,
} from '../src/action-menu.js'
import type { ActionDescriptor, RecordJSON, ResourceJSON } from '../src/types.js'

const action = (name: string): ActionDescriptor => ({
  name,
  actionType: 'record',
  resourceId: 'users',
})

const record = (recordActions?: string[]): RecordJSON => ({
  id: '1',
  title: 'Ann',
  params: {},
  populated: {},
  errors: {},
  baseError: null,
  ...(recordActions ? { recordActions } : {}),
})

const ACTIONS = [action('archive'), action('restore'), action('ping')]

describe('visibleRecordActions', () => {
  test('keeps only the actions the record reports', () => {
    const result = visibleRecordActions(ACTIONS, record(['archive', 'ping']))
    expect(result.map((a) => a.name)).toEqual(['archive', 'ping'])
  })

  test('an empty verdict hides everything', () => {
    // Distinct from "no verdict" below — the server said "none apply here".
    expect(visibleRecordActions(ACTIONS, record([]))).toEqual([])
  })

  test('a record with no verdict keeps every action', () => {
    // Fail open: records built outside the action pipeline (or served by an
    // older backend) must not lose their whole menu.
    expect(visibleRecordActions(ACTIONS, record()).map((a) => a.name)).toEqual([
      'archive',
      'restore',
      'ping',
    ])
  })

  test('an undefined record keeps every action', () => {
    expect(visibleRecordActions(ACTIONS, undefined)).toHaveLength(3)
  })

  test('names the record reports but the resource does not declare are ignored', () => {
    const result = visibleRecordActions(ACTIONS, record(['archive', 'ghost']))
    expect(result.map((a) => a.name)).toEqual(['archive'])
  })
})

describe('isActionAllowedForRecord', () => {
  test('honours the verdict for built-in actions', () => {
    const r = record(['show'])
    expect(isActionAllowedForRecord('show', r)).toBe(true)
    expect(isActionAllowedForRecord('edit', r)).toBe(false)
    expect(isActionAllowedForRecord('delete', r)).toBe(false)
  })

  test('fails open without a verdict', () => {
    for (const name of ['show', 'edit', 'delete']) {
      expect(isActionAllowedForRecord(name, record())).toBe(true)
      expect(isActionAllowedForRecord(name, undefined)).toBe(true)
    }
  })

  test('an empty verdict denies built-ins too', () => {
    expect(isActionAllowedForRecord('edit', record([]))).toBe(false)
  })
})

describe('isActionAllowedForResource', () => {
  const resource = (actions: ActionDescriptor[]): Pick<ResourceJSON, 'actions'> => ({ actions })

  test('allows only advertised resource actions', () => {
    expect(
      isActionAllowedForResource(
        'new',
        resource([{ name: 'new', actionType: 'resource', resourceId: 'users' }]),
      ),
    ).toBe(true)
    expect(isActionAllowedForResource('new', resource([]))).toBe(false)
  })

  test('does not confuse an equally named record action with a resource action', () => {
    expect(
      isActionAllowedForResource(
        'new',
        resource([{ name: 'new', actionType: 'record', resourceId: 'users' }]),
      ),
    ).toBe(false)
  })

  test('fails closed until resource metadata is available', () => {
    expect(isActionAllowedForResource('new', undefined)).toBe(false)
  })
})
