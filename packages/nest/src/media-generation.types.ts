import type { AiTask, IMediaGenerationProvider, MediaGenerationFileType } from '@modern-admin/core'

export interface MediaGenerationOptions {
  provider: IMediaGenerationProvider
  enabled?: boolean
  /** Seed credential from the environment. A key saved in Settings takes precedence. */
  apiKey?: string
  /**
   * Public HTTPS origin used to build per-task API Stock callback URLs. When
   * omitted, the provider is submitted without a webhook and the server polls
   * `getStatus` until the task finishes (useful for local development where no
   * public callback URL is available).
   */
  webhookBaseUrl?: string
  /** At least 32 characters. Used to derive a different callback token for every local task. */
  webhookSecret?: string
  /** Interval between `getStatus` polls when no webhook is configured. Defaults to 3s. */
  pollIntervalMs?: number
  /** Overall deadline for polling a webhook-less task before it is failed. Defaults to 10min. */
  maxPollMs?: number
  allowedModels?: string[]
  allowedMediaTypes?: MediaGenerationFileType[]
  maxFiles?: number
  maxDownloadBytes?: number
  /** Explicit HTTPS host allowlist for imported provider results. */
  allowedDownloadHosts?: string[]
  /** Per-user estimated API Stock spend allowed in one UTC calendar month. */
  monthlyBudgetUsdPerUser?: number
  generateRoles?: string[]
  manageRoles?: string[]
  /** Log the model and prompt sent to the provider. Falls back to `MEDIA_GENERATION_DEBUG`. */
  debug?: boolean
}

export interface MediaGenerationStoredSettings {
  enabled?: boolean
  provider?: string
  apiKey?: string
}

export interface MediaGenerationPublicSettings {
  enabled: boolean
  configured: boolean
  provider: string
  providerName: string
  apiKeyUrl: string | null
  maskedApiKey: string | null
  canManage: boolean
  canGenerate: boolean
}

export interface MediaGenerationTaskOutput extends Record<string, unknown> {
  providerTaskId?: string
  providerStatus?: string
  files?: Array<{ url: string; type: MediaGenerationFileType }>
  providerOutput?: Record<string, unknown>
  applied?: {
    fileIndex: number
    key: string
    url: string
    resourceId: string
    recordId: string
    property: string
    appliedAt: string
  }
}

export type MediaGenerationTask = AiTask & { output?: MediaGenerationTaskOutput }
