import { test, expect } from '@playwright/test'

/**
 * OpenAPI surface — `setupOpenApi()` in `packages/nest/src/openapi.ts`.
 *
 * The reference api opts in via `openApi: { ... }` in
 * `apps/api-prisma/src/main.ts`, which mounts:
 *
 *   GET /admin/api/openapi.json   — raw OpenAPI 3 document (wide-open CORS)
 *   GET /admin/api/docs           — Swagger UI
 *   GET /admin/api/reference      — Scalar UI (when the optional peer is present)
 *
 * The JSON document drives codegen tooling so the shape is part of the
 * public contract: `openapi: '3.x'`, `info.title`, `paths` keyed by route,
 * cookie+bearer security schemes, etc.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'

interface OpenApiDoc {
  openapi: string
  info: { title: string; version: string; description?: string }
  paths: Record<string, Record<string, unknown>>
  components?: {
    securitySchemes?: Record<string, { type: string; scheme?: string; in?: string }>
  }
}

test.describe('OpenAPI document', () => {
  test('GET /admin/api/openapi.json returns a valid OpenAPI 3 doc', async ({ request }) => {
    const res = await request.get(`${API}/admin/api/openapi.json`)
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
    expect(res.headers()['content-type'] ?? '').toContain('application/json')

    const doc = (await res.json()) as OpenApiDoc
    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.info.title).toBe('Modern Admin — Reference API')
    expect(doc.info.version).toBe('0.0.0')
    expect(typeof doc.paths).toBe('object')

    // A handful of canonical routes must be present.
    const pathKeys = Object.keys(doc.paths)
    expect(pathKeys.some((p) => p.includes('/admin/api/config'))).toBe(true)
    expect(pathKeys.some((p) => p.includes('/admin/api/resources'))).toBe(true)
    expect(pathKeys.some((p) => p.includes('/admin/api/global-search'))).toBe(true)
  })

  test('document advertises cookie + bearer security schemes', async ({ request }) => {
    const res = await request.get(`${API}/admin/api/openapi.json`)
    expect(res.ok()).toBeTruthy()
    const doc = (await res.json()) as OpenApiDoc
    const schemes = doc.components?.securitySchemes ?? {}
    const types = Object.values(schemes).map((s) => `${s.type}:${s.scheme ?? s.in ?? ''}`)
    // setupOpenApi() registers both via `addCookieAuth()` and `addBearerAuth()`.
    expect(types.some((t) => t.startsWith('apiKey:cookie'))).toBe(true)
    expect(types.some((t) => t === 'http:bearer')).toBe(true)
  })

  test('Swagger UI HTML is reachable at /admin/api/docs', async ({ request }) => {
    const res = await request.get(`${API}/admin/api/docs`)
    expect(res.ok()).toBeTruthy()
    const ct = res.headers()['content-type'] ?? ''
    expect(ct).toContain('text/html')
    const html = await res.text()
    // Swagger UI bootstraps via a known asset/element; either marker works.
    expect(html).toMatch(/swagger-ui|SwaggerUIBundle/i)
  })

  test('JSON endpoint exposes wide-open CORS for codegen tooling', async ({ request }) => {
    const res = await request.get(`${API}/admin/api/openapi.json`, {
      headers: { origin: 'https://example.com' },
    })
    expect(res.ok()).toBeTruthy()
    const allowOrigin = res.headers()['access-control-allow-origin'] ?? ''
    // Either echoed or `*` is acceptable — both satisfy "wide-open".
    expect(allowOrigin === '*' || allowOrigin === 'https://example.com').toBe(true)
  })
})
