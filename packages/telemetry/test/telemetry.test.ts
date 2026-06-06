import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { ModernAdmin } from '@modern-admin/core'
import { _resetInstanceId, _resetReported, collectTelemetryInfo, reportTelemetry } from '../src/index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildAdmin = (overrides: ConstructorParameters<typeof ModernAdmin>[0] = {}) =>
  new ModernAdmin(overrides)

// ─── collect ──────────────────────────────────────────────────────────────────

describe('collectTelemetryInfo', () => {
  afterEach(() => {
    _resetInstanceId()
  })

  test('returns valid TelemetryInfo shape for a minimal admin', () => {
    const admin = buildAdmin()
    const info = collectTelemetryInfo(admin)

    expect(info.instanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(info.adapters).toEqual([])
    expect(info.resourceCount).toBe(0)
    expect(info.featureFlags).toEqual([])
    expect(info.features).toEqual([])
    expect(typeof info.platform).toBe('string')
    expect(typeof info.runtime).toBe('string')
  })

  test('instanceId is stable within the same process run', () => {
    const admin = buildAdmin()
    const a = collectTelemetryInfo(admin)
    const b = collectTelemetryInfo(admin)
    expect(a.instanceId).toBe(b.instanceId)
  })

  test('instanceId resets after _resetInstanceId()', () => {
    const admin = buildAdmin()
    const first = collectTelemetryInfo(admin).instanceId
    _resetInstanceId()
    const second = collectTelemetryInfo(admin).instanceId
    expect(first).not.toBe(second)
  })

  test('resourceCount reflects registered resources', () => {
    // Without an adapter, resources list stays empty — we just verify the
    // counter path is wired correctly.
    const admin = buildAdmin()
    const info = collectTelemetryInfo(admin)
    expect(info.resourceCount).toBe(admin.resources.length)
  })

  test('featureFlags reflects options.featureFlags', () => {
    const admin = buildAdmin({ featureFlags: ['ai-fill', 'webhooks'] })
    const info = collectTelemetryInfo(admin)
    expect(info.featureFlags).toEqual(['ai-fill', 'webhooks'])
  })

  test('features contains only enabled (true) capability names', () => {
    const admin = buildAdmin({
      features: { auditLog: true, history: false, webhooks: true, apiKeys: false, aiAssistant: false },
    })
    const info = collectTelemetryInfo(admin)
    expect(info.features.sort()).toEqual(['auditLog', 'webhooks'])
  })

  test('adapters maps prisma / drizzle by constructor name', () => {
    // Simulate two adapters — one Prisma, one unknown — via plain objects
    // that carry a named constructor (reflecting what real adapters look like).
    function PrismaDatabase() {}
    function WidgetDatabase() {}

    const admin = buildAdmin({
      adapters: [
        { Database: PrismaDatabase, Resource: class {} },
        { Database: WidgetDatabase, Resource: class {} },
      ] as never,
    })
    const info = collectTelemetryInfo(admin)
    expect(info.adapters).toContain('prisma')
    expect(info.adapters).toContain('unknown')
  })

  test('adapter deduplication — two Prisma databases yield one entry', () => {
    function PrismaDatabase() {}
    const admin = buildAdmin({
      adapters: [
        { Database: PrismaDatabase, Resource: class {} },
        { Database: PrismaDatabase, Resource: class {} },
      ] as never,
    })
    const info = collectTelemetryInfo(admin)
    expect(info.adapters).toEqual(['prisma'])
  })

  test('runtime string starts with bun or node', () => {
    const admin = buildAdmin()
    const { runtime } = collectTelemetryInfo(admin)
    expect(runtime).toMatch(/^(bun|node)\//)
  })
})

// ─── report ───────────────────────────────────────────────────────────────────

describe('reportTelemetry', () => {
  beforeEach(() => {
    _resetReported()
    delete process.env.MODERN_ADMIN_TELEMETRY
  })
  afterEach(() => {
    _resetInstanceId()
    _resetReported()
    delete process.env.MODERN_ADMIN_TELEMETRY
  })

  test('does NOT call fetch when MODERN_ADMIN_TELEMETRY is not set', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const info = collectTelemetryInfo(buildAdmin())
    await reportTelemetry(info, { endpoint: 'http://test.local/t' })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  test('calls fetch exactly once when MODERN_ADMIN_TELEMETRY=1', async () => {
    process.env.MODERN_ADMIN_TELEMETRY = '1'
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const info = collectTelemetryInfo(buildAdmin())
    await reportTelemetry(info, { endpoint: 'http://test.local/t' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  test('second call is a no-op (deduplication guard)', async () => {
    process.env.MODERN_ADMIN_TELEMETRY = '1'
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const info = collectTelemetryInfo(buildAdmin())
    await reportTelemetry(info, { endpoint: 'http://test.local/t' })
    await reportTelemetry(info, { endpoint: 'http://test.local/t' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  test('sends payload as JSON to the provided endpoint', async () => {
    process.env.MODERN_ADMIN_TELEMETRY = '1'
    let capturedUrl = ''
    let capturedBody = ''
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url)
        capturedBody = String(init?.body ?? '')
        return new Response()
      }) as unknown as typeof fetch,
    )
    const info = collectTelemetryInfo(buildAdmin({ featureFlags: ['ai-fill'] }))
    await reportTelemetry(info, { endpoint: 'http://test.local/t' })

    expect(capturedUrl).toBe('http://test.local/t')
    const parsed = JSON.parse(capturedBody) as typeof info
    expect(parsed.featureFlags).toEqual(['ai-fill'])
    fetchSpy.mockRestore()
  })

  test('is silent when fetch throws (network error)', async () => {
    process.env.MODERN_ADMIN_TELEMETRY = '1'
    const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('ECONNREFUSED'),
    )
    const info = collectTelemetryInfo(buildAdmin())
    // Must not throw
    await expect(reportTelemetry(info, { endpoint: 'http://test.local/t' })).resolves.toBeUndefined()
    fetchSpy.mockRestore()
  })
})
