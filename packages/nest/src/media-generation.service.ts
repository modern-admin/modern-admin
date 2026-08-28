import { createHmac, timingSafeEqual } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type AiTask,
  type CurrentAdmin,
  estimateMediaGenerationPrice,
  type IAiTaskStore,
  type MediaGenerationCatalogModel,
  type MediaGenerationFileType,
  type MediaGenerationResult,
  type ModernAdmin,
} from '@modern-admin/core'
import { mimeMatches, UploadProviderRegistry } from '@modern-admin/feature-upload'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import type { ModernAdminModuleOptions } from './module.js'
import type {
  MediaGenerationPublicSettings,
  MediaGenerationStoredSettings,
  MediaGenerationTask,
  MediaGenerationTaskOutput,
} from './media-generation.types.js'

export const MEDIA_GENERATION_SETTINGS_KEY = 'modern-admin.media-generation'
export const MEDIA_GENERATION_TASK_KIND = 'media-generation'
const MEDIA_GENERATION_RESOURCE_ID = '__media_generation__'
const DEFAULT_MAX_FILES = 8
const DEFAULT_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const DEFAULT_POLL_INTERVAL_MS = 3_000
const DEFAULT_MAX_POLL_MS = 10 * 60 * 1000

const isTerminalStatus = (status: AiTask['status']): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'cancelled'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface CreateTaskInput {
  requestId: string
  model: string
  input: Record<string, unknown>
  resourceId?: string
  recordId?: string
  actionName?: string
}

interface MediaTarget {
  resourceId: string
  recordId: string
  actionName: string
  targetProperty: string
  mediaTypes: MediaGenerationFileType[]
}

const isTruthyEnv = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'true', 'yes', 'on', 'debug'].includes(value.toLowerCase())

const maskKey = (value: string | undefined): string | null => {
  if (!value) return null
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

const roleAllowed = (currentAdmin: CurrentAdmin | undefined, roles: string[]): boolean =>
  Boolean(currentAdmin?.role && roles.includes(String(currentAdmin.role)))

const safeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Media generation failed'

const outputOf = (task: AiTask): MediaGenerationTaskOutput =>
  (task.output ?? {}) as MediaGenerationTaskOutput

const fileExtension = (url: string, mimeType: string): string => {
  const fromUrl = extname(new URL(url).pathname).slice(0, 12)
  if (fromUrl) return fromUrl
  const subtype = mimeType.split('/')[1]?.split(/[;+]/)[0]?.replace(/[^a-z0-9.+-]/gi, '')
  return subtype ? `.${subtype === 'jpeg' ? 'jpg' : subtype}` : ''
}

@Injectable()
export class MediaGenerationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MediaGenerationService.name)

  /**
   * Per-task apply serialization within this process. Two overlapping apply
   * requests for the same task would otherwise both pass the `output.applied`
   * guard and upload/edit twice; chaining them makes the second observe the
   * first's `applied` marker. (A cross-process double-apply of the same task by
   * the same admin is not a realistic path, so an in-memory chain suffices.)
   */
  private readonly applyChains = new Map<string, Promise<MediaGenerationTask>>()

  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(MODERN_ADMIN_OPTIONS) private readonly options: ModernAdminModuleOptions,
  ) {}

  /**
   * Re-arm polling for webhook-less tasks left `running` when the process last
   * stopped. The poll loop lives in memory, so a restart (frequent in dev with
   * `--watch`) would otherwise freeze those tasks forever. No-op when webhooks
   * are configured or polling is disallowed (production).
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.mediaGeneration || !this.options.aiTaskStore) return
    if (this.config.webhookBaseUrl || !this.isPollingAllowed()) return
    let tasks: AiTask[]
    try {
      tasks = await this.options.aiTaskStore.list({
        kind: MEDIA_GENERATION_TASK_KIND,
        status: ['pending', 'running'],
      })
    } catch (error) {
      this.logger.warn(`Media generation resume failed: ${safeError(error)}`)
      return
    }
    let resumed = 0
    for (const task of tasks) {
      const providerTaskId = outputOf(task).providerTaskId
      if (!providerTaskId) continue
      this.schedulePolling(task.id, providerTaskId)
      resumed++
    }
    if (resumed > 0) this.logger.log(`Resumed media generation polling for ${resumed} task(s)`)
  }

  async getSettings(currentAdmin?: CurrentAdmin): Promise<MediaGenerationPublicSettings> {
    const stored = await this.loadSettings()
    return this.toPublicSettings(stored, currentAdmin)
  }

  async updateSettings(
    input: { enabled: boolean; apiKey?: string },
    currentAdmin?: CurrentAdmin,
  ): Promise<MediaGenerationPublicSettings> {
    this.assertManageAllowed(currentAdmin)
    const current = await this.loadSettings()
    const next: MediaGenerationStoredSettings = {
      enabled: input.enabled,
      provider: this.config.provider.id,
      apiKey: input.apiKey !== undefined
        ? input.apiKey.trim() || current.apiKey || ''
        : current.apiKey ?? '',
    }
    await this.requireConfigStore().set('global', null, MEDIA_GENERATION_SETTINGS_KEY, next)
    return this.toPublicSettings(next, currentAdmin)
  }

  async getCatalog(currentAdmin?: CurrentAdmin): Promise<MediaGenerationCatalogModel[]> {
    this.assertGenerateAllowed(currentAdmin)
    const apiKey = await this.requireApiKey()
    const catalog = await this.config.provider.getCatalog({ apiKey })
    const allowedModels = this.config.allowedModels
    const allowedTypes = new Set(this.config.allowedMediaTypes ?? ['image', 'video'])
    return catalog.filter((model) =>
      allowedTypes.has(model.type) && (!allowedModels || allowedModels.includes(model.id)),
    )
  }

  async createTask(input: CreateTaskInput, currentAdmin?: CurrentAdmin): Promise<MediaGenerationTask> {
    this.assertGenerateAllowed(currentAdmin)
    this.assertGenerationTransport()
    const settings = await this.loadSettings()
    if (!(settings.enabled ?? this.config.enabled ?? true)) {
      throw new ForbiddenException('Media generation is disabled')
    }
    const apiKey = await this.requireApiKey(settings)
    const target = await this.resolveTarget(input, currentAdmin)
    const catalog = await this.getCatalog(currentAdmin)
    const model = catalog.find((candidate) => candidate.id === input.model)
    if (!model) throw new BadRequestException(`Media model is not available: ${input.model}`)
    if (target && !target.mediaTypes.includes(model.type)) {
      throw new BadRequestException(`Model type ${model.type} is not allowed for this action`)
    }
    this.validateInput(model, input.input)

    const userId = currentAdmin?.id ? String(currentAdmin.id) : undefined
    if (!userId) throw new ForbiddenException('Media generation requires an authenticated user')
    const idempotencyKey = createHmac('sha256', 'modern-admin:media-generation')
      .update(`${this.config.provider.id}\0${userId}\0${input.requestId}`)
      .digest('hex')
    const taskStore = this.requireTaskStore()
    const existing = await taskStore.getByIdempotencyKey?.(idempotencyKey)
    if (existing) return this.assertTaskOwner(existing, currentAdmin)
    const estimatedCostUsd = estimateMediaGenerationPrice(model, input.input)
    // Reserve first, then check the budget: enqueueing records this task's
    // estimated cost so a concurrent request for the same user sums it in and
    // cannot slip past a stale total. A rejected reservation is failed below so
    // its cost is excluded from future sums.
    const task = await taskStore.enqueue({
      kind: MEDIA_GENERATION_TASK_KIND,
      idempotencyKey,
      ...(target ? { resourceId: target.resourceId, recordId: target.recordId } : {}),
      ...(userId ? { userId } : {}),
      input: {
        requestId: input.requestId,
        model: input.model,
        generationInput: input.input,
        ...(estimatedCostUsd !== null ? { estimatedCostUsd } : {}),
        ...(target ? { target } : {}),
      },
    })
    try {
      await this.assertMonthlyBudget(estimatedCostUsd, userId, task.id)
    } catch (error) {
      await taskStore.updateStatus(task.id, { status: 'failed', progress: 100, error: safeError(error) })
      throw error
    }
    const claimed = await taskStore.claim(task.id)
    if (!claimed) return this.assertTaskOwner(task, currentAdmin)

    if (this.isDebugEnabled()) {
      this.logger.debug(
        `Media generation request → provider=${this.config.provider.id} task=${task.id} ` +
          `model=${input.model} input=${JSON.stringify(input.input)}`,
      )
    }

    const webhookUrl = this.buildWebhookUrl(task.id)
    try {
      const result = await this.config.provider.create(
        {
          model: input.model,
          input: input.input,
          ...(webhookUrl ? { webhookUrl } : {}),
        },
        { apiKey },
      )
      const updated = await taskStore.updateStatus(task.id, {
        status: 'running',
        progress: result.status === 'processing' ? 25 : 10,
        output: this.resultOutput(result),
      })
      await taskStore.appendEvent(task.id, 'submitted', {
        provider: this.config.provider.id,
        providerTaskId: result.externalTaskId,
        status: result.status,
      })
      if (result.status === 'finished' || result.status === 'failed' || result.status === 'expired') {
        await this.applyProviderResult(updated, result)
        const finalized = await taskStore.get(task.id)
        if (!finalized) throw new InternalServerErrorException('Media generation task disappeared')
        return finalized as MediaGenerationTask
      }
      await this.publishTask(updated)
      if (!webhookUrl) this.schedulePolling(task.id, result.externalTaskId)
      return updated as MediaGenerationTask
    } catch (error) {
      const failed = await taskStore.updateStatus(task.id, {
        status: 'failed',
        progress: 100,
        error: safeError(error),
      })
      await taskStore.appendEvent(task.id, 'error', { message: safeError(error) })
      await this.publishTask(failed)
      throw error
    }
  }

  async getTask(taskId: string, currentAdmin?: CurrentAdmin): Promise<MediaGenerationTask> {
    const task = await this.requireTaskStore().get(taskId)
    if (!task || task.kind !== MEDIA_GENERATION_TASK_KIND) {
      throw new NotFoundException(`Media generation task not found: ${taskId}`)
    }
    return this.assertTaskOwner(task, currentAdmin)
  }

  async cancelTask(taskId: string, currentAdmin?: CurrentAdmin): Promise<MediaGenerationTask> {
    const task = await this.getTask(taskId, currentAdmin)
    if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') {
      return task
    }
    const cancelled = await this.requireTaskStore().updateStatus(taskId, {
      status: 'cancelled',
      progress: 100,
      output: outputOf(task),
    })
    await this.requireTaskStore().appendEvent(taskId, 'cancelled', {
      cancelledAt: new Date().toISOString(),
    })
    await this.publishTask(cancelled)
    return cancelled as MediaGenerationTask
  }

  async processWebhook(
    taskId: string,
    token: string,
    providerTaskId: string,
  ): Promise<{ accepted: true }> {
    this.assertWebhookToken(taskId, token)
    const task = await this.requireTaskStore().get(taskId)
    if (!task || task.kind !== MEDIA_GENERATION_TASK_KIND) {
      throw new NotFoundException('Media generation task not found')
    }
    const expectedProviderTaskId = outputOf(task).providerTaskId
    if (!expectedProviderTaskId || expectedProviderTaskId !== providerTaskId) {
      throw new BadRequestException('Webhook task does not match the local task')
    }
    if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') {
      return { accepted: true }
    }

    const result = await this.config.provider.getStatus(providerTaskId, {
      apiKey: await this.requireApiKey(),
    })
    if (result.externalTaskId !== expectedProviderTaskId) {
      throw new BadGatewayException('Provider returned a mismatched task id')
    }
    await this.applyProviderResult(task, result)
    return { accepted: true }
  }

  async applyResult(
    taskId: string,
    input: { fileIndex: number; replaceExisting?: boolean },
    currentAdmin?: CurrentAdmin,
  ): Promise<MediaGenerationTask> {
    const prior = this.applyChains.get(taskId)
    const next = (prior ? prior.catch(() => undefined) : Promise.resolve())
      .then(() => this.applyResultLocked(taskId, input, currentAdmin))
    this.applyChains.set(taskId, next)
    try {
      return await next
    } finally {
      if (this.applyChains.get(taskId) === next) this.applyChains.delete(taskId)
    }
  }

  private async applyResultLocked(
    taskId: string,
    input: { fileIndex: number; replaceExisting?: boolean },
    currentAdmin?: CurrentAdmin,
  ): Promise<MediaGenerationTask> {
    this.assertGenerateAllowed(currentAdmin)
    const task = await this.getTask(taskId, currentAdmin)
    if (task.status !== 'succeeded') {
      throw new ConflictException('Media generation is not ready')
    }
    const output = outputOf(task)
    if (output.applied) return task
    const target = task.input.target as MediaTarget | undefined
    if (!target) throw new BadRequestException('This task has no record target')
    const file = output.files?.[input.fileIndex]
    if (!file) throw new BadRequestException('Generated file was not found')

    const currentTarget = await this.resolveTarget({
      requestId: String(task.input.requestId ?? ''),
      model: String(task.input.model ?? ''),
      input: {},
      resourceId: target.resourceId,
      recordId: target.recordId,
      actionName: target.actionName,
    }, currentAdmin)
    if (
      !currentTarget
      || currentTarget.targetProperty !== target.targetProperty
      || !currentTarget.mediaTypes.includes(file.type)
    ) {
      throw new ConflictException('The media generation action configuration has changed')
    }

    const resource = this.admin.findResource(target.resourceId)
    const property = resource.decorate().getPropertyByKey(target.targetProperty)
    if (!property) throw new NotFoundException('Target property was not found')
    const propertyJson = property.toJSON()
    const providerId = propertyJson.custom?.uploadProviderId as string | undefined
    if (!providerId) throw new BadRequestException('Target property is not upload-enabled')
    const upload = UploadProviderRegistry.get(providerId)
    if (!upload) throw new InternalServerErrorException('Upload provider is not registered')

    const record = await resource.findOne(target.recordId)
    if (!record) throw new NotFoundException('Target record was not found')
    const currentValue = record.get(target.targetProperty)
    if (!upload.isArray && currentValue && !input.replaceExisting) {
      throw new ConflictException('The target already contains a file')
    }

    const downloaded = await this.downloadFile(file.url, file.type, upload.maxSize)
    if (!mimeMatches(downloaded.mimeType, upload.mimeTypes)) {
      throw new BadRequestException(`Generated file type is not allowed: ${downloaded.mimeType}`)
    }
    const key = await upload.provider.upload(
      downloaded,
      upload.uploadPath?.(downloaded.originalName),
    )
    try {
      const nextValue = upload.isArray
        ? [...(Array.isArray(currentValue) ? currentValue : []), key]
        : key
      await this.admin.invoke(
        {
          params: {
            resourceId: target.resourceId,
            recordId: target.recordId,
            action: 'edit',
          },
          method: 'post',
          payload: { [target.targetProperty]: nextValue },
          meta: { mediaGenerationTaskId: task.id },
        },
        currentAdmin,
      )
    } catch (error) {
      await upload.provider.delete(key).catch(() => undefined)
      throw error
    }

    const applied: NonNullable<MediaGenerationTaskOutput['applied']> = {
      fileIndex: input.fileIndex,
      key,
      url: await upload.provider.getUrl(key),
      resourceId: target.resourceId,
      recordId: target.recordId,
      property: target.targetProperty,
      appliedAt: new Date().toISOString(),
    }
    const updated = await this.requireTaskStore().updateStatus(task.id, {
      status: 'succeeded',
      progress: 100,
      output: { ...output, applied },
    })
    await this.requireTaskStore().appendEvent(task.id, 'applied', applied)
    await this.publishTask(updated)
    return updated as MediaGenerationTask
  }

  private get config() {
    const config = this.options.mediaGeneration
    if (!config) throw new ServiceUnavailableException('Media generation is not configured')
    return config
  }

  private isDebugEnabled(): boolean {
    return this.config.debug ?? isTruthyEnv(process.env.MEDIA_GENERATION_DEBUG)
  }

  private requireTaskStore(): IAiTaskStore {
    if (!this.options.aiTaskStore) {
      throw new ServiceUnavailableException('Media generation requires aiTaskStore')
    }
    return this.options.aiTaskStore
  }

  private requireConfigStore() {
    if (!this.options.configStore) {
      throw new ServiceUnavailableException('Media generation settings require configStore')
    }
    return this.options.configStore
  }

  private async loadSettings(): Promise<MediaGenerationStoredSettings> {
    if (!this.options.mediaGeneration || !this.options.configStore) return {}
    const raw = await this.options.configStore.get('global', null, MEDIA_GENERATION_SETTINGS_KEY)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const stored = raw as MediaGenerationStoredSettings
    if (stored.provider && stored.provider !== this.options.mediaGeneration.provider.id) return {}
    return stored
  }

  private async requireApiKey(settings?: MediaGenerationStoredSettings): Promise<string> {
    const resolved = settings ?? await this.loadSettings()
    const apiKey = resolved.apiKey || this.config.apiKey
    if (!apiKey) throw new PreconditionFailedException('Media generation API key is not configured')
    return apiKey
  }

  private async assertMonthlyBudget(
    estimatedCostUsd: number | null,
    userId: string | undefined,
    reservationTaskId: string,
  ): Promise<void> {
    const budget = this.config.monthlyBudgetUsdPerUser
    if (budget === undefined) return
    if (!Number.isFinite(budget) || budget <= 0) {
      throw new InternalServerErrorException('Media generation monthly budget is invalid')
    }
    if (!userId) throw new ForbiddenException('Media generation requires an authenticated user')
    if (estimatedCostUsd === null) {
      throw new PreconditionFailedException('This model has no catalog price for budget enforcement')
    }
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const tasks = await this.requireTaskStore().list({
      kind: MEDIA_GENERATION_TASK_KIND,
      userId,
      createdAfter: monthStart.toISOString(),
    })
    const spent = tasks.reduce((total, task) => {
      if (task.status === 'failed') return total
      const cost = Number(task.input.estimatedCostUsd)
      return Number.isFinite(cost) && cost > 0 ? total + cost : total
    }, 0)
    // The reservation is normally already in `tasks`, so its cost is part of
    // `spent`. Add it explicitly only if a not-yet-visible read missed it, so
    // the projection is correct on both strongly- and eventually-consistent
    // stores without ever double-counting.
    const reservationCounted = tasks.some((task) => task.id === reservationTaskId)
    const projected = reservationCounted ? spent : spent + estimatedCostUsd
    if (projected > budget) {
      throw new ForbiddenException('Media generation monthly budget would be exceeded')
    }
  }

  private toPublicSettings(
    settings: MediaGenerationStoredSettings,
    currentAdmin?: CurrentAdmin,
  ): MediaGenerationPublicSettings {
    const provider = this.config.provider
    const apiKey = settings.apiKey || this.config.apiKey
    return {
      enabled: settings.enabled ?? this.config.enabled ?? true,
      configured: Boolean(apiKey),
      provider: provider.id,
      providerName: provider.displayName,
      apiKeyUrl: provider.apiKeyUrl,
      maskedApiKey: maskKey(apiKey),
      canManage: Boolean(this.options.configStore) && this.canManage(currentAdmin),
      canGenerate: this.canGenerate(currentAdmin),
    }
  }

  private canManage(currentAdmin?: CurrentAdmin): boolean {
    return roleAllowed(currentAdmin, this.config.manageRoles ?? ['admin'])
  }

  private canGenerate(currentAdmin?: CurrentAdmin): boolean {
    return roleAllowed(currentAdmin, this.config.generateRoles ?? ['admin'])
  }

  private assertManageAllowed(currentAdmin?: CurrentAdmin): void {
    if (!this.canManage(currentAdmin)) throw new ForbiddenException('Media generation settings are not allowed')
  }

  private assertGenerateAllowed(currentAdmin?: CurrentAdmin): void {
    if (!this.canGenerate(currentAdmin)) throw new ForbiddenException('Media generation is not allowed')
  }

  private async resolveTarget(
    input: CreateTaskInput,
    currentAdmin?: CurrentAdmin,
  ): Promise<MediaTarget | undefined> {
    if (!input.resourceId && !input.recordId && !input.actionName) return undefined
    if (!input.resourceId || !input.recordId || !input.actionName) {
      throw new BadRequestException('resourceId, recordId and actionName must be provided together')
    }
    const resource = this.admin.findResource(input.resourceId)
    const action = resource.decorate().getAction(input.actionName)
    const custom = action?.toDescriptor().custom?.mediaGeneration
    if (!action || action.actionType() !== 'record' || !custom || typeof custom !== 'object') {
      throw new BadRequestException('Record action is not configured for media generation')
    }
    await this.admin.invoke(
      {
        params: {
          resourceId: input.resourceId,
          recordId: input.recordId,
          action: input.actionName,
        },
        method: 'get',
      },
      currentAdmin,
    )
    const config = custom as Record<string, unknown>
    const targetProperty = config.targetProperty
    const mediaTypes = config.mediaTypes
    if (typeof targetProperty !== 'string' || !Array.isArray(mediaTypes)) {
      throw new InternalServerErrorException('Media generation action configuration is invalid')
    }
    return {
      resourceId: input.resourceId,
      recordId: input.recordId,
      actionName: input.actionName,
      targetProperty,
      mediaTypes: mediaTypes.filter((value): value is MediaGenerationFileType =>
        value === 'image' || value === 'video' || value === 'music'),
    }
  }

  private validateInput(model: MediaGenerationCatalogModel, input: Record<string, unknown>): void {
    const params = new Map(model.params.map((param) => [param.name, param]))
    for (const key of Object.keys(input)) {
      if (!params.has(key)) throw new BadRequestException(`Unknown model parameter: ${key}`)
    }
    for (const param of model.params) {
      const value = input[param.name]
      if (param.required && (value === undefined || value === null || value === '')) {
        throw new BadRequestException(`Missing model parameter: ${param.name}`)
      }
      if (value === undefined || value === null) continue
      const values = param.isArray ? (Array.isArray(value) ? value : null) : [value]
      if (!values) throw new BadRequestException(`Parameter ${param.name} must be an array`)
      for (const item of values) {
        if (typeof item !== param.kind) {
          throw new BadRequestException(`Parameter ${param.name} must be ${param.kind}`)
        }
        if (param.options && !param.options.some((option) => option.value === item)) {
          throw new BadRequestException(`Parameter ${param.name} contains an unsupported value`)
        }
        if (typeof item === 'string' && param.maxLength && item.length > param.maxLength) {
          throw new BadRequestException(`Parameter ${param.name} is too long`)
        }
        if (typeof item === 'number') {
          if (param.minimum !== undefined && item < param.minimum) {
            throw new BadRequestException(`Parameter ${param.name} is below its minimum`)
          }
          if (param.maximum !== undefined && item > param.maximum) {
            throw new BadRequestException(`Parameter ${param.name} is above its maximum`)
          }
        }
      }
    }
  }

  /** Polling is a local-development convenience only; production must use webhooks. */
  private isPollingAllowed(): boolean {
    return process.env.NODE_ENV !== 'production'
  }

  private assertGenerationTransport(): void {
    if (this.config.webhookBaseUrl || this.isPollingAllowed()) return
    throw new PreconditionFailedException('Media generation webhookBaseUrl is not configured')
  }

  private buildWebhookUrl(taskId: string): string | undefined {
    const base = this.config.webhookBaseUrl?.replace(/\/$/, '')
    if (!base) return undefined
    let url: URL
    try {
      url = new URL(base)
    } catch {
      throw new PreconditionFailedException('Media generation webhookBaseUrl is invalid')
    }
    if (url.protocol !== 'https:') {
      throw new PreconditionFailedException('Media generation webhookBaseUrl must use HTTPS')
    }
    return `${base}/admin/api/media-generation/webhook/${encodeURIComponent(taskId)}/${this.webhookToken(taskId)}`
  }

  private webhookToken(taskId: string): string {
    const secret = this.config.webhookSecret
    if (!secret || secret.length < 32) {
      throw new PreconditionFailedException('Media generation webhookSecret must contain at least 32 characters')
    }
    return createHmac('sha256', secret).update(taskId).digest('hex')
  }

  private assertWebhookToken(taskId: string, token: string): void {
    const expected = Buffer.from(this.webhookToken(taskId))
    const received = Buffer.from(token)
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new ForbiddenException('Invalid media generation webhook token')
    }
  }

  private resultOutput(result: MediaGenerationResult): MediaGenerationTaskOutput {
    return {
      providerTaskId: result.externalTaskId,
      providerStatus: result.status,
      files: result.files,
      ...(result.output ? { providerOutput: result.output } : {}),
    }
  }

  private async applyProviderResult(task: AiTask, result: MediaGenerationResult): Promise<void> {
    const store = this.requireTaskStore()
    const maxFiles = this.config.maxFiles ?? DEFAULT_MAX_FILES
    if (result.files.length > maxFiles) {
      throw new BadGatewayException(`Provider returned more than ${maxFiles} files`)
    }
    // Re-read under the latest state: a cancel may have landed while the
    // provider status request was in flight (webhook path especially). Never
    // resurrect a task that already reached a terminal status.
    const current = await store.get(task.id)
    if (!current || current.kind !== MEDIA_GENERATION_TASK_KIND || isTerminalStatus(current.status)) {
      return
    }
    let status: AiTask['status'] = 'running'
    let progress = result.status === 'processing' ? 50 : 20
    let error: string | undefined
    if (result.status === 'finished') {
      status = result.files.length > 0 ? 'succeeded' : 'failed'
      progress = 100
      if (result.files.length === 0) error = 'Provider finished without generated files'
    } else if (result.status === 'failed' || result.status === 'expired') {
      status = 'failed'
      progress = 100
      error = result.error ?? `Provider task ${result.status}`
    }
    const updated = await store.updateStatus(current.id, {
      status,
      progress,
      output: { ...outputOf(current), ...this.resultOutput(result) },
      ...(error ? { error } : {}),
    })
    await store.appendEvent(current.id, 'provider-status', {
      status: result.status,
      fileCount: result.files.length,
    })
    await this.publishTask(updated)
  }

  /**
   * Poll the provider until a webhook-less task finishes. Runs detached from the
   * request so `createTask` returns immediately; failures are logged, not thrown.
   */
  private schedulePolling(taskId: string, providerTaskId: string): void {
    void this.pollUntilFinished(taskId, providerTaskId).catch((error) => {
      this.logger.warn(`Media generation polling failed for task ${taskId}: ${safeError(error)}`)
    })
  }

  private async pollUntilFinished(taskId: string, providerTaskId: string): Promise<void> {
    const store = this.requireTaskStore()
    const intervalMs = Math.max(500, this.config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
    const deadline = Date.now() + Math.max(intervalMs, this.config.maxPollMs ?? DEFAULT_MAX_POLL_MS)
    while (Date.now() < deadline) {
      await delay(intervalMs)
      const task = await store.get(taskId)
      if (!task || task.kind !== MEDIA_GENERATION_TASK_KIND || isTerminalStatus(task.status)) return
      const result = await this.config.provider.getStatus(providerTaskId, {
        apiKey: await this.requireApiKey(),
      })
      if (result.externalTaskId !== providerTaskId) {
        throw new BadGatewayException('Provider returned a mismatched task id')
      }
      if (result.status === 'finished' || result.status === 'failed' || result.status === 'expired') {
        // Re-read: the user may have cancelled while getStatus was in flight.
        const current = await store.get(taskId)
        if (!current || isTerminalStatus(current.status)) return
        await this.applyProviderResult(current, result)
        return
      }
    }
    const task = await store.get(taskId)
    if (!task || isTerminalStatus(task.status)) return
    const failed = await store.updateStatus(taskId, {
      status: 'failed',
      progress: 100,
      error: 'Media generation timed out',
    })
    await store.appendEvent(taskId, 'error', { message: 'Media generation polling timed out' })
    await this.publishTask(failed)
  }

  private async publishTask(task: AiTask): Promise<void> {
    if (!task.userId) return
    await this.admin.realtime.publish({
      kind: 'taskUpdated',
      resourceId: MEDIA_GENERATION_RESOURCE_ID,
      recordId: task.id,
      taskId: task.id,
      taskStatus: task.status,
      audienceUserId: task.userId,
      at: Date.now(),
    })
  }

  private assertTaskOwner(task: AiTask, currentAdmin?: CurrentAdmin): MediaGenerationTask {
    const currentUserId = currentAdmin?.id ? String(currentAdmin.id) : undefined
    if (task.userId && task.userId !== currentUserId && !this.canManage(currentAdmin)) {
      throw new ForbiddenException('You are not allowed to inspect this media generation task')
    }
    return task as MediaGenerationTask
  }

  private async downloadFile(
    urlValue: string,
    fileType: MediaGenerationFileType,
    propertyMaxSize: number | undefined,
  ) {
    let url = new URL(urlValue)
    const maxSize = Math.min(
      propertyMaxSize ?? Number.MAX_SAFE_INTEGER,
      this.config.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES,
    )
    let response: Response | undefined
    for (let redirects = 0; redirects <= 5; redirects++) {
      this.assertDownloadUrl(url)
      response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location) throw new BadGatewayException('Generated file redirect has no location')
      url = new URL(location, url)
      if (redirects === 5) throw new BadGatewayException('Generated file has too many redirects')
    }
    if (!response) throw new BadGatewayException('Generated file download failed')
    if (!response.ok) throw new BadGatewayException(`Generated file download failed with HTTP ${response.status}`)
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (declaredSize > maxSize) throw new BadRequestException('Generated file is too large')
    if (!response.body) throw new BadGatewayException('Generated file download returned an empty body')
    const chunks: Buffer[] = []
    let receivedSize = 0
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        receivedSize += value.byteLength
        if (receivedSize > maxSize) {
          await reader.cancel()
          throw new BadRequestException('Generated file is too large')
        }
        chunks.push(Buffer.from(value))
      }
    } finally {
      reader.releaseLock()
    }
    const buffer = Buffer.concat(chunks, receivedSize)
    const fallbackMime = fileType === 'image'
      ? 'image/png'
      : fileType === 'video'
        ? 'video/mp4'
        : 'audio/mpeg'
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || fallbackMime
    const sourceName = basename(url.pathname) || `generated${fileExtension(urlValue, mimeType)}`
    return {
      originalName: sourceName.includes('.') ? sourceName : `${sourceName}${fileExtension(urlValue, mimeType)}`,
      mimeType,
      size: buffer.byteLength,
      buffer,
    }
  }

  private assertDownloadUrl(url: URL): void {
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BadGatewayException('Generated file URL must be an HTTPS URL without credentials')
    }
    const allowed = this.config.allowedDownloadHosts ?? this.config.provider.allowedFileHosts
    if (!allowed?.length) {
      throw new PreconditionFailedException('Media generation download hosts are not configured')
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const permitted = allowed.some((entry) => {
      const candidate = entry.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
      return hostname === candidate || hostname.endsWith(`.${candidate}`)
    })
    if (!permitted) throw new BadGatewayException('Generated file host is not allowed')
  }
}
