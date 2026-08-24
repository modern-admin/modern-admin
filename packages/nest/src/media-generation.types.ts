import type {
  AiTask,
  IMediaGenerationProvider,
  MediaGenerationFileType,
} from '@modern-admin/core'

export interface MediaGenerationOptions {
  provider: IMediaGenerationProvider
  enabled?: boolean
  /** Seed credential from the environment. A key saved in Settings takes precedence. */
  apiKey?: string
  /** Public HTTPS origin used to build per-task API Stock callback URLs. */
  webhookBaseUrl?: string
  /** At least 32 characters. Used to derive a different callback token for every local task. */
  webhookSecret?: string
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
