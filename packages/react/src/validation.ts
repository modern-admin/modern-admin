// Per-property Zod schema builder with localized error messages.
//
// Each PropertyJSON.type maps to a typed validator: numerics get coerced from
// string inputs, dates parsed via Date, references checked for non-empty,
// arrays validated as collections of FK-shaped values, and enums (anything
// with `availableValues`) restricted to the declared set. Required vs
// optional is honoured uniformly. All error messages route through the
// passed translator so the active locale wins.
//
// The builder returns plain Zod schemas — RHF + zodResolver consume them
// directly. Keep the builder pure (no React/i18n imports) so it stays
// testable and reusable from non-React contexts.

import { z, type ZodType } from 'zod'
import type { PropertyJSON } from './types.js'
import { evaluateShowWhen } from './show-when.js'

/**
 * Lazy form-snapshot reader. Passed by the caller (the edit page) so the
 * schema can consult the live form values at validation time without taking
 * a hard dependency on RHF. Returning `{}` is fine — every property defaults
 * to "visible" then.
 */
export type FormValuesGetter = () => Record<string, unknown>

export type Translator = (key: string, params?: Record<string, unknown>) => string

/** Email pattern: deliberately loose, matches Better Auth / common usage. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/.+/i
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** Build a string validator with optional/required + format checks. */
function stringSchema(p: PropertyJSON, t: Translator, format?: 'email' | 'url' | 'uuid'): ZodType {
  const label = p.label
  const checkFormat = (v: string): boolean => {
    if (format === 'email') return EMAIL_RE.test(v)
    if (format === 'url') return URL_RE.test(v)
    if (format === 'uuid') return UUID_RE.test(v)
    return true
  }
  const formatKey =
    format === 'email'
      ? 'validation:invalidEmail'
      : format === 'url'
        ? 'validation:invalidUrl'
        : format === 'uuid'
          ? 'validation:invalidUuid'
          : null

  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === 'string' ? v : v == null ? '' : String(v)))
    .superRefine((value, ctx) => {
      const blank = value.trim() === ''
      if (blank) {
        if (p.isRequired) {
          ctx.addIssue({ code: 'custom', message: t('validation:required', { label }) })
        }
        return
      }
      if (formatKey && !checkFormat(value)) {
        ctx.addIssue({ code: 'custom', message: t(formatKey, { label }) })
      }
    })
    .transform((v) => (v.trim() === '' ? null : v))
}

/** Number validator with coercion from string inputs (HTML inputs ship strings). */
function numberSchema(p: PropertyJSON, t: Translator, integer = false): ZodType {
  const label = p.label
  // Validate at the unknown layer because Zod 4's z.number() rejects NaN
  // before our refinement can produce a localized message. We coerce here,
  // then assert the type ourselves so all error paths flow through superRefine.
  return z.unknown().superRefine((raw, ctx) => {
    if (isBlank(raw)) {
      if (p.isRequired) {
        ctx.addIssue({ code: 'custom', message: t('validation:required', { label }) })
      }
      return
    }
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(value)) {
      ctx.addIssue({ code: 'custom', message: t('validation:invalidNumber', { label }) })
      return
    }
    if (integer && !Number.isInteger(value)) {
      ctx.addIssue({ code: 'custom', message: t('validation:invalidInteger', { label }) })
    }
  }).transform((raw) => {
    if (isBlank(raw)) return null
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) ? n : null
  })
}

/** Boolean validator; missing value → false (HTML default for unchecked). */
function booleanSchema(_p: PropertyJSON, _t: Translator): ZodType {
  return z.preprocess((v) => (typeof v === 'boolean' ? v : Boolean(v)), z.boolean())
}

/** Date validator: accepts ISO strings or `Date`; rejects unparseable input. */
function dateSchema(p: PropertyJSON, t: Translator): ZodType {
  const label = p.label
  return z
    .union([z.string(), z.date(), z.null(), z.undefined()])
    .superRefine((value, ctx) => {
      if (isBlank(value)) {
        if (p.isRequired) {
          ctx.addIssue({ code: 'custom', message: t('validation:required', { label }) })
        }
        return
      }
      const parsed = value instanceof Date ? value : new Date(String(value))
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: 'custom', message: t('validation:invalidDate', { label }) })
      }
    })
    .transform((v) => (isBlank(v) ? null : v))
}

/** Single reference validator: requires a non-empty FK when isRequired. */
function referenceSchema(p: PropertyJSON, t: Translator): ZodType {
  const label = p.label
  return z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .superRefine((value, ctx) => {
      if (isBlank(value) && p.isRequired) {
        ctx.addIssue({ code: 'custom', message: t('validation:required', { label }) })
      }
    })
    .transform((v) => (isBlank(v) ? null : v))
}

/** Multi-reference validator: array of FKs, must be non-empty when required.
 *
 * Pre-processes the input to flatten any accidentally-nested arrays and drop
 * blank items, so a stale form state like `[["3","4"]]` still validates as
 * the expected `["3","4"]` rather than tripping the inner string check. */
function multiReferenceSchema(p: PropertyJSON, t: Translator): ZodType {
  const label = p.label
  const normalize = (raw: unknown): Array<string | number> => {
    if (raw == null) return []
    const items = Array.isArray(raw) ? raw : [raw]
    const out: Array<string | number> = []
    for (const item of items) {
      if (Array.isArray(item)) {
        for (const sub of item) {
          if (sub != null && sub !== '') out.push(sub as string | number)
        }
      } else if (item != null && item !== '') {
        out.push(item as string | number)
      }
    }
    return out
  }
  return z
    .preprocess(normalize, z.array(z.union([z.string(), z.number()])))
    .superRefine((value, ctx) => {
      if (p.isRequired && value.length === 0) {
        ctx.addIssue({ code: 'custom', message: t('validation:emptySelection', { label }) })
      }
    })
}

/** File validator: single-file values are storage keys (string/null), while
 * multi-file values are arrays of storage keys. */
function fileSchema(p: PropertyJSON, t: Translator): ZodType {
  if (p.isArray) {
    return multiReferenceSchema(p, t)
  }
  return stringSchema(p, t)
}

/** Enum validator from `availableValues`. Unmatched value → notInList. */
function enumSchema(p: PropertyJSON, t: Translator): ZodType {
  const label = p.label
  const allowed = new Set((p.availableValues ?? []).map((v) => v.value))
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? '' : String(v)))
    .superRefine((value, ctx) => {
      if (value === '') {
        if (p.isRequired) {
          ctx.addIssue({ code: 'custom', message: t('validation:required', { label }) })
        }
        return
      }
      if (!allowed.has(value)) {
        ctx.addIssue({ code: 'custom', message: t('validation:notInList', { label }) })
      }
    })
    .transform((v) => (v === '' ? null : v))
}

/** JSON validator: accepts any JSON-serializable value (object/array/null).
 *
 * Unlike string fields, json fields hold a parsed JavaScript value — the
 * JsonEditor emits objects/arrays directly. The schema passes them through
 * as-is; only the required check (null/undefined → error) is applied. */
function jsonSchema(p: PropertyJSON, t: Translator): ZodType {
  const label = p.label
  return z
    .unknown()
    .superRefine((v, ctx) => {
      if ((v == null || v === '') && p.isRequired) {
        ctx.addIssue({ code: 'custom', message: t('validation:required', { label }) })
      }
    })
    .transform((v) => (v === '' ? null : v))
}

/** Many-to-many validator: array of `{ id, ...extras }` items.
 *
 * The M2M editor emits an array of objects (id of the referenced record plus
 * arbitrary junction extra fields, e.g. `addedAt`, `position`). Bare ids are
 * also accepted and normalized into `{ id }` objects so legacy form state
 * doesn't trip the schema. Extra fields are passed through untouched —
 * the backend's m2m feature persists whatever it recognises and ignores
 * the rest. */
function m2mSchema(p: PropertyJSON, t: Translator): ZodType {
  const label = p.label
  const normalize = (raw: unknown): Array<Record<string, unknown>> => {
    if (raw == null) return []
    const items = Array.isArray(raw) ? raw : [raw]
    const out: Array<Record<string, unknown>> = []
    for (const item of items) {
      if (item == null || item === '') continue
      if (typeof item === 'string' || typeof item === 'number') {
        out.push({ id: String(item) })
        continue
      }
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const id = obj.id ?? obj.value
        if (id == null || id === '') continue
        out.push({ ...obj, id: String(id) })
      }
    }
    return out
  }
  return z
    .preprocess(normalize, z.array(z.record(z.string(), z.unknown())))
    .superRefine((value, ctx) => {
      if (p.isRequired && value.length === 0) {
        ctx.addIssue({ code: 'custom', message: t('validation:emptySelection', { label }) })
      }
    })
}

/** Build the Zod schema for a property without considering `showWhen`. */
function buildPropertySchemaInner(p: PropertyJSON, t: Translator): ZodType {
  // M2M is structurally different from a multi-reference — its values are
  // `{ id, ...extras }` objects, not bare FKs. Branch first so the
  // `p.reference` check below doesn't capture it.
  if (p.type === 'm2m') {
    return m2mSchema(p, t)
  }
  // Enum-like properties always go through the availableValues path —
  // overrides the raw type (e.g. a string with a fixed set of options).
  if (p.availableValues && p.availableValues.length > 0) {
    return enumSchema(p, t)
  }
  if (p.reference) {
    return p.isArray ? multiReferenceSchema(p, t) : referenceSchema(p, t)
  }
  switch (p.type) {
  case 'boolean':
    return booleanSchema(p, t)
  case 'number':
  case 'float':
  case 'currency':
  case 'money':
    return numberSchema(p, t, false)
  case 'integer':
    return numberSchema(p, t, true)
  case 'date':
  case 'datetime':
  case 'datetime-local':
    return dateSchema(p, t)
  case 'email':
    return stringSchema(p, t, 'email')
  case 'url':
    return stringSchema(p, t, 'url')
  case 'uuid':
    return stringSchema(p, t, 'uuid')
  case 'json':
    return jsonSchema(p, t)
  case 'string':
  case 'text':
  case 'textarea':
  case 'password':
  case 'richtext':
  case 'color':
  case 'file':
    return fileSchema(p, t)
  default:
    return stringSchema(p, t)
  }
}

/**
 * Map a PropertyJSON to its Zod schema. When the property has a `showWhen`
 * rule and a `getValues` getter is supplied, the schema short-circuits to
 * a no-op while the rule does not match — letting hidden branches pass
 * validation without their required/format checks tripping submission.
 */
export function buildPropertySchema(
  p: PropertyJSON,
  t: Translator,
  getValues?: FormValuesGetter,
): ZodType {
  const inner = buildPropertySchemaInner(p, t)
  if (!p.showWhen || !getValues) return inner

  // Wrap: only forward to `inner` when visible. Hidden → accept anything,
  // pass it through unchanged. We re-emit issues from `inner` so error
  // messages and paths stay identical to the non-conditional case.
  return z
    .any()
    .superRefine((value, ctx) => {
      if (!evaluateShowWhen(p.showWhen, getValues())) return
      const result = inner.safeParse(value)
      if (!result.success) {
        // Zod 4's `RefinementCtx.addIssue` accepts a structurally looser
        // shape than `$ZodIssue`; spread into a plain object to satisfy
        // the inferred parameter type.
        for (const issue of result.error.issues) {
          ctx.addIssue({ ...issue } as Parameters<typeof ctx.addIssue>[0])
        }
      }
    })
    .transform((value) => {
      if (!evaluateShowWhen(p.showWhen, getValues())) return value
      const result = inner.safeParse(value)
      return result.success ? result.data : value
    })
}

/** Build a Zod object schema covering every editable property in a resource. */
export function buildValidationSchema(
  properties: PropertyJSON[],
  t: Translator,
  getValues?: FormValuesGetter,
): z.ZodObject<Record<string, ZodType>> {
  const shape: Record<string, ZodType> = {}
  for (const p of properties) shape[p.path] = buildPropertySchema(p, t, getValues)
  return z.object(shape)
}

/** Sensible empty default per type so RHF stays controlled from first render. */
export function defaultValueFor(p: PropertyJSON): unknown {
  if (p.type === 'boolean') return false
  if (p.type === 'json') return null
  if (p.isArray) return []
  return ''
}
