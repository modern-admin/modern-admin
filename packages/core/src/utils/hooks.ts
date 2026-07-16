/**
 * Action-hook chaining helpers.
 *
 * Resource features (`uploadFeature`, `m2mFeature`, `passwordsFeature`,
 * `historyFeature`, `jsonByKeyFeature`, …) install `before`/`after` hooks on
 * built-in actions. They must *chain* onto any hooks a user (or an earlier
 * feature) already declared, never replace them. Each feature used to
 * re-implement the same three-line plumbing (`toArray` + append) under a
 * different local name; these helpers are the single shared source.
 *
 * An action's `before`/`after` field is `Hook | Hook[] | undefined`, so
 * chaining is "normalise the existing value to an array, then append".
 */

import type { After, Before } from '../actions/action.js'
import type { ActionResponse } from '../actions/action.js'

/**
 * Normalise a hook field (`fn | fn[] | undefined | null`) into an array.
 * Absent values collapse to `[]`, a single hook is wrapped, an array passes
 * through unchanged.
 */
export function toHookArray<T>(hook: T | readonly T[] | undefined | null): T[] {
  if (!hook) return []
  return Array.isArray(hook) ? [...hook] : [hook as T]
}

/**
 * Append `before` hook(s) after any the existing action override already
 * declares, returning the combined array (existing first, new last).
 * Defaults to core's {@link Before} signature; pass a type argument to chain
 * a feature-local hook shape.
 */
export function appendBeforeHook<T = Before>(
  existing: Record<string, unknown> | undefined,
  ...newHooks: T[]
): T[] {
  return [...toHookArray(existing?.before as T | readonly T[] | undefined), ...newHooks]
}

/**
 * Append `after` hook(s) after any the existing action override already
 * declares, returning the combined array (existing first, new last).
 * Defaults to core's {@link After} signature; pass a type argument to chain
 * a feature-local hook shape.
 */
export function appendAfterHook<T = After<ActionResponse>>(
  existing: Record<string, unknown> | undefined,
  ...newHooks: T[]
): T[] {
  return [...toHookArray(existing?.after as T | readonly T[] | undefined), ...newHooks]
}
