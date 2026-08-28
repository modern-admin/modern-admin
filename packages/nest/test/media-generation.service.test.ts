import { describe, expect, it } from 'bun:test'
import {
  MemoryAiTaskStore,
  MemoryConfigStore,
  type IMediaGenerationProvider,
  type MediaGenerationCreateInput,
  type MediaGenerationProviderRequestOptions,
  type MediaGenerationResult,
  type ModernAdmin,
} from '@modern-admin/core'
import { MediaGenerationService, MEDIA_GENERATION_TASK_KIND } from '../src/media-generation.service.js'
import type { ModernAdminModuleOptions } from '../src/module.js'

const catalog = [{
  id: 'flux', group: '', name: 'Flux', type: 'image' as const,
  tags: [], capabilities: [],
  pricing: [{ key: 'default', price: '0.10', isDefault: true }],
  params: [{
    name: 'prompt', label: 'Prompt', kind: 'string' as const, isArray: false,
    required: true, isMedia: false, isPrompt: true, multiline: true,
    deprecated: false,
  }],
}]

class FakeProvider implements IMediaGenerationProvider {
  readonly id = 'api-stock'
  readonly displayName = 'API Stock'
  readonly apiKeyUrl = 'https://api-stock.com'
  creates: MediaGenerationCreateInput[] = []
  statusCalls = 0
  /** Runs once inside getStatus, simulating a concurrent action while it is in flight. */
  beforeStatus?: () => Promise<void>

  async getCatalog(_options: MediaGenerationProviderRequestOptions) {
    return catalog
  }

  async create(input: MediaGenerationCreateInput): Promise<MediaGenerationResult> {
    this.creates.push(input)
    return { externalTaskId: 'provider-task-1', status: 'processing', files: [] }
  }

  async getStatus(): Promise<MediaGenerationResult> {
    this.statusCalls++
    if (this.beforeStatus) {
      const hook = this.beforeStatus
      this.beforeStatus = undefined
      await hook()
    }
    return {
      externalTaskId: 'provider-task-1',
      status: 'finished',
      files: [{ url: 'https://cdn.example/result.png', type: 'image' }],
    }
  }
}

const setup = (
  monthlyBudgetUsdPerUser?: number,
  overrides: Partial<ModernAdminModuleOptions['mediaGeneration']> = {},
) => {
  const provider = new FakeProvider()
  const aiTaskStore = new MemoryAiTaskStore()
  const configStore = new MemoryConfigStore()
  const published: unknown[] = []
  const admin = {
    realtime: { publish: async (event: unknown) => { published.push(event) } },
  } as unknown as ModernAdmin
  const options = {
    aiTaskStore,
    configStore,
    mediaGeneration: {
      provider,
      apiKey: 'server-only-key',
      webhookBaseUrl: 'https://admin.example',
      webhookSecret: 'a-secure-webhook-secret-with-32-characters',
      ...(monthlyBudgetUsdPerUser !== undefined ? { monthlyBudgetUsdPerUser } : {}),
      ...overrides,
    },
  } as ModernAdminModuleOptions
  return {
    provider,
    aiTaskStore,
    published,
    service: new MediaGenerationService(admin, options),
  }
}

describe('MediaGenerationService', () => {
  it('uses an idempotent create request and never persists the API key', async () => {
    const { provider, aiTaskStore, service } = setup()
    const currentAdmin = { id: 'admin-1', role: 'admin' }
    const input = { requestId: 'request-1', model: 'flux', input: { prompt: 'A cup' } }

    const first = await service.createTask(input, currentAdmin)
    const second = await service.createTask(input, currentAdmin)

    expect(second.id).toBe(first.id)
    expect(provider.creates).toHaveLength(1)
    expect(provider.creates[0]?.webhookUrl).toContain(`/webhook/${first.id}/`)
    expect(JSON.stringify(await aiTaskStore.get(first.id))).not.toContain('server-only-key')
  })

  it('finalizes from a webhook with one authoritative status request', async () => {
    const { provider, service, published } = setup()
    const task = await service.createTask(
      { requestId: 'request-2', model: 'flux', input: { prompt: 'A cup' } },
      { id: 'admin-1', role: 'admin' },
    )
    const callback = new URL(provider.creates[0]!.webhookUrl!)
    const token = callback.pathname.split('/').at(-1)!

    await service.processWebhook(task.id, token, 'provider-task-1')
    const finished = await service.getTask(task.id, { id: 'admin-1', role: 'admin' })
    await service.processWebhook(task.id, token, 'provider-task-1')

    expect(finished.status).toBe('succeeded')
    expect(finished.output?.files).toEqual([
      { url: 'https://cdn.example/result.png', type: 'image' },
    ])
    expect(provider.statusCalls).toBe(1)
    expect(published).toContainEqual(expect.objectContaining({
      kind: 'taskUpdated',
      taskId: task.id,
      audienceUserId: 'admin-1',
    }))
  })

  it('falls back to polling when no webhook base URL is configured', async () => {
    const { provider, service } = setup(undefined, {
      webhookBaseUrl: undefined,
      webhookSecret: undefined,
      pollIntervalMs: 10,
    })
    const currentAdmin = { id: 'admin-1', role: 'admin' }

    const task = await service.createTask(
      { requestId: 'poll-1', model: 'flux', input: { prompt: 'A cup' } },
      currentAdmin,
    )

    expect(provider.creates[0]?.webhookUrl).toBeUndefined()
    expect(task.status).toBe('running')

    let finished = await service.getTask(task.id, currentAdmin)
    for (let attempt = 0; attempt < 50 && finished.status === 'running'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      finished = await service.getTask(task.id, currentAdmin)
    }

    expect(finished.status).toBe('succeeded')
    expect(provider.statusCalls).toBeGreaterThanOrEqual(1)
    expect(finished.output?.files).toEqual([
      { url: 'https://cdn.example/result.png', type: 'image' },
    ])
  })

  it('keeps a task cancelled when the user stops waiting during a poll', async () => {
    const { provider, service } = setup(undefined, {
      webhookBaseUrl: undefined,
      webhookSecret: undefined,
      pollIntervalMs: 10,
    })
    const currentAdmin = { id: 'admin-1', role: 'admin' }

    const task = await service.createTask(
      { requestId: 'poll-cancel-1', model: 'flux', input: { prompt: 'A cup' } },
      currentAdmin,
    )
    // Cancel while the in-flight getStatus resolves, then let the poll apply its result.
    provider.beforeStatus = async () => {
      await service.cancelTask(task.id, currentAdmin)
    }

    let seen = await service.getTask(task.id, currentAdmin)
    for (let attempt = 0; attempt < 50 && seen.status === 'running'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      seen = await service.getTask(task.id, currentAdmin)
    }

    expect(provider.statusCalls).toBeGreaterThanOrEqual(1)
    expect(seen.status).toBe('cancelled')
    expect(seen.output?.files ?? []).toEqual([])
  })

  it('resumes polling for tasks left running when the process restarted', async () => {
    const { provider, aiTaskStore, service } = setup(undefined, {
      webhookBaseUrl: undefined,
      webhookSecret: undefined,
      pollIntervalMs: 10,
    })
    // A task the previous process submitted (provider id stored) but whose
    // in-memory poll loop was lost on restart.
    const enqueued = await aiTaskStore.enqueue({
      kind: MEDIA_GENERATION_TASK_KIND,
      userId: 'admin-1',
      input: { model: 'flux', generationInput: { prompt: 'A cup' } },
    })
    await aiTaskStore.claim(enqueued.id)
    await aiTaskStore.updateStatus(enqueued.id, {
      status: 'running',
      progress: 10,
      output: { providerStatus: 'pending', files: [], providerTaskId: 'provider-task-1' },
    })

    await service.onApplicationBootstrap()

    let seen = await aiTaskStore.get(enqueued.id)
    for (let attempt = 0; attempt < 50 && seen?.status === 'running'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      seen = await aiTaskStore.get(enqueued.id)
    }

    expect(provider.statusCalls).toBeGreaterThanOrEqual(1)
    expect(seen?.status).toBe('succeeded')
    expect((seen?.output as { files?: unknown[] }).files).toEqual([
      { url: 'https://cdn.example/result.png', type: 'image' },
    ])
  })

  it('does not resume polling when a webhook base URL is configured', async () => {
    const { provider, aiTaskStore, service } = setup()
    const enqueued = await aiTaskStore.enqueue({
      kind: MEDIA_GENERATION_TASK_KIND,
      input: { model: 'flux', generationInput: { prompt: 'A cup' } },
    })
    await aiTaskStore.claim(enqueued.id)
    await aiTaskStore.updateStatus(enqueued.id, {
      status: 'running',
      progress: 10,
      output: { providerStatus: 'pending', files: [], providerTaskId: 'provider-task-1' },
    })

    await service.onApplicationBootstrap()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(provider.statusCalls).toBe(0)
    expect((await aiTaskStore.get(enqueued.id))?.status).toBe('running')
  })

  it('refuses to run without a webhook in production', async () => {
    const { provider, service } = setup(undefined, {
      webhookBaseUrl: undefined,
      webhookSecret: undefined,
    })
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await expect(service.createTask(
        { requestId: 'prod-1', model: 'flux', input: { prompt: 'A cup' } },
        { id: 'admin-1', role: 'admin' },
      )).rejects.toThrow('webhookBaseUrl is not configured')
    } finally {
      process.env.NODE_ENV = previous
    }
    expect(provider.creates).toHaveLength(0)
  })

  it('enforces an estimated per-user monthly budget before provider submission', async () => {
    const { provider, service } = setup(0.15)
    const currentAdmin = { id: 'admin-1', role: 'admin' }
    await service.createTask(
      { requestId: 'budget-1', model: 'flux', input: { prompt: 'First' } },
      currentAdmin,
    )

    await expect(service.createTask(
      { requestId: 'budget-2', model: 'flux', input: { prompt: 'Second' } },
      currentAdmin,
    )).rejects.toThrow('monthly budget')
    expect(provider.creates).toHaveLength(1)
  })

  it('does not exceed the monthly budget under concurrent requests', async () => {
    const { provider, aiTaskStore, service } = setup(0.15)
    const currentAdmin = { id: 'admin-1', role: 'admin' }

    const results = await Promise.allSettled([
      service.createTask({ requestId: 'c-1', model: 'flux', input: { prompt: 'A' } }, currentAdmin),
      service.createTask({ requestId: 'c-2', model: 'flux', input: { prompt: 'B' } }, currentAdmin),
    ])

    // Exactly one 0.10 request fits under the 0.15 cap: per-user reservation
    // serialization admits one and rejects the other — never both, never none.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(rejected).toHaveLength(1)
    expect(String(rejected[0]!.reason?.message)).toContain('monthly budget')
    expect(provider.creates).toHaveLength(1)

    const tasks = await aiTaskStore.list({ kind: MEDIA_GENERATION_TASK_KIND, userId: 'admin-1' })
    const reserved = tasks
      .filter((task) => task.status !== 'failed')
      .reduce((sum, task) => sum + Number(task.input.estimatedCostUsd ?? 0), 0)
    expect(reserved).toBeLessThanOrEqual(0.15)
  })

  it('keeps a task cancelled when the user stops waiting during a webhook finalize', async () => {
    const { provider, service } = setup()
    const currentAdmin = { id: 'admin-1', role: 'admin' }
    const task = await service.createTask(
      { requestId: 'wh-cancel-1', model: 'flux', input: { prompt: 'A cup' } },
      currentAdmin,
    )
    const callback = new URL(provider.creates[0]!.webhookUrl!)
    const token = callback.pathname.split('/').at(-1)!

    // Cancel while the in-flight getStatus resolves, then let the webhook finalize.
    provider.beforeStatus = async () => {
      await service.cancelTask(task.id, currentAdmin)
    }
    await service.processWebhook(task.id, token, 'provider-task-1')

    const seen = await service.getTask(task.id, currentAdmin)
    expect(seen.status).toBe('cancelled')
    expect(seen.output?.files ?? []).toEqual([])
  })
})
