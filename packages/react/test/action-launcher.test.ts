// Launch-strategy predicate for custom actions.
//
// `hasActionComponent` is the fork every action surface (list toolbar, row
// menu, show page) checks first: true means "render the action's own UI",
// false means "fire it straight at the API". Getting it wrong either
// silently swallows a form or POSTs an action the operator never filled in.

import { describe, expect, test } from 'bun:test'
import { hasActionComponent } from '../src/action-launcher.js'
import { getActionLabel } from '../src/action-menu.js'
import type { ActionDescriptor } from '../src/types.js'

const descriptor = (over: Partial<ActionDescriptor> = {}): ActionDescriptor => ({
  name: 'sendMassPush',
  actionType: 'resource',
  resourceId: 'users',
  ...over,
})

describe('hasActionComponent', () => {
  test('true when the action names a component', () => {
    expect(hasActionComponent(descriptor({ component: 'SendMassPush' }))).toBe(true)
  })

  test('false when the component is absent', () => {
    expect(hasActionComponent(descriptor())).toBe(false)
  })

  test('false when the component is explicitly null', () => {
    // The core serializer emits `component: null` for actions that declare
    // none — that must not be mistaken for a registered component name.
    expect(hasActionComponent(descriptor({ component: null }))).toBe(false)
  })

  test('false for an empty component name', () => {
    expect(hasActionComponent(descriptor({ component: '' }))).toBe(false)
  })

  test('independent of actionType', () => {
    expect(hasActionComponent(descriptor({ actionType: 'record', component: 'X' }))).toBe(true)
    expect(hasActionComponent(descriptor({ actionType: 'bulk' }))).toBe(false)
  })
})

describe('getActionLabel', () => {
  test('prefers the localized custom.label', () => {
    expect(getActionLabel(descriptor({ custom: { label: 'Массовая рассылка' } }))).toBe(
      'Массовая рассылка',
    )
  })

  test('falls back to the action name', () => {
    expect(getActionLabel(descriptor())).toBe('sendMassPush')
  })

  test('ignores a non-string label', () => {
    expect(getActionLabel(descriptor({ custom: { label: 42 } }))).toBe('sendMassPush')
  })
})
