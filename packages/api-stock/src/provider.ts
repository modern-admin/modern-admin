import {
  mediaGenerationCatalogModelZ,
  mediaGenerationResultZ,
  type IMediaGenerationProvider,
  type MediaGenerationCatalogModel,
  type MediaGenerationCreateInput,
  type MediaGenerationFileType,
  type MediaGenerationProviderRequestOptions,
  type MediaGenerationResult,
  type MediaGenerationStatus,
} from '@modern-admin/core'
import { z } from 'zod'

const DEFAULT_BASE_URL = 'https://api.api-stock.com/api/v1'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_CATALOG_TTL_MS = 60_000

const apiStockCatalogParamZ = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  kind: z.enum(['string', 'number', 'boolean']),
  isArray: z.boolean(),
  required: z.boolean(),
  default: z.unknown().optional(),
  options: z.array(z.object({
    value: z.union([z.string(), z.number()]),
    label: z.string(),
  })).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().optional(),
  isMedia: z.boolean(),
  isPrompt: z.boolean(),
  multiline: z.boolean(),
  deprecated: z.boolean(),
}).passthrough()

const apiStockCatalogModelZ = z.object({
  id: z.string(),
  group: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.string(),
  kind: z.enum(['media', 'llm']),
  vendor: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  pricing: z.array(z.object({
    key: z.string(),
    price: z.string(),
    isDefault: z.boolean(),
    dimensions: z.record(z.string(), z.string()).optional(),
    unitPrice: z.string().optional(),
  }).passthrough()).default([]),
  priceMultiplier: z.object({
    param: z.string(),
    catalogValue: z.number(),
  }).optional(),
  priceFrom: z.string().optional(),
  params: z.array(apiStockCatalogParamZ).default([]),
}).passthrough()

const apiStockCatalogZ = z.array(apiStockCatalogModelZ)

const apiStockTaskDataZ = z.object({
  taskId: z.string().min(1),
  status: z.enum(['not_started', 'processing', 'finished', 'failed', 'expired']),
  files: z.array(z.object({
    fileUrl: z.url(),
    fileType: z.enum(['image', 'video', 'music']),
  })).optional(),
  output: z.record(z.string(), z.unknown()).nullish(),
  errorMessage: z.string().nullish(),
  createdTime: z.string().optional(),
  createdAt: z.string().optional(),
})

const apiStockTaskResponseZ = z.object({
  code: z.number().int(),
  data: apiStockTaskDataZ,
})

export interface ApiStockMediaGenerationProviderOptions {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  catalogTtlMs?: number
}

export class ApiStockRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
    public readonly retryAfter: string | null,
  ) {
    super(message)
    this.name = 'ApiStockRequestError'
  }
}

const normalizeType = (type: string): MediaGenerationFileType | null => {
  const normalized = type.toLowerCase()
  if (normalized === 'image' || normalized === 'video' || normalized === 'music') {
    return normalized
  }
  return null
}

const normalizeStatus = (
  status: z.infer<typeof apiStockTaskDataZ>['status'],
): MediaGenerationStatus => status === 'not_started' ? 'pending' : status

const toResult = (response: z.infer<typeof apiStockTaskResponseZ>): MediaGenerationResult => {
  const data = response.data
  return mediaGenerationResultZ.parse({
    externalTaskId: data.taskId,
    status: normalizeStatus(data.status),
    files: (data.files ?? []).map((file) => ({ url: file.fileUrl, type: file.fileType })),
    ...(data.output ? { output: data.output } : {}),
    ...(data.errorMessage ? { error: data.errorMessage } : {}),
    ...(data.createdTime ?? data.createdAt
      ? { createdAt: data.createdTime ?? data.createdAt }
      : {}),
  })
}

export class ApiStockMediaGenerationProvider implements IMediaGenerationProvider {
  readonly id = 'api-stock'
  readonly displayName = 'API Stock'
  readonly apiKeyUrl = 'https://api-stock.com'
  // Finalized media is served from the API Stock storage host and its
  // `fileN.aitohumanize.com` CDN. Hosts can add more via `allowedDownloadHosts`.
  readonly allowedFileHosts = ['storage.api-stock.com', 'aitohumanize.com'] as const

  private readonly baseUrl: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly timeoutMs: number
  private readonly catalogTtlMs: number
  private catalogCache: { expiresAt: number; models: MediaGenerationCatalogModel[] } | null = null
  private catalogRequest: Promise<MediaGenerationCatalogModel[]> | null = null

  constructor(options: ApiStockMediaGenerationProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.catalogTtlMs = options.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS
  }

  async getCatalog(
    options: MediaGenerationProviderRequestOptions,
  ): Promise<MediaGenerationCatalogModel[]> {
    if (this.catalogCache && this.catalogCache.expiresAt > Date.now()) {
      return this.catalogCache.models
    }
    if (this.catalogRequest) return this.catalogRequest
    this.catalogRequest = this.loadCatalog(options).finally(() => {
      this.catalogRequest = null
    })
    return this.catalogRequest
  }

  async create(
    input: MediaGenerationCreateInput,
    options: MediaGenerationProviderRequestOptions,
  ): Promise<MediaGenerationResult> {
    const response = await this.request('/generation/create', options, {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        input: input.input,
        ...(input.webhookUrl ? { webhook: input.webhookUrl } : {}),
      }),
    })
    return toResult(apiStockTaskResponseZ.parse(response))
  }

  async getStatus(
    externalTaskId: string,
    options: MediaGenerationProviderRequestOptions,
  ): Promise<MediaGenerationResult> {
    const response = await this.request(
      `/task/status/${encodeURIComponent(externalTaskId)}`,
      options,
    )
    return toResult(apiStockTaskResponseZ.parse(response))
  }

  private async loadCatalog(
    options: MediaGenerationProviderRequestOptions,
  ): Promise<MediaGenerationCatalogModel[]> {
    const response = apiStockCatalogZ.parse(await this.request('/catalog', options))
    const models = response.flatMap((model): MediaGenerationCatalogModel[] => {
      if (model.kind !== 'media') return []
      const type = normalizeType(model.type)
      if (!type) return []
      return [mediaGenerationCatalogModelZ.parse({
        id: model.id,
        group: model.group ?? '',
        name: model.name,
        ...(model.description ? { description: model.description } : {}),
        type,
        ...(model.vendor ? { vendor: model.vendor } : {}),
        tags: model.tags,
        capabilities: model.capabilities,
        pricing: model.pricing,
        ...(model.priceMultiplier ? { priceMultiplier: model.priceMultiplier } : {}),
        ...(model.priceFrom ? { priceFrom: model.priceFrom } : {}),
        params: model.params,
      })]
    })
    this.catalogCache = {
      expiresAt: Date.now() + Math.max(0, this.catalogTtlMs),
      models,
    }
    return models
  }

  private async request(
    path: string,
    options: MediaGenerationProviderRequestOptions,
    init: RequestInit = {},
  ): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new ApiStockRequestError(
        `API Stock request failed with HTTP ${response.status}`,
        response.status,
        body.slice(0, 2_000),
        response.headers.get('retry-after'),
      )
    }
    return response.json()
  }
}
