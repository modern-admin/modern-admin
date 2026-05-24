import { afterEach, describe, expect, test } from 'bun:test'
import {
  getActiveFeatureFlags,
  isFeatureActive,
  setActiveFeatureFlags,
} from '../src/feature-flags.js'
import { ModernAdmin } from '../src/modern-admin.js'

describe('feature-flags registry', () => {
  afterEach(() => {
    setActiveFeatureFlags([])
  })

  test('isFeatureActive is false when nothing is registered', () => {
    expect(isFeatureActive('ai-fill')).toBe(false)
  })

  test('setActiveFeatureFlags overwrites the active set', () => {
    setActiveFeatureFlags(['ai-fill', 'webhooks'])
    expect(isFeatureActive('ai-fill')).toBe(true)
    expect(isFeatureActive('webhooks')).toBe(true)
    expect(isFeatureActive('logging')).toBe(false)
    expect([...getActiveFeatureFlags()].sort()).toEqual(['ai-fill', 'webhooks'])

    setActiveFeatureFlags(['logging'])
    expect(isFeatureActive('ai-fill')).toBe(false)
    expect(isFeatureActive('logging')).toBe(true)
  })

  test('ModernAdmin constructor publishes featureFlags into the registry', () => {
    new ModernAdmin({ featureFlags: ['ai-fill', 'webhooks'] })
    expect(isFeatureActive('ai-fill')).toBe(true)
    expect(isFeatureActive('webhooks')).toBe(true)
    expect(isFeatureActive('logging')).toBe(false)
  })

  test('ModernAdmin with no featureFlags clears the registry', () => {
    setActiveFeatureFlags(['ai-fill'])
    new ModernAdmin({})
    expect(isFeatureActive('ai-fill')).toBe(false)
  })
})
