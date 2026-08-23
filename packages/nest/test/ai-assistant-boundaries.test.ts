import { describe, expect, mock, test } from 'bun:test'
import { createMemorySystem, ModernAdmin } from '@modern-admin/core'
import { AiAssistantProcessor } from '../src/ai-assistant.processor.js'
import { AiAssistantService } from '../src/ai-assistant.service.js'
import type {
  AiAssistantChatJobData,
  IAiAssistantQueueDispatcher,
} from '../src/ai-assistant.types.js'
import type { ILlmProvider } from '../src/llm-provider.js'
import { ModernAdminModule, type ModernAdminModuleOptions } from '../src/module.js'

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
  test('public settings come from the injected LLM provider', async () => {
    const dispatcher: IAiAssistantQueueDispatcher = { enqueue: () => undefined }
    const options = buildOptions(dispatcher)
    const service = new AiAssistantService(new ModernAdmin(), options)

    const settings = await service.getSettings({ id: 'admin', role: 'admin' })

    expect(settings.provider).toBe('test-provider')
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
})
