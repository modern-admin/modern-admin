// Project-wide defaults for the AI assistant configuration block.
// Both reference apps default to OpenRouter's `gpt-4o-mini` and gate the
// settings UI behind the `admin` role; only the optional `rawQuery` slot
// (host SQL executor) and the API key source typically differ.

export interface AiAssistantConfigBase {
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
    attempts?: number
    backoffMs?: number
    removeOnComplete?: boolean | number
    removeOnFail?: boolean | number
  }
}

export interface BuildAiAssistantConfigOptions {
  /** Override model id. Defaults to `google/gemini-3.1-flash-lite-preview`. */
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
 * - `defaultModel`: `google/gemini-3.1-flash-lite-preview`
 * - `manageRoles`: `['admin']`
 * - `apiKey` from `process.env.OPENROUTER_API_KEY` when set (UI-stored
 *   value from configStore takes precedence once configured).
 * - `debug` from `AI_ASSISTANT_DEBUG=1`.
 */
export const buildAiAssistantConfig = (
  options: BuildAiAssistantConfigOptions = {},
): AiAssistantConfigBase => {
  const {
    defaultModel = 'google/gemini-3.1-flash-lite-preview',
    manageRoles = ['admin'],
    rawQuery,
    overrides = {},
  } = options
  const excludeResourceIds = overrides.excludeResourceIds ?? DEFAULT_EXCLUDED_RESOURCE_IDS
  return {
    defaultModel,
    manageRoles,
    excludeResourceIds,
    ...(isTruthyEnv(process.env.AI_ASSISTANT_DEBUG)
      ? { debug: true }
      : {}),
    ...(process.env.OPENROUTER_API_KEY ? { apiKey: process.env.OPENROUTER_API_KEY } : {}),
    ...(rawQuery ? { rawQuery } : {}),
    ...overrides,
  }
}
