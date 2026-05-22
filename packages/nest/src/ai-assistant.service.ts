import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { generateText, stepCountIs } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { Queue } from 'bullmq'
import {
  type AiTask,
  type CurrentAdmin,
  dashboardBlobZ,
  EMPTY_DASHBOARD,
  type IAiTaskStore,
  type IConfigStore,
  type IDashboardStore,
  ModernAdmin,
} from '@modern-admin/core'
import { builtinLocales, I18n } from '@modern-admin/i18n'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import type { ModernAdminModuleOptions } from './module.js'
import { type AiAssistantCitation, type AiAssistantSqlResource, buildAiAssistantTools, } from './ai-assistant-tools.js'
import { AI_ASSISTANT_CHAT_JOB, AI_ASSISTANT_QUEUE } from './ai-assistant.constants.js'
import type {
  AiAssistantChatJobData,
  AiAssistantChatMessageInput,
  AiAssistantTaskOutput,
  AiClientContext,
  AiUiAction,
} from './ai-assistant.types.js'

export interface AiAssistantStoredSettings {
  enabled?: boolean
  provider?: 'openrouter'
  model?: string
  apiKey?: string
  systemPrompt?: string
}

export interface AiAssistantPublicSettings {
  enabled: boolean
  configured: boolean
  provider: 'openrouter'
  model: string
  maskedApiKey: string | null
  systemPrompt: string
  canManage: boolean
  canChat: boolean
  readOnly: boolean
}

export interface AiAssistantChatHistoryItem {
  conversationId: string
  taskId: string
  title: string
  status: AiTask['status']
  updatedAt: string
}

export const AI_ASSISTANT_SETTINGS_KEY = 'modern-admin.ai-assistant'
const SETTINGS_KEY = AI_ASSISTANT_SETTINGS_KEY

const isTruthyEnv = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'true', 'yes', 'on', 'debug'].includes(value.toLowerCase())

/** Trim a `CurrentAdmin` to the fields we actually need on the worker side. */
const minimizeCurrentAdmin = (current?: CurrentAdmin): CurrentAdmin | undefined => {
  if (!current) return undefined
  const minimal: CurrentAdmin = {} as CurrentAdmin
  if (current.id !== undefined) (minimal as { id?: unknown }).id = current.id
  if (current.role !== undefined) (minimal as { role?: unknown }).role = current.role
  if (current.email !== undefined) (minimal as { email?: unknown }).email = current.email
  return minimal
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name)

  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(MODERN_ADMIN_OPTIONS) private readonly options: ModernAdminModuleOptions,
    @Optional() @InjectQueue(AI_ASSISTANT_QUEUE) private readonly queue?: Queue,
  ) {
  }

  async getSettings(currentAdmin?: CurrentAdmin): Promise<AiAssistantPublicSettings> {
    const settings = await this.loadSettings()
    return this.toPublicSettings(settings, currentAdmin)
  }

  async updateSettings(
    input: { enabled: boolean; model: string; apiKey?: string; systemPrompt?: string },
    currentAdmin?: CurrentAdmin,
  ): Promise<AiAssistantPublicSettings> {
    this.assertManageAllowed(currentAdmin)
    const current = await this.loadSettings()
    const next: AiAssistantStoredSettings = {
      enabled: input.enabled,
      provider: 'openrouter',
      model: input.model,
      apiKey: input.apiKey !== undefined
        ? input.apiKey.trim() || current.apiKey || ''
        : (current.apiKey ?? ''),
      systemPrompt: input.systemPrompt !== undefined
        ? input.systemPrompt.trim()
        : (current.systemPrompt ?? ''),
    }
    await this.requireConfigStore().set('global', null, SETTINGS_KEY, next)
    return this.toPublicSettings(next, currentAdmin)
  }

  async enqueueChat(
    messages: AiAssistantChatMessageInput[],
    currentAdmin?: CurrentAdmin,
    requestId?: string,
    locale?: string,
    conversationId?: string,
    clientContext?: AiClientContext,
  ): Promise<{ taskId: string; status: AiTask['status'] }> {
    this.assertChatAllowed(currentAdmin)
    const settings = await this.loadSettings()
    if (!settings.enabled) {
      throw new ForbiddenException('AI assistant is disabled')
    }
    if (!settings.apiKey) {
      throw new PreconditionFailedException('AI assistant API key is not configured')
    }
    const minimalAdmin = minimizeCurrentAdmin(currentAdmin)
    const taskStore = this.requireTaskStore()
    const userId = currentAdmin?.id ? String(currentAdmin.id) : undefined
    if (requestId) {
      const existing = await this.findExistingChatTask(taskStore, requestId, userId)
      if (existing) {
        if (this.isDebugEnabled()) {
          this.logger.debug(
            `Reusing AI assistant task ${existing.id} for duplicate request ${requestId}`,
          )
        }
        return {taskId: existing.id, status: existing.status}
      }
    }
    const task = await taskStore.enqueue({
      kind: 'assistant-chat',
      userId,
      input: {
        messages,
        ...(requestId ? {requestId} : {}),
        ...(conversationId ? {conversationId} : {}),
        ...(locale ? {locale} : {}),
        ...(minimalAdmin ? {currentAdmin: minimalAdmin} : {}),
        ...(clientContext ? {clientContext} : {}),
      },
    })
    await taskStore.appendEvent(task.id, 'queued', {queuedAt: new Date().toISOString()})
    await this.requireQueue().add(
      AI_ASSISTANT_CHAT_JOB,
      {
        taskId: task.id,
        messages,
        ...(requestId ? {requestId} : {}),
        ...(conversationId ? {conversationId} : {}),
        ...(locale ? {locale} : {}),
        ...(minimalAdmin ? {currentAdmin: minimalAdmin} : {}),
        ...(clientContext ? {clientContext} : {}),
      } satisfies AiAssistantChatJobData,
      {
        attempts: this.options.aiAssistant?.queue?.attempts ?? 1,
        backoff: {
          type: 'exponential',
          delay: this.options.aiAssistant?.queue?.backoffMs ?? 1000,
        },
        removeOnComplete: this.options.aiAssistant?.queue?.removeOnComplete ?? 100,
        removeOnFail: this.options.aiAssistant?.queue?.removeOnFail ?? 500,
      },
    )
    return {taskId: task.id, status: task.status}
  }

  async listChatHistory(currentAdmin?: CurrentAdmin): Promise<AiAssistantChatHistoryItem[]> {
    this.assertChatAllowed(currentAdmin)
    const userId = currentAdmin?.id ? String(currentAdmin.id) : undefined
    if (!userId && !this.canManage(currentAdmin)) {
      throw new ForbiddenException('You are not allowed to inspect AI assistant history')
    }
    const tasks = await this.requireTaskStore().list({
      kind: 'assistant-chat',
      ...(userId ? {userId} : {}),
      limit: 100,
    })
    const grouped = new Map<string, AiTask>()
    for (const task of tasks) {
      const conversationId = typeof task.input?.conversationId === 'string'
        ? task.input.conversationId
        : task.id
      const current = grouped.get(conversationId)
      if (!current || task.updatedAt > current.updatedAt) grouped.set(conversationId, task)
    }
    return [...grouped.entries()]
      .map(([conversationId, task]) => ({
        conversationId,
        taskId: task.id,
        title: titleFromTask(task),
        status: task.status,
        updatedAt: task.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20)
  }

  async getTask(taskId: string, currentAdmin?: CurrentAdmin): Promise<AiTask> {
    const task = await this.requireTaskStore().get(taskId)
    if (!task) throw new NotFoundException(`AI task not found: ${taskId}`)
    const currentUserId = currentAdmin?.id ? String(currentAdmin.id) : undefined
    if (task.userId && task.userId !== currentUserId && !this.canManage(currentAdmin)) {
      throw new ForbiddenException('You are not allowed to inspect this AI task')
    }
    return task
  }

  async runChatJob(data: AiAssistantChatJobData): Promise<AiAssistantTaskOutput> {
    const taskStore = this.requireTaskStore()
    const debug = this.isDebugEnabled()
    if (debug) {
      this.logger.debug(
        `Starting AI assistant task ${data.taskId}; messages=${data.messages.length}`,
      )
    }
    await taskStore.updateStatus(data.taskId, {status: 'running', progress: 10})
    const settings = await this.loadSettings()
    if (!settings.enabled) {
      throw new ForbiddenException('AI assistant is disabled')
    }
    if (!settings.apiKey) {
      throw new PreconditionFailedException('AI assistant API key is not configured')
    }

    const openrouter = createOpenRouter({
      apiKey: settings.apiKey,
      appName: this.options.aiAssistant?.appName ?? 'Modern Admin',
      ...(this.options.aiAssistant?.appUrl ? {appUrl: this.options.aiAssistant.appUrl} : {}),
    })

    // Build a thin dashboard store backed by the global configStore so the AI
    // can create / update / delete charts on the shared dashboard.
    let dashboardStore: IDashboardStore | undefined
    if (this.options.configStore) {
      const configStore = this.options.configStore
      dashboardStore = {
        async load() {
          const raw = await configStore.get('global', null, 'dashboard:v1')
          const parsed = dashboardBlobZ.safeParse(raw)
          return parsed.success ? parsed.data : EMPTY_DASHBOARD
        },
        async save(_userId, blob) {
          await configStore.set('global', null, 'dashboard:v1', blob)
        },
      }
    }

    // Collector that tools push into; surfaced to the FE in `output.uiActions`
    // so the widget can navigate / refresh in response to AI side-effects.
    const uiActions: AiUiAction[] = []

    const built = buildAiAssistantTools({
      admin: this.admin,
      currentAdmin: data.currentAdmin,
      includeResourceIds: this.options.aiAssistant?.includeResourceIds,
      excludeResourceIds: this.options.aiAssistant?.excludeResourceIds,
      maxRecordsPerTool: this.options.aiAssistant?.maxRecordsPerTool ?? 10,
      debug,
      ...(this.options.aiAssistant?.rawQuery ? {rawQuery: this.options.aiAssistant.rawQuery} : {}),
      ...(dashboardStore ? {dashboardStore} : {}),
      uiActions,
    })

    if (debug) {
      this.logger.debug(
        `AI assistant task ${data.taskId} built ${Object.keys(built.tools).length} tool(s): ` +
        Object.keys(built.tools).join(', '),
      )
      await taskStore.appendEvent(data.taskId, 'log', {
        level: 'debug',
        message: 'AI assistant tools built',
        toolNames: Object.keys(built.tools),
        sqlTables: built.sqlResources.map((resource) => ({
          resourceId: resource.resourceId,
          tableName: resource.tableName,
          columnCount: resource.columns.length,
        })),
      })
    }

    await taskStore.appendEvent(data.taskId, 'started', {
      startedAt: new Date().toISOString(),
      toolCount: Object.keys(built.tools).length,
      resourceIds: built.resourceIds,
    })
    await taskStore.updateStatus(data.taskId, {status: 'running', progress: 30})

    try {
      const result = await generateText({
        model: openrouter(settings.model ?? 'google/gemini-3.1-flash-lite-preview'),
        system: this.buildSystemPrompt(settings, built.descriptors, built.sqlResources, data.clientContext),
        messages: data.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        tools: built.tools,
        stopWhen: stepCountIs(this.options.aiAssistant?.maxSteps ?? 8),
      })

      if (debug) {
        this.logger.debug(
          `AI assistant task ${data.taskId} completed generation; ` +
          `toolCalls=${result.toolCalls.length}, textLength=${result.text.length}`,
        )
      }
      const citations = result.toolResults.flatMap((toolResult) => {
        const value = toolResult.output as { citations?: AiAssistantCitation[] } | undefined
        return value?.citations ?? []
      })
      const output: AiAssistantTaskOutput = {
        text: result.text.trim() || summarizeToolResults(result.toolResults, data.locale),
        citations: dedupeCitations(citations),
        toolCalls: result.toolCalls.map((toolCall) => ({toolName: toolCall.toolName})),
        uiActions: dedupeUiActions(uiActions),
      }
      await taskStore.appendEvent(data.taskId, 'result', output)
      await taskStore.updateStatus(data.taskId, {
        status: 'succeeded',
        progress: 100,
        output,
      })
      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (debug) {
        this.logger.error(
          `AI assistant task ${data.taskId} failed: ${message}`,
          error instanceof Error ? error.stack : undefined,
        )
      }
      await taskStore.appendEvent(data.taskId, 'error', {message})
      await taskStore.updateStatus(data.taskId, {
        status: 'failed',
        error: message,
      })
      throw error
    }
  }

  private requireQueue(): Queue {
    if (!this.queue) {
      throw new ServiceUnavailableException('AI assistant queue is not configured')
    }
    return this.queue
  }

  private requireTaskStore() {
    const store = this.options.aiTaskStore
    if (!store) throw new ServiceUnavailableException('AI assistant task store is not configured')
    return store
  }

  private async findExistingChatTask(
    taskStore: IAiTaskStore,
    requestId: string,
    userId: string | undefined,
  ): Promise<AiTask | null> {
    const tasks = await taskStore.list({
      kind: 'assistant-chat',
      ...(userId ? {userId} : {}),
      status: ['pending', 'running', 'succeeded'],
      limit: 20,
    })
    return tasks.find((task) => task.input?.requestId === requestId) ?? null
  }

  private async loadSettings(): Promise<AiAssistantStoredSettings> {
    const envApiKey = this.options.aiAssistant?.apiKey?.trim() ?? ''
    const defaults: AiAssistantStoredSettings = {
      enabled: this.options.aiAssistant?.enabled ?? true,
      provider: 'openrouter',
      model: this.options.aiAssistant?.defaultModel ?? 'google/gemini-3.1-flash-lite-preview',
      apiKey: envApiKey,
      systemPrompt: this.options.aiAssistant?.systemPrompt ?? '',
    }
    const raw = await this.requireConfigStore().get('global', null, SETTINGS_KEY)
    if (!raw || typeof raw !== 'object') return defaults
    const stored = raw as AiAssistantStoredSettings
    return {
      enabled: stored.enabled ?? defaults.enabled,
      provider: 'openrouter',
      model: stored.model ?? defaults.model,
      // stored key takes precedence; fall back to env-seeded key
      apiKey: stored.apiKey?.trim() || envApiKey,
      systemPrompt: stored.systemPrompt ?? defaults.systemPrompt,
    }
  }

  private requireConfigStore(): IConfigStore {
    const store = this.options.configStore
    if (!store) throw new ServiceUnavailableException('AI assistant config store is not configured')
    return store
  }

  private toPublicSettings(
    settings: AiAssistantStoredSettings,
    currentAdmin?: CurrentAdmin,
  ): AiAssistantPublicSettings {
    const apiKey = settings.apiKey?.trim() ?? ''
    return {
      enabled: settings.enabled ?? true,
      configured: apiKey.length > 0,
      provider: 'openrouter',
      model: settings.model ?? this.options.aiAssistant?.defaultModel ?? 'google/gemini-3.1-flash-lite-preview',
      maskedApiKey: apiKey ? this.maskApiKey(apiKey) : null,
      systemPrompt: settings.systemPrompt ?? '',
      canManage: this.canManage(currentAdmin),
      canChat: this.isChatAllowed(currentAdmin),
      readOnly: true,
    }
  }

  private buildSystemPrompt(
    settings: AiAssistantStoredSettings,
    descriptors: Array<{ name: string; resourceId: string; action: 'list' | 'show' | 'search' }>,
    sqlResources: AiAssistantSqlResource[],
    clientContext?: AiClientContext,
  ): string {
    const hasNavigateTool = descriptors.some((d) => d.name === 'navigate_to')
    const lines = [
      'You are the Modern Admin AI assistant.',
      'You answer questions about admin data, build reports, inspect relationships, and explain findings.',
      'You are strictly read-only for record data: never create, edit, or delete records, and never offer to do so.',
      'Use only the available tools to inspect data. Never invent records, ids, or field values.',
      'When data is insufficient, ask for the missing filter, record id, or resource explicitly.',
      'When answering, mention concrete record ids or titles, and prefer record citations over prose summaries.',
      'If the user asks for record write operations (create/edit/delete a record), reply that those tools are not available yet.',
      'IMPORTANT: After using tools, you MUST always write a final text answer summarising what you found. Never leave your reply empty — even if the answer is just a list of record titles.',
      ...(hasNavigateTool
        ? [
          'UI NAVIGATION is allowed and encouraged. You have a `navigate_to` tool that takes the user to a specific admin page. This is NOT a write operation — it only changes which page is displayed in the browser.',
          'Call `navigate_to` whenever the user asks to "open", "go to", "show me", "switch to", "перейти", "открой", or otherwise navigate. Supported routes: { name: "home" }, { name: "audit-log" }, { name: "list", resourceId }, { name: "show", resourceId, recordId }, { name: "settings", section? }.',
          'After calling `navigate_to`, briefly confirm in your text reply that you navigated the user (e.g. "Открыл пост ..."), do not say navigation is unavailable.',
          'When the user references "this", "current", "сюда", "к нему" etc., resolve the subject from the current pathname (see below) before navigating.',
        ]
        : []),
      ...(clientContext?.pathname
        ? [
          `The user is currently viewing the admin page at path "${clientContext.pathname}". Use this to ground references like "this post" or "the current record": when the path matches "/resources/<resourceId>/records/<recordId>/show", treat that resource/record as the implicit subject of the conversation.`,
        ]
        : []),
      ...(this.options.aiAssistant?.rawQuery
        ? [
          'You have access to the `execute_sql` tool for aggregation, counting, grouping, and JOIN queries.',
          'Prefer `execute_sql` over multiple list calls when the question involves counting, ranking, or comparing across records.',
          'When preparing the `query` argument for `execute_sql`, act as a PostgreSQL SQL query generator.',
          'The `query` argument MUST contain only one raw SELECT statement. No explanations, no markdown, no comments unless the fallback below is required.',
          'Use only tables and columns from the SQL schema hints below. If the requested table or column does not exist, call `execute_sql` with: SELECT 1 WHERE FALSE; -- requested column/table does not exist',
          'Write every table name exactly as shown in SQL schema hints and wrap it in double quotes, for example "post" or "regional_content".',
          'Write every column name exactly as shown in SQL schema hints and wrap it in double quotes, for example "authorId" or "postId".',
          'For aliases, prefer short quoted aliases and qualify columns as "alias"."columnName".',
          'Use true/false for boolean values, not 1/0.',
          'Use ILIKE for case-insensitive text search.',
          'Always end SQL queries with a semicolon.',
          'Do not use SQLite/MySQL introspection such as PRAGMA or pragma_table_info.',
        ]
        : []),
    ]
    if (descriptors.length > 0) {
      const grouped = new Map<string, Array<'list' | 'show' | 'search'>>()
      for (const descriptor of descriptors) {
        const list = grouped.get(descriptor.resourceId) ?? []
        list.push(descriptor.action)
        grouped.set(descriptor.resourceId, list)
      }
      const summary = [...grouped.entries()]
        .map(([resourceId, actions]) => `${resourceId}: ${actions.join(', ')}`)
        .join('; ')
      lines.push(`Available resources and actions: ${summary}.`)
    }
    if (this.options.aiAssistant?.rawQuery && sqlResources.length > 0) {
      lines.push('SQL schema hints:')
      for (const resource of sqlResources) {
        const columns = resource.columns
          .slice(0, 32)
          .map((column) => {
            const nullable = column.nullable ? 'nullable' : 'not null'
            const reference = column.reference ? `, references resource ${column.reference}` : ''
            return `"${column.name}" (${column.type}, ${nullable}${reference})`
          })
          .join(', ')
        const suffix = resource.columns.length > 32 ? ', ...' : ''
        lines.push(`- resource "${resource.resourceId}" uses SQL table "${resource.tableName}" with columns: ${columns}${suffix}`)
      }
    }
    if (settings.systemPrompt?.trim()) {
      lines.push(settings.systemPrompt.trim())
    }
    return lines.join('\n')
  }

  private isDebugEnabled(): boolean {
    return this.options.aiAssistant?.debug ??
      isTruthyEnv(process.env.AI_ASSISTANT_DEBUG)
  }

  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) return '••••'
    return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
  }

  private canManage(currentAdmin?: CurrentAdmin): boolean {
    const allowed = this.options.aiAssistant?.manageRoles ?? ['admin']
    const role = currentAdmin?.role
    return typeof role === 'string' ? allowed.includes(role) : false
  }

  private isChatAllowed(currentAdmin?: CurrentAdmin): boolean {
    const allowed = this.options.aiAssistant?.chatRoles
    if (!allowed || allowed.length === 0) return true
    const role = currentAdmin?.role
    return typeof role === 'string' && allowed.includes(role)
  }

  private assertManageAllowed(currentAdmin?: CurrentAdmin): void {
    if (!this.canManage(currentAdmin)) {
      throw new ForbiddenException('You are not allowed to manage AI assistant settings')
    }
  }

  private assertChatAllowed(currentAdmin?: CurrentAdmin): void {
    if (!this.isChatAllowed(currentAdmin)) {
      throw new ForbiddenException('You are not allowed to use AI assistant')
    }
  }
}

const dedupeCitations = (items: AiAssistantCitation[]): AiAssistantCitation[] => {
  const seen = new Set<string>()
  const result: AiAssistantCitation[] = []
  for (const item of items) {
    const key = `${item.resourceId}#${item.recordId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

const dedupeUiActions = (actions: AiUiAction[]): AiUiAction[] => {
  const seen = new Set<string>()
  const result: AiUiAction[] = []
  for (const action of actions) {
    const key = JSON.stringify(action)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(action)
  }
  return result
}

const titleFromTask = (task: AiTask): string => {
  const messages = Array.isArray(task.input?.messages)
    ? task.input.messages as Array<{ role?: unknown; content?: unknown }>
    : []
  const firstUser = messages.find((message) => message.role === 'user' && typeof message.content === 'string')
  const title = typeof firstUser?.content === 'string' ? firstUser.content.trim() : ''
  return title.length > 80 ? `${title.slice(0, 77)}...` : title || task.id
}

const translate = (locale: string | undefined, key: string, params?: Record<string, unknown>): string => {
  const runtime = new I18n({locales: builtinLocales, defaultLocale: locale ?? 'en', fallbackLocale: 'en'})
  return runtime.t(key, params)
}

const summarizeToolResults = (
  toolResults: Array<{ toolName?: string; output: unknown }>,
  locale: string | undefined,
): string => {
  const lastSuccessful = [...toolResults].reverse().find((toolResult) => {
    const output = toolResult.output as { rows?: unknown[]; records?: unknown[]; error?: unknown } | undefined
    return output && !output.error && (Array.isArray(output.rows) || Array.isArray(output.records))
  })
  if (!lastSuccessful) {
    return translate(locale, 'aiAssistant:fallback.noToolResult')
  }

  const output = lastSuccessful.output as { rows?: unknown[]; records?: unknown[]; rowCount?: number; total?: number }
  const rows = output.rows ?? output.records ?? []
  if (rows.length === 0) return translate(locale, 'aiAssistant:fallback.noRows')

  const count = output.rowCount ?? output.total ?? rows.length
  const preview = rows.slice(0, 10).map((row, index) => `${index + 1}. ${formatToolRow(row)}`)
  return [translate(locale, 'aiAssistant:fallback.rowsFound', {count}), ...preview].join('\n')
}

const formatToolRow = (row: unknown): string => {
  if (!row || typeof row !== 'object') return String(row)
  return Object.entries(row as Record<string, unknown>)
    .filter(([key]) => key !== 'citations')
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ')
}
