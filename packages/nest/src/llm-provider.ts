import { translateServerMessage } from './server-i18n.js'
import type { LocaleBundle } from '@modern-admin/i18n'

export interface LlmChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Structural tool contract understood by AI SDK-compatible providers. */
export interface LlmTool {
  description?: string
  inputSchema: unknown
  execute?: (...args: never[]) => unknown
}

export interface LlmGenerateInput {
  apiKey?: string
  model: string
  system: string
  messages: LlmChatMessage[]
  tools: Record<string, LlmTool>
  maxSteps: number
  appName?: string
  appUrl?: string
  locale?: string
  /** Host-defined server locale bundles used for provider failures. */
  serverLocales?: ReadonlyArray<LocaleBundle>
}

export interface LlmGenerateResult {
  text: string
  toolCalls: Array<{ toolName: string }>
  toolResults: Array<{ toolName?: string; output: unknown }>
}

/** Consumer-owned port for the AI assistant's model invocation. */
export interface ILlmProvider {
  readonly id: string
  readonly displayName?: string
  readonly apiKeyUrl?: string
  readonly defaultModel: string
  isConfigured(apiKey?: string): boolean
  generate(input: LlmGenerateInput): Promise<LlmGenerateResult>
}

/**
 * Built-in API Stock adapter. API Stock exposes an OpenAI-compatible chat
 * endpoint, so the standard AI SDK tool loop can be reused unchanged.
 */
export class ApiStockLlmProvider implements ILlmProvider {
  readonly id = 'api-stock'
  readonly displayName = 'API Stock'
  readonly apiKeyUrl = 'https://api-stock.com'
  readonly defaultModel = 'gemini-3.5-flash'

  isConfigured(apiKey?: string): boolean {
    return Boolean(apiKey?.trim())
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    if (!input.apiKey) {
      throw new Error(
        translateServerMessage(
          input.locale,
          'aiAssistant:error.apiStockApiKeyMissing',
          undefined,
          input.serverLocales,
        ),
      )
    }
    let modules: [typeof import('ai'), typeof import('@ai-sdk/openai-compatible')]
    try {
      modules = await Promise.all([
        import('ai'),
        import('@ai-sdk/openai-compatible'),
      ])
    } catch (cause) {
      throw new Error(
        translateServerMessage(
          input.locale,
          'aiAssistant:error.apiStockPeersMissing',
          undefined,
          input.serverLocales,
        ),
        { cause },
      )
    }
    const [{ generateText, stepCountIs }, { createOpenAICompatible }] = modules
    const apiStock = createOpenAICompatible({
      name: 'apiStock',
      apiKey: input.apiKey,
      baseURL: 'https://api.api-stock.com/api/v1',
    })
    const generate = generateText as unknown as (options: Record<string, unknown>) => Promise<{
      text: string
      toolCalls: Array<{ toolName: string }>
      toolResults: Array<{ toolName?: string; output: unknown }>
    }>
    const result = await generate({
      model: apiStock.chatModel(input.model),
      system: input.system,
      messages: input.messages,
      tools: input.tools,
      stopWhen: stepCountIs(input.maxSteps),
    })
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((call) => ({ toolName: call.toolName })),
      toolResults: result.toolResults.map((toolResult) => ({
        toolName: toolResult.toolName,
        output: toolResult.output,
      })),
    }
  }
}

/**
 * Built-in OpenRouter adapter. Its SDKs are optional peers and are loaded only
 * when this provider actually generates a response, so non-AI applications do
 * not install or initialize an LLM stack.
 */
export class OpenRouterLlmProvider implements ILlmProvider {
  readonly id = 'openrouter'
  readonly defaultModel = 'google/gemini-3.1-flash-lite-preview'

  isConfigured(apiKey?: string): boolean {
    return Boolean(apiKey?.trim())
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    if (!input.apiKey) {
      throw new Error(
        translateServerMessage(
          input.locale,
          'aiAssistant:error.openRouterApiKeyMissing',
          undefined,
          input.serverLocales,
        ),
      )
    }
    let modules: [typeof import('ai'), typeof import('@openrouter/ai-sdk-provider')]
    try {
      modules = await Promise.all([
        import('ai'),
        import('@openrouter/ai-sdk-provider'),
      ])
    } catch (cause) {
      throw new Error(
        translateServerMessage(
          input.locale,
          'aiAssistant:error.openRouterPeersMissing',
          undefined,
          input.serverLocales,
        ),
        { cause },
      )
    }
    const [{ generateText, stepCountIs }, { createOpenRouter }] = modules
    const openrouter = createOpenRouter({
      apiKey: input.apiKey,
      ...(input.appName ? { appName: input.appName } : {}),
      ...(input.appUrl ? { appUrl: input.appUrl } : {}),
    })
    const generate = generateText as unknown as (options: Record<string, unknown>) => Promise<{
      text: string
      toolCalls: Array<{ toolName: string }>
      toolResults: Array<{ toolName?: string; output: unknown }>
    }>
    const result = await generate({
      model: openrouter(input.model),
      system: input.system,
      messages: input.messages,
      tools: input.tools,
      stopWhen: stepCountIs(input.maxSteps),
    })
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((call) => ({ toolName: call.toolName })),
      toolResults: result.toolResults.map((toolResult) => ({
        toolName: toolResult.toolName,
        output: toolResult.output,
      })),
    }
  }
}

export const defaultLlmProvider = new ApiStockLlmProvider()
