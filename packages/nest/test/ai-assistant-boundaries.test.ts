import { describe, expect, mock, test } from 'bun:test'
import { createMemorySystem, ModernAdmin } from '@modern-admin/core'
import { AiAssistantProcessor } from '../src/ai-assistant.processor.js'
import { AiAssistantService } from '../src/ai-assistant.service.js'
import type {
  AiAssistantChatJobData,
  IAiAssistantQueueDispatcher,
} from '../src/ai-assistant.types.js'
import type { ILlmProvider } from '../src/llm-provider.js'
import { ApiStockLlmProvider, defaultLlmProvider } from '../src/llm-provider.js'
import { ModernAdminModule, type ModernAdminModuleOptions } from '../src/module.js'
import { translateServerMessage } from '../src/server-i18n.js'

const provider: ILlmProvider = {
  id: 'test-provider',
  defaultModel: 'test-model',
  isConfigured: () => true,
  generate: async () => ({ text: '', toolCalls: [], toolResults: [] }),
}

const buildOptions = (
  dispatcher: IAiAssistantQueueDispatcher,
): ModernAdminModuleOptions => {
  const stores = createMemorySystem()
  return {
    configStore: stores.configStore,
    aiTaskStore: stores.aiTaskStore,
    aiAssistant: { provider, queue: { dispatcher } },
  }
}

describe('AI assistant dependency boundaries', () => {
  test('uses API Stock as the built-in provider', async () => {
    const stores = createMemorySystem()
    const service = new AiAssistantService(new ModernAdmin(), {
      configStore: stores.configStore,
    })

    const settings = await service.getSettings({ id: 'admin', role: 'admin' })

    expect(defaultLlmProvider).toBeInstanceOf(ApiStockLlmProvider)
    expect(settings).toMatchObject({
      provider: 'api-stock',
      providerName: 'api-stock',
      apiKeyUrl: 'https://api-stock.com',
      model: 'gemini-3.5-flash',
      configured: false,
    })
  })

  test('does not reuse a key saved for another provider', async () => {
    const stores = createMemorySystem()
    await stores.configStore.set('global', null, 'modern-admin.ai-assistant', {
      provider: 'openrouter',
      model: 'openrouter-model',
      apiKey: 'openrouter-secret',
    })
    const service = new AiAssistantService(new ModernAdmin(), {
      configStore: stores.configStore,
    })

    const settings = await service.getSettings({ id: 'admin', role: 'admin' })

    expect(settings.model).toBe('gemini-3.5-flash')
    expect(settings.configured).toBeFalse()
    expect(settings.maskedApiKey).toBeNull()
  })

  test('public settings come from the injected LLM provider', async () => {
    const dispatcher: IAiAssistantQueueDispatcher = { enqueue: () => undefined }
    const options = buildOptions(dispatcher)
    const service = new AiAssistantService(new ModernAdmin(), options)

    const settings = await service.getSettings({ id: 'admin', role: 'admin' })

    expect(settings.provider).toBe('test-provider')
    expect(settings.providerName).toBe('test-provider')
    expect(settings.apiKeyUrl).toBeNull()
    expect(settings.model).toBe('test-model')
    expect(settings.configured).toBeTrue()
  })

  test('dispatches through the external queue port', async () => {
    const enqueue = mock((_data: AiAssistantChatJobData) => undefined)
    const options = buildOptions({ enqueue })
    const service = new AiAssistantService(new ModernAdmin(), options)

    const task = await service.enqueueChat([{ role: 'user', content: 'hello' }], { id: 'user-1' })

    expect(task.status).toBe('pending')
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue.mock.calls[0]?.[0].messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  test('external queue mode omits the BullMQ worker provider', () => {
    const module = ModernAdminModule.forRoot(buildOptions({ enqueue: () => undefined }))

    expect(module.providers).not.toContain(AiAssistantProcessor)
  })

  test('host-defined server locales override the built-in fallback', () => {
    const message = translateServerMessage(
      'zh-CN',
      'aiAssistant:error.providerNotConfigured',
      undefined,
      [{
        code: 'zh-CN',
        name: '简体中文',
        dict: {
          'aiAssistant:error.providerNotConfigured': 'AI 助手提供商未配置',
        },
      }],
    )

    expect(message).toBe('AI 助手提供商未配置')
  })

  test('host-defined server locales reach tool-result fallbacks', async () => {
    const stores = createMemorySystem()
    await stores.configStore.set('global', null, 'modern-admin.ai-assistant', {
      enabled: true,
      apiKey: 'test-key',
    })
    const localizedProvider: ILlmProvider = {
      ...provider,
      generate: async () => ({
        text: '',
        toolCalls: [],
        toolResults: [{ toolName: 'list_records', output: { rows: [] } }],
      }),
    }
    const service = new AiAssistantService(new ModernAdmin(), {
      configStore: stores.configStore,
      aiTaskStore: stores.aiTaskStore,
      aiAssistant: { provider: localizedProvider },
      serverLocales: [{
        code: 'zh-CN',
        name: '简体中文',
        dict: { 'aiAssistant:fallback.noRows': '没有找到记录' },
      }],
    })
    const task = await stores.aiTaskStore.enqueue({
      kind: 'assistant-chat',
      input: {},
    })

    const output = await service.runChatJob({
      taskId: task.id,
      messages: [],
      locale: 'zh-CN',
    })

    expect(output.text).toBe('没有找到记录')
  })
})
