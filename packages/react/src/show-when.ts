// Pure helper that evaluates a `ShowWhenSpec` against a snapshot of form
// values. Lives outside React/RHF on purpose so both the edit page renderer
// and the validation builder can share the exact same semantics.
//
// Operator semantics:
//   - `equals`            — control value === provided value
//   - `notEquals`         — control value !== provided value
//   - `in`                — control value matches any item in array
//   - `notIn`             — control value matches none of the items
//   - `isEmpty:true`      — control value is null / undefined / ''
//   - `isEmpty:false`     — control value is NOT null / undefined / ''
//   - `defaultWhenEmpty`  — fallback: shows the field when control is empty,
//                           regardless of the other operators
//
// Operators combine with OR — the field shows when **any** of them passes.
// When no operator is configured, the rule trivially passes (visible).

import type { ShowWhenSpec } from './types.js'

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** Loose equality that handles primitives + dates + arrays of primitives. */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a == null || b == null) return false
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  // Coerce numbers vs string-numbers (HTML inputs ship strings).
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b
  if (typeof a === 'string' && typeof b === 'number') return a === String(b)
  if (typeof a === 'boolean' && typeof b === 'string') return String(a) === b
  return false
}

/**
 * Evaluate a `ShowWhenSpec` against the live form values.
 * Returns `true` (visible) when no rule is configured.
 */
export function evaluateShowWhen(
  rule: ShowWhenSpec | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!rule) return true
  const control = values[rule.field]
  const empty = isBlank(control)

  // Default branch: when control is empty AND defaultWhenEmpty is set, show.
  if (rule.defaultWhenEmpty && empty) return true

  let anyOperator = false

  if ('equals' in rule && rule.equals !== undefined) {
    anyOperator = true
    if (sameValue(control, rule.equals)) return true
  }
  if ('notEquals' in rule && rule.notEquals !== undefined) {
    anyOperator = true
    if (!sameValue(control, rule.notEquals)) return true
  }
  if (rule.in && rule.in.length > 0) {
    anyOperator = true
    if (rule.in.some((v) => sameValue(control, v))) return true
  }
  if (rule.notIn && rule.notIn.length > 0) {
    anyOperator = true
    if (!rule.notIn.some((v) => sameValue(control, v))) return true
  }
  if (rule.isEmpty !== undefined) {
    anyOperator = true
    if (rule.isEmpty === empty) return true
  }

  // Rule with operators that all failed → hidden.
  // Rule with no operators (only `field` declared) → visible.
  return !anyOperator
}
