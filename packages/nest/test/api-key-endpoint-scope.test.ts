import 'reflect-metadata'
import { describe, expect, test } from 'bun:test'
import { ForbiddenException, type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants.js'
import type { CurrentAdmin, ModernAdmin } from '@modern-admin/core'
import { AllowApiKey, ModernAdminAuthGuard } from '../src/auth.guard.js'

// An API key authenticates as its owner; its permissions only narrow what the
// core gate (`invoke()` / `canAccess()`) lets through. These tests pin that
// every other endpoint behind `ModernAdminAuthGuard` refuses key principals.

type Handler = (...args: unknown[]) => unknown
type ControllerClass = { name: string; prototype: Record<string, unknown> }

const keyPrincipal: CurrentAdmin = {
  id: 'u1',
  role: 'admin',
  apiKey: { id: 'k1', permissions: { payments: ['list'] } },
}
const sessionPrincipal: CurrentAdmin = { id: 'u1', role: 'admin' }

const guardFor = (principal: CurrentAdmin | null) =>
  new ModernAdminAuthGuard({
    auth: { getCurrentUser: async () => principal },
  } as unknown as ModernAdmin)

const contextFor = (cls: ControllerClass, handler: Handler, req: Record<string, unknown> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext

const usesAuthGuard = (target: object): boolean =>
  ((Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? []).includes(
    ModernAdminAuthGuard,
  )

// Every `*.controller.ts` in the package, so a newly added controller is swept
// without anyone remembering to list it here.
const srcDir = new URL('../src/', import.meta.url).pathname
const controllerModules = await Promise.all(
  Array.from(new Bun.Glob('*.controller.ts').scanSync(srcDir)).map(
    (file) => import(`${srcDir}${file}`) as Promise<Record<string, unknown>>,
  ),
)

/** Every `(controller, handler)` pair of the package guarded by ModernAdminAuthGuard. */
const guardedRoutes = (): Array<{ cls: ControllerClass; name: string; handler: Handler }> => {
  const routes: Array<{ cls: ControllerClass; name: string; handler: Handler }> = []
  for (const value of controllerModules.flatMap((mod) => Object.values(mod))) {
    if (typeof value !== 'function' || !value.prototype) continue
    const cls = value as unknown as ControllerClass
    const classGuarded = usesAuthGuard(cls)
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      // Read the descriptor, not the property: some controllers have getters.
      const handler = Object.getOwnPropertyDescriptor(cls.prototype, name)?.value as unknown
      if (name === 'constructor' || typeof handler !== 'function') continue
      if (!Reflect.hasMetadata('path', handler)) continue
      if (classGuarded || usesAuthGuard(handler)) {
        routes.push({ cls, name, handler: handler as Handler })
      }
    }
  }
  return routes
}

const allows = async (
  principal: CurrentAdmin | null,
  cls: ControllerClass,
  handler: Handler,
): Promise<boolean> => {
  try {
    return await guardFor(principal).canActivate(contextFor(cls, handler))
  } catch (err) {
    if (err instanceof ForbiddenException) return false
    throw err
  }
}

describe('ModernAdminAuthGuard — API-key principals', () => {
  test('only invoke()-gated endpoints accept API keys', async () => {
    const routes = guardedRoutes()
    // Guard against the sweep silently finding nothing.
    expect(routes.length).toBeGreaterThan(20)

    const open: string[] = []
    for (const { cls, name, handler } of routes) {
      if (await allows(keyPrincipal, cls, handler)) open.push(`${cls.name}.${name}`)
    }
    // Resource actions and global search funnel through `invoke()`, where the
    // key's allowlist is enforced; `me` only echoes the (scoped) principal.
    // Adding an endpoint here is a security decision — see `AllowApiKey`.
    expect(new Set(open.map((route) => route.split('.')[0]))).toEqual(
      new Set(['ResourceController', 'GlobalSearchController', 'AuthController']),
    )
    expect(open.filter((route) => route.startsWith('AuthController.'))).toEqual([
      'AuthController.me',
    ])
  })

  test.each([
    ['AuditLogController'],
    ['HistoryController'],
    ['WebhooksController'],
    ['DashboardController'],
    ['AnalyticsController'],
    ['CacheController'],
    ['ApiKeysController'],
    ['AiAssistantController'],
    ['MediaGenerationController'],
  ])('%s rejects an API key with 403', async (controller) => {
    const routes = guardedRoutes().filter(({ cls }) => cls.name === controller)
    expect(routes.length).toBeGreaterThan(0)
    for (const { cls, handler } of routes) {
      await expect(guardFor(keyPrincipal).canActivate(contextFor(cls, handler))).rejects.toThrow(
        ForbiddenException,
      )
    }
  })

  test('a session principal still passes the same endpoints', async () => {
    for (const { cls, handler } of guardedRoutes()) {
      expect(await allows(sessionPrincipal, cls, handler)).toBe(true)
    }
  })

  test('the principal is stored only when the request is let through', async () => {
    const audit = guardedRoutes().find(({ cls }) => cls.name === 'AuditLogController')!
    const req: Record<string, unknown> = {}
    await expect(
      guardFor(keyPrincipal).canActivate(contextFor(audit.cls, audit.handler, req)),
    ).rejects.toThrow(ForbiddenException)
    expect(req.currentAdmin).toBeUndefined()

    const resource = guardedRoutes().find(({ cls }) => cls.name === 'ResourceController')!
    await guardFor(keyPrincipal).canActivate(contextFor(resource.cls, resource.handler, req))
    expect(req.currentAdmin).toEqual(keyPrincipal)
  })

  test('no principal is still 401, not 403', async () => {
    const audit = guardedRoutes().find(({ cls }) => cls.name === 'AuditLogController')!
    await expect(guardFor(null).canActivate(contextFor(audit.cls, audit.handler))).rejects.toThrow(
      UnauthorizedException,
    )
  })

  test('AllowApiKey on a single handler opens only that handler', async () => {
    class HostController {
      open(): void {}
      closed(): void {}
    }
    AllowApiKey()(
      HostController.prototype,
      'open',
      Object.getOwnPropertyDescriptor(HostController.prototype, 'open')!,
    )
    const cls = HostController as unknown as ControllerClass
    const proto = HostController.prototype as unknown as Record<string, Handler>
    expect(await allows(keyPrincipal, cls, proto.open!)).toBe(true)
    expect(await allows(keyPrincipal, cls, proto.closed!)).toBe(false)
  })
})
