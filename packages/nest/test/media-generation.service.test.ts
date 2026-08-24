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
import { MediaGenerationService } from '../src/media-generation.service.js'
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

  async getCatalog(_options: MediaGenerationProviderRequestOptions) {
    return catalog
  }

  async create(input: MediaGenerationCreateInput): Promise<MediaGenerationResult> {
    this.creates.push(input)
    return { externalTaskId: 'provider-task-1', status: 'processing', files: [] }
  }

  async getStatus(): Promise<MediaGenerationResult> {
    this.statusCalls++
    return {
      externalTaskId: 'provider-task-1',
      status: 'finished',
      files: [{ url: 'https://cdn.example/result.png', type: 'image' }],
    }
  }
}

const setup = (monthlyBudgetUsdPerUser?: number) => {
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
    const callback = new URL(provider.creates[0]!.webhookUrl)
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
})
