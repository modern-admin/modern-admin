/**
 * Build a dynamic Zod schema (and a matching natural-language field guide)
 * from a resource's editable property metadata, taking AI-fill per-field
 * options into account.
 *
 * Every produced field is nullable (`.nullable()`): vision models routinely
 * cannot extract every field from every image, and the schema must let them
 * say "unknown" explicitly rather than hallucinating.
 */

import { z, type ZodTypeAny } from 'zod'
import type { PropertyJSON } from '@modern-admin/core'
import type { AiFillFieldConfig } from './types.js'

export interface BuiltAiFillSchema {
  /** Zod schema passed to `generateObject`. Top-level shape: `{ key: T | null }`. */
  schema: z.ZodObject<Record<string, z.ZodNullable<ZodTypeAny>>>
  /** Human-readable description of each included field — added to the system
   *  prompt so the model knows what each property means semantically. */
  fieldGuide: string
  /** Paths included in the schema (in declaration order). */
  includedPaths: string[]
}

/** Property `type` values we know how to map to a Zod primitive. */
const STRING_LIKE = new Set([
  'string', 'text', 'textarea', 'richtext', 'email', 'url', 'uuid', 'slug', 'phone',
])
const NUMBER_LIKE = new Set(['number', 'float', 'decimal', 'currency'])
const INT_LIKE = new Set(['integer', 'int', 'bigint'])
const SKIP_TYPES = new Set([
  // Identity, computed columns, opaque blobs — never AI-fillable.
  'id', 'reference', 'file', 'password', 'json', 'mixed', 'key-value', 'm2m',
])

interface FieldBuild {
  path: string
  description: string
  zodType: ZodTypeAny
}

function buildField(
  property: PropertyJSON,
  fieldConfig: AiFillFieldConfig | undefined,
): FieldBuild | null {
  if (property.isId || property.isDisabled) return null
  if (SKIP_TYPES.has(property.type)) return null
  if (fieldConfig?.exclude) return null
  // Skip multi-valued properties — model output via Zod array is brittle for
  // arbitrary item shapes; users can opt-in explicitly per-field once we have
  // a story for it.
  if (property.isArray) return null

  // Enum-style properties: prefer the enum schema over plain string when the
  // list is small enough to fit in a prompt.
  if (property.availableValues && property.availableValues.length > 0) {
    const values = property.availableValues.map((v) => v.value)
    if (values.length === 0) return null
    const literals = values.map((v) => z.literal(v))
    // z.enum requires non-empty tuple — assemble via z.union for safety.
    const enumZod = literals.length === 1
      ? literals[0]!
      : z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
    return {
      path: property.path,
      description: [
        `"${property.label}"`,
        `one of: ${values.map((v) => `"${v}"`).join(', ')}`,
        fieldConfig?.hint,
      ].filter(Boolean).join(' — '),
      zodType: enumZod,
    }
  }

  let zodType: ZodTypeAny
  if (STRING_LIKE.has(property.type)) zodType = z.string()
  else if (INT_LIKE.has(property.type)) zodType = z.number().int()
  else if (NUMBER_LIKE.has(property.type)) zodType = z.number()
  else if (property.type === 'boolean') zodType = z.boolean()
  else if (property.type === 'date' || property.type === 'datetime') {
    // ISO 8601 string — most models output strings reliably; we let the
    // application layer parse to Date if needed.
    zodType = z.string()
  } else {
    // Unknown type — fall back to string to be permissive.
    zodType = z.string()
  }

  const parts: string[] = [`"${property.label}"`, `type ${property.type}`]
  if (property.description) parts.push(property.description)
  if (fieldConfig?.hint) parts.push(fieldConfig.hint)

  return {
    path: property.path,
    description: parts.join(' — '),
    zodType,
  }
}

export function buildAiFillSchema(
  editableProperties: PropertyJSON[],
  fieldConfigs: Record<string, AiFillFieldConfig> | undefined,
): BuiltAiFillSchema {
  const shape: Record<string, z.ZodNullable<ZodTypeAny>> = {}
  const guideLines: string[] = []
  const includedPaths: string[] = []

  for (const property of editableProperties) {
    const built = buildField(property, fieldConfigs?.[property.path])
    if (!built) continue
    shape[built.path] = built.zodType.nullable()
    guideLines.push(`  • ${built.path}: ${built.description}`)
    includedPaths.push(built.path)
  }

  // .strict() to reject extra keys; structured output providers honour this.
  const schema = z.object(shape).strict()
  const fieldGuide = guideLines.length === 0
    ? '(no fields available)'
    : guideLines.join('\n')
  return { schema, fieldGuide, includedPaths }
}
