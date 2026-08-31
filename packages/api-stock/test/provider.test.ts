import { describe, expect, it } from 'bun:test'
import { ApiStockMediaGenerationProvider, ApiStockRequestError } from '../src/index.js'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const asFetch = (
  implementation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch => implementation as typeof globalThis.fetch

describe('ApiStockMediaGenerationProvider', () => {
  it('normalizes and caches media catalog models', async () => {
    let calls = 0
    const provider = new ApiStockMediaGenerationProvider({
      fetch: asFetch(async () => {
        calls++
        return jsonResponse([
          {
            id: 'flux',
            name: 'Flux',
            type: 'IMAGE',
            kind: 'media',
            tags: [],
            capabilities: [],
            pricing: [{ key: 'default', price: '0.20', isDefault: true, unitPrice: '0.10' }],
            priceMultiplier: { param: 'count', catalogValue: 2 },
            params: [
              {
                name: 'prompt',
                label: 'Prompt',
                kind: 'string',
                isArray: false,
                required: true,
                isMedia: false,
                isPrompt: true,
                multiline: true,
                deprecated: false,
              },
            ],
          },
          {
            id: 'chat',
            name: 'Chat',
            type: 'text',
            kind: 'llm',
            tags: [],
            capabilities: [],
            pricing: [],
            params: [],
          },
        ])
      }),
    })

    const first = await provider.getCatalog({ apiKey: 'secret' })
    const second = await provider.getCatalog({ apiKey: 'secret' })

    expect(first.map((model) => model.id)).toEqual(['flux'])
    expect(first[0]?.type).toBe('image')
    expect(first[0]?.priceMultiplier).toEqual({ param: 'count', catalogValue: 2 })
    expect(provider.allowedFileHosts).toEqual(['storage.api-stock.com', 'aitohumanize.com'])
    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it('submits webhook generation and normalizes task status', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const provider = new ApiStockMediaGenerationProvider({
      baseUrl: 'https://api.example/v1',
      fetch: asFetch(async (input, init) => {
        requests.push({ url: String(input), init })
        return jsonResponse({
          code: 200,
          data: {
            taskId: 'provider-task-1',
            status: requests.length === 1 ? 'not_started' : 'finished',
            files:
              requests.length === 1
                ? []
                : [{ fileUrl: 'https://cdn.example/result.png', fileType: 'image' }],
          },
        })
      }),
    })

    const created = await provider.create(
      {
        model: 'flux',
        input: { prompt: 'A ceramic cup' },
        webhookUrl: 'https://admin.example/webhook/token',
      },
      { apiKey: 'api-key-value' },
    )
    const finished = await provider.getStatus('provider-task-1', { apiKey: 'api-key-value' })

    expect(created.status).toBe('pending')
    expect(finished.status).toBe('finished')
    expect(finished.files).toEqual([{ url: 'https://cdn.example/result.png', type: 'image' }])
    expect(requests[0]?.url).toBe('https://api.example/v1/generation/create')
    expect(requests[1]?.url).toBe('https://api.example/v1/task/status/provider-task-1')
    expect(requests[0]?.init?.headers).toMatchObject({ Authorization: 'Bearer api-key-value' })
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      model: 'flux',
      input: { prompt: 'A ceramic cup' },
      webhook: 'https://admin.example/webhook/token',
    })
  })

  it('surfaces bounded HTTP error metadata', async () => {
    const provider = new ApiStockMediaGenerationProvider({
      fetch: asFetch(
        async () =>
          new Response('provider unavailable', {
            status: 503,
            headers: { 'retry-after': '10' },
          }),
      ),
    })

    const error = await provider.getStatus('task', { apiKey: 'secret' }).catch((caught) => caught)
    expect(error).toBeInstanceOf(ApiStockRequestError)
    expect(error).toMatchObject({ status: 503, retryAfter: '10' })
    expect(String(error)).not.toContain('secret')
  })
})
