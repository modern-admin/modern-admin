import { z } from 'zod'

export const mediaGenerationFileTypeZ = z.enum(['image', 'video', 'music'])
export type MediaGenerationFileType = z.infer<typeof mediaGenerationFileTypeZ>

export const mediaGenerationStatusZ = z.enum([
  'pending',
  'processing',
  'finished',
  'failed',
  'expired',
])
export type MediaGenerationStatus = z.infer<typeof mediaGenerationStatusZ>

export const mediaGenerationCatalogParamZ = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['string', 'number', 'boolean']),
  isArray: z.boolean(),
  required: z.boolean(),
  default: z.unknown().optional(),
  options: z
    .array(
      z.object({
        value: z.union([z.string(), z.number()]),
        label: z.string(),
      }),
    )
    .optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().optional(),
  isMedia: z.boolean(),
  isPrompt: z.boolean(),
  multiline: z.boolean(),
  deprecated: z.boolean(),
})
export type MediaGenerationCatalogParam = z.infer<typeof mediaGenerationCatalogParamZ>

export const mediaGenerationCatalogModelZ = z.object({
  id: z.string().min(1),
  group: z.string().default(''),
  name: z.string().min(1),
  description: z.string().optional(),
  type: mediaGenerationFileTypeZ,
  vendor: z.string().optional(),
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  pricing: z
    .array(
      z.object({
        key: z.string(),
        price: z.string(),
        isDefault: z.boolean(),
        dimensions: z.record(z.string(), z.string()).optional(),
        unitPrice: z.string().optional(),
      }),
    )
    .default([]),
  priceMultiplier: z
    .object({
      param: z.string(),
      catalogValue: z.number(),
    })
    .optional(),
  priceFrom: z.string().optional(),
  params: z.array(mediaGenerationCatalogParamZ).default([]),
})
export type MediaGenerationCatalogModel = z.infer<typeof mediaGenerationCatalogModelZ>

const comparableCatalogValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.join(',')
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Estimate a USD request price from the provider catalog, or null when pricing is unavailable. */
export const estimateMediaGenerationPrice = (
  model: MediaGenerationCatalogModel,
  input: Record<string, unknown>,
): number | null => {
  const matches = model.pricing
    .filter((row) =>
      Object.entries(row.dimensions ?? {}).every(
        ([name, expected]) => comparableCatalogValue(input[name]) === expected,
      ),
    )
    .sort(
      (left, right) =>
        Object.keys(right.dimensions ?? {}).length - Object.keys(left.dimensions ?? {}).length,
    )
  const row = matches[0] ?? model.pricing.find((candidate) => candidate.isDefault)
  const fallback = Number(row?.price ?? model.priceFrom)
  if (!row) return Number.isFinite(fallback) && fallback >= 0 ? fallback : null
  if (!model.priceMultiplier || !row.unitPrice) {
    return Number.isFinite(fallback) && fallback >= 0 ? fallback : null
  }
  const quantity = Number(input[model.priceMultiplier.param])
  const unitPrice = Number(row.unitPrice)
  const estimate = quantity * unitPrice
  return Number.isFinite(estimate) && estimate >= 0 ? estimate : null
}

export const mediaGenerationFileZ = z.object({
  url: z.url(),
  type: mediaGenerationFileTypeZ,
})
export type MediaGenerationFile = z.infer<typeof mediaGenerationFileZ>

export const mediaGenerationResultZ = z.object({
  externalTaskId: z.string().min(1),
  status: mediaGenerationStatusZ,
  files: z.array(mediaGenerationFileZ).default([]),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
})
export type MediaGenerationResult = z.infer<typeof mediaGenerationResultZ>

export interface MediaGenerationCreateInput {
  model: string
  input: Record<string, unknown>
  /**
   * Public HTTPS callback the provider should notify on completion. Omitted
   * when no `webhookBaseUrl` is configured, in which case the server falls back
   * to polling `getStatus`.
   */
  webhookUrl?: string
}

export interface MediaGenerationProviderRequestOptions {
  /** Credential resolved by the server. It must never be serialized to a task or response. */
  apiKey: string
  signal?: AbortSignal
}

/** Vendor-neutral server port for asynchronous media generation providers. */
export interface IMediaGenerationProvider {
  readonly id: string
  readonly displayName: string
  readonly apiKeyUrl: string | null
  /** Provider-controlled hosts from which finalized media may be imported. */
  readonly allowedFileHosts?: readonly string[]

  getCatalog(options: MediaGenerationProviderRequestOptions): Promise<MediaGenerationCatalogModel[]>
  create(
    input: MediaGenerationCreateInput,
    options: MediaGenerationProviderRequestOptions,
  ): Promise<MediaGenerationResult>
  getStatus(
    externalTaskId: string,
    options: MediaGenerationProviderRequestOptions,
  ): Promise<MediaGenerationResult>
}
