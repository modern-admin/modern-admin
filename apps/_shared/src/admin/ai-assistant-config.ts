// Project-wide defaults for the AI assistant configuration block.
// The reference app uses the built-in API Stock adapter and gates the
// settings UI behind the `admin` role; only the optional `rawQuery` slot
// (host SQL executor) and the API key source typically differ.

import type { IAiAssistantQueueDispatcher, ILlmProvider } from '@modern-admin/nest'

export interface AiAssistantConfigBase {
  provider?: ILlmProvider
  enabled?: boolean
  defaultModel?: string
  apiKey?: string
  systemPrompt?: string
  includeResourceIds?: string[]
  excludeResourceIds?: string[]
  debug?: boolean
  maxRecordsPerTool?: number
  maxSteps?: number
  chatRoles?: string[]
  manageRoles?: string[]
  appName?: string
  appUrl?: string
  rawQuery?: (sql: string) => Promise<unknown[]>
  queue?: {
    dispatcher?: IAiAssistantQueueDispatcher
    attempts?: number
    backoffMs?: number
    removeOnComplete?: boolean | number
    removeOnFail?: boolean | number
  }
}

export interface BuildAiAssistantConfigOptions {
  /** Override model id. Defaults to `gemini-3.6-flash`. */
  defaultModel?: string
  /** Roles allowed to view/edit AI assistant settings. Defaults to `['admin']`. */
  manageRoles?: string[]
  /**
   * Optional read-only SQL executor. See `ModernAdminModuleOptions.aiAssistant.rawQuery`
   * for the security contract — the implementation MUST enforce read-only
   * access at the database level (READ ONLY transaction or dedicated RO user).
   */
  rawQuery?: AiAssistantConfigBase['rawQuery']
  /** Extra fields merged into the resulting config (e.g. `appName`, `systemPrompt`). */
  overrides?: Partial<AiAssistantConfigBase>
}

const isTruthyEnv = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'true', 'yes', 'on', 'debug'].includes(value.toLowerCase())

const DEFAULT_EXCLUDED_RESOURCE_IDS = [
  'MaSession',
  'MaAccount',
  'MaVerification',
  'MaApiKey',
  'MaLog',
  'MaWebhook',
  'MaWebhookDelivery',
  'MaConfig',
  'MaHistory',
  'MaAiTask',
  'MaAiTaskEvent',
  'MaCache',
]

/**
 * Builds an `aiAssistant` config block with the project defaults.
 *
 * - `defaultModel`: `gemini-3.6-flash`
 * - `manageRoles`: `['admin']`
 * - `apiKey` from `process.env.API_STOCK_KEY` when set (UI-stored
 *   value from configStore takes precedence once configured).
 * - `debug` from `AI_ASSISTANT_DEBUG=1`.
 */
export const buildAiAssistantConfig = (
  options: BuildAiAssistantConfigOptions = {},
): AiAssistantConfigBase => {
  const {
    defaultModel = 'gemini-3.6-flash',
    manageRoles = ['admin'],
    rawQuery,
    overrides = {},
  } = options
  const excludeResourceIds = overrides.excludeResourceIds ?? DEFAULT_EXCLUDED_RESOURCE_IDS
  return {
    defaultModel,
    manageRoles,
    excludeResourceIds,
    ...(isTruthyEnv(process.env.AI_ASSISTANT_DEBUG) ? { debug: true } : {}),
    ...(process.env.API_STOCK_KEY ? { apiKey: process.env.API_STOCK_KEY } : {}),
    ...(rawQuery ? { rawQuery } : {}),
    ...overrides,
  }
}
