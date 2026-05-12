// AdminControllerScanner — walks the Nest DI container, finds providers
// tagged with @AdminResource, and synthesises a ResourceWithOptions per
// controller. The scanner is the only place where reflect-metadata is
// read back; bootstrap uses the synthesised list to register resources
// on the underlying ModernAdmin instance.
//
// Wrapping a method as a core ActionHandler / Before / After captures
// the bound DI instance, so user methods can rely on injected services.

import { Injectable } from '@nestjs/common'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js'
import type {
  Action,
  ActionContext,
  ActionRequest,
  ActionResponse,
  After,
  Before,
  ResourceOptions,
  ResourceWithOptions,
} from '@modern-admin/core'
import type { AdminActionContext } from './admin-context.js'
import { AdminController } from './admin-controller.js'
import {
  ADMIN_ACTIONS_META,
  ADMIN_HOOKS_META,
  ADMIN_RESOURCE_META,
  type ActionMeta,
  type AdminResourceMeta,
  type HookMeta,
} from './decorators.js'

const BUILT_IN_NAMES = new Set([
  'list',
  'show',
  'new',
  'edit',
  'delete',
  'bulkDelete',
  'search',
])

/** Pairing returned by the scanner so bootstrap can wire each controller. */
export interface ScannedController {
  controller: AdminController
  rwo: ResourceWithOptions
}

/** Build the typed AdminActionContext from a raw core (request, ctx) pair. */
const toAdminContext = (
  request: ActionRequest,
  core: ActionContext,
): AdminActionContext => ({
  admin: core.admin,
  resource: core.resource,
  ...(core.record !== undefined ? { record: core.record } : {}),
  ...(core.records !== undefined ? { records: core.records } : {}),
  ...(core.currentAdmin !== undefined ? { currentAdmin: core.currentAdmin } : {}),
  payload: { ...((request.payload ?? {}) as Record<string, unknown>) },
  query: { ...(request.query ?? {}) },
  params: request.params,
  cache: core.cache,
  request,
  core,
})

@Injectable()
export class AdminControllerScanner {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  scan(): ScannedController[] {
    void this.metadataScanner
    // Walk both providers and controllers so admin classes can be declared
    // either as `providers: [...]` or — semantically more natural — as
    // `controllers: [...]` in a host module. De-duplicate by metatype in
    // case a class shows up in both lists (e.g. legacy forFeature plus a
    // host-level `controllers` declaration).
    const seen = new Set<unknown>()
    const wrappers: InstanceWrapper[] = []
    for (const w of [
      ...this.discovery.getProviders(),
      ...this.discovery.getControllers(),
    ]) {
      const t = w.metatype as object | undefined
      if (t == null || !Reflect.hasMetadata(ADMIN_RESOURCE_META, t)) continue
      if (seen.has(t)) continue
      seen.add(t)
      wrappers.push(w)
    }
    return wrappers.map((w) => this.toPair(w))
  }

  private toPair(wrapper: InstanceWrapper): ScannedController {
    const ctor = wrapper.metatype as object
    const instance = wrapper.instance as AdminController
    if (!(instance instanceof AdminController)) {
      throw new Error(
        `[modern-admin/nest] ${wrapper.name as string} is decorated with @AdminResource but does not extend AdminController`,
      )
    }
    const meta = Reflect.getMetadata(ADMIN_RESOURCE_META, ctor) as AdminResourceMeta
    const actionsMeta: ActionMeta[] =
      Reflect.getMetadata(ADMIN_ACTIONS_META, ctor) ?? []
    const hooksMeta: HookMeta[] = Reflect.getMetadata(ADMIN_HOOKS_META, ctor) ?? []

    const overrideMethods = this.findOverriddenMethods(instance)

    const actions: Record<string, Partial<Action<ActionResponse>>> = {}

    // 1. Built-in overrides — handler replacement.
    for (const methodName of overrideMethods) {
      if (!BUILT_IN_NAMES.has(methodName)) continue
      actions[methodName] = {
        ...(actions[methodName] ?? {}),
        handler: this.wrapHandler(instance, methodName),
      }
    }

    // 2. Custom @Action methods.
    for (const a of actionsMeta) {
      const action: Partial<Action<ActionResponse>> = {
        name: a.name,
        actionType: a.actionType,
        handler: this.wrapHandler(instance, a.methodName),
        ...(a.isVisible !== undefined ? { isVisible: a.isVisible } : {}),
        ...(a.isAccessible !== undefined ? { isAccessible: a.isAccessible } : {}),
        ...(a.nesting !== undefined ? { nesting: a.nesting } : {}),
        ...(a.guard !== undefined ? { guard: a.guard } : {}),
        ...(a.component !== undefined ? { component: a.component } : {}),
        ...(a.custom !== undefined ? { custom: a.custom } : {}),
      }
      actions[a.name] = { ...(actions[a.name] ?? {}), ...action }
    }

    // 3. @Before / @After hooks.
    for (const h of hooksMeta) {
      const target = (actions[h.action] ??= {}) as {
        before?: Before[]
        after?: After<ActionResponse>[]
      }
      if (h.kind === 'before') {
        const list = (target.before as Before[] | undefined) ?? []
        list.push(this.wrapBefore(instance, h.methodName))
        target.before = list
      } else {
        const list = (target.after as After<ActionResponse>[] | undefined) ?? []
        list.push(this.wrapAfter(instance, h.methodName))
        target.after = list
      }
    }

    const rawResource = meta.source()

    const options: ResourceOptions = {
      ...stripMetaInternals(meta),
      ...(Object.keys(actions).length > 0
        ? { actions: actions as ResourceOptions['actions'] }
        : {}),
    }

    const rwo: ResourceWithOptions = {
      resource: rawResource,
      options,
      ...(meta.features !== undefined ? { features: meta.features } : {}),
    }
    return { controller: instance, rwo }
  }

  private findOverriddenMethods(instance: AdminController): string[] {
    const subclassProto = Object.getPrototypeOf(instance) as object
    return Object.getOwnPropertyNames(subclassProto).filter(
      (name) =>
        name !== 'constructor' &&
        typeof (subclassProto as Record<string, unknown>)[name] === 'function',
    )
  }

  private wrapHandler(
    instance: AdminController,
    methodName: string,
  ): (req: ActionRequest, ctx: ActionContext) => Promise<ActionResponse> {
    const fn = (instance as unknown as Record<string, (ctx: AdminActionContext) => unknown>)[methodName]
    if (typeof fn !== 'function') {
      throw new Error(`[modern-admin/nest] method ${methodName} not found on controller`)
    }
    return async (req, ctx) => {
      const adminCtx = toAdminContext(req, ctx)
      const out = await fn.call(instance, adminCtx)
      return (out ?? {}) as ActionResponse
    }
  }

  private wrapBefore(instance: AdminController, methodName: string): Before {
    const fn = (instance as unknown as Record<string, unknown>)[methodName] as
      | ((ctx: AdminActionContext) => unknown)
      | undefined
    if (typeof fn !== 'function') {
      throw new Error(`[modern-admin/nest] hook method ${methodName} not found on controller`)
    }
    return async (req, ctx) => {
      const adminCtx = toAdminContext(req, ctx)
      await fn.call(instance, adminCtx)
      return {
        ...req,
        payload: adminCtx.payload as Record<string, unknown>,
        query: adminCtx.query,
      }
    }
  }

  private wrapAfter(
    instance: AdminController,
    methodName: string,
  ): After<ActionResponse> {
    const fn = (instance as unknown as Record<string, unknown>)[methodName] as
      | ((ctx: AdminActionContext, res: ActionResponse) => unknown)
      | undefined
    if (typeof fn !== 'function') {
      throw new Error(`[modern-admin/nest] hook method ${methodName} not found on controller`)
    }
    return async (response, req, ctx) => {
      const adminCtx = toAdminContext(req, ctx)
      const out = await fn.call(instance, adminCtx, response)
      return (out ?? response) as ActionResponse
    }
  }
}

const stripMetaInternals = (meta: AdminResourceMeta): ResourceOptions => {
  const copy = { ...meta } as Partial<AdminResourceMeta> & Record<string, unknown>
  delete copy.source
  delete copy.features
  return copy as ResourceOptions
}
