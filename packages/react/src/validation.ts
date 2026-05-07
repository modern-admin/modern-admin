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

/** Map a single PropertyJSON to its Zod schema, taking type + flags into account. */
export function buildPropertySchema(p: PropertyJSON, t: Translator): ZodType {
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
    case 'string':
    case 'text':
    case 'textarea':
    case 'password':
    case 'richtext':
    case 'json':
    default:
      return stringSchema(p, t)
  }
}

/** Build a Zod object schema covering every editable property in a resource. */
export function buildValidationSchema(
  properties: PropertyJSON[],
  t: Translator,
): z.ZodObject<Record<string, ZodType>> {
  const shape: Record<string, ZodType> = {}
  for (const p of properties) shape[p.path] = buildPropertySchema(p, t)
  return z.object(shape)
}

/** Sensible empty default per type so RHF stays controlled from first render. */
export function defaultValueFor(p: PropertyJSON): unknown {
  if (p.type === 'boolean') return false
  if (p.isArray) return []
  return ''
}
