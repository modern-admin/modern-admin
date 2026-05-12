// Reflect-metadata decorators that mark a class / method for the
// AdminControllerScanner to pick up at bootstrap. No code transformation,
// no babel plugin — just metadata keys read back via Reflect.
//
// `@AdminResource` also applies `@Controller()` so the class can be
// placed in the standard `controllers: [...]` array of a host module
// and resolved by Nest DI. No HTTP routes are registered because the
// admin methods don't carry `@Get`/`@Post`/etc. decorators.

import { Controller, Injectable } from '@nestjs/common'
import 'reflect-metadata'
import type {
  ActionNesting,
  ActionType,
  BuiltInActionName,
  FeatureFn,
  RelatedResource,
  ResourceOptions,
} from '@modern-admin/core'
import type { CurrentAdmin, ActionContext } from '@modern-admin/core'

export const ADMIN_RESOURCE_META = Symbol('modern-admin:resource')
export const ADMIN_ACTIONS_META = Symbol('modern-admin:actions')
export const ADMIN_HOOKS_META = Symbol('modern-admin:hooks')

// ── Resource ────────────────────────────────────────────────────────────────

export interface AdminResourceMeta extends Omit<ResourceOptions, 'actions'> {
  /**
   * Lazy factory returning the raw resource (e.g. a Drizzle table or
   * Prisma model name). Lazy so adapter-specific imports can resolve at
   * call time rather than during decorator evaluation.
   */
  source: () => unknown
  /** Local resource-scoped feature transforms (run before plugins). */
  features?: FeatureFn[]
  /** Reverse 1:N tabs on the show page. */
  relatedResources?: RelatedResource[]
}

/**
 * Marks a class as an admin resource controller. Applies both
 * `@Controller()` (so the class can sit in a host module's
 * `controllers: [...]` array) and `@Injectable()` (so it works equally
 * well as a provider), plus the metadata read back by the scanner at
 * bootstrap to materialise the resource on the underlying ModernAdmin.
 */
export function AdminResource(meta: AdminResourceMeta): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(ADMIN_RESOURCE_META, meta, target)
    Controller()(target)
    Injectable()(target)
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

export interface ActionMeta {
  /** Method name on the class — set by the decorator. */
  methodName: string
  /** Public action name (URL slug). Defaults to method name. */
  name: string
  actionType: ActionType
  isVisible?: boolean | ((ctx: ActionContext) => boolean | Promise<boolean>)
  isAccessible?:
    | boolean
    | ((ctx: ActionContext) => boolean | Promise<boolean>)
  nesting?: ActionNesting
  guard?: string
  component?: string | null
  custom?: Record<string, unknown>
}

export interface ActionDecoratorOptions
  extends Omit<ActionMeta, 'methodName' | 'name'> {
  name?: string
}

/**
 * Marks a method as a custom admin action. The discovery pass wraps it
 * into a core `ActionHandler` and registers it on the resource's options.
 *
 * @example
 *   @Action({ actionType: 'record', icon: 'Mail' })
 *   resendWelcome(ctx: AdminActionContext<UserRow>) { ... }
 */
export function Action(opts: ActionDecoratorOptions): MethodDecorator {
  return (target, propertyKey) => {
    const list: ActionMeta[] =
      Reflect.getMetadata(ADMIN_ACTIONS_META, target.constructor) ?? []
    list.push({
      ...opts,
      methodName: String(propertyKey),
      name: opts.name ?? String(propertyKey),
    })
    Reflect.defineMetadata(ADMIN_ACTIONS_META, list, target.constructor)
  }
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export type HookKind = 'before' | 'after'

export interface HookMeta {
  methodName: string
  kind: HookKind
  /** Action name the hook applies to (built-in or custom). */
  action: string
}

const defineHook = (
  target: object,
  propertyKey: string | symbol,
  kind: HookKind,
  action: string,
): void => {
  const ctor = (target as { constructor: object }).constructor
  const list: HookMeta[] = Reflect.getMetadata(ADMIN_HOOKS_META, ctor) ?? []
  list.push({ methodName: String(propertyKey), kind, action })
  Reflect.defineMetadata(ADMIN_HOOKS_META, list, ctor)
}

/**
 * Registers a `before`-hook for a built-in or custom action. The method
 * receives the typed `AdminActionContext` and may mutate `payload` /
 * `query` to alter the request before the handler runs.
 */
export function Before(
  action: BuiltInActionName | string,
): MethodDecorator {
  return (target, propertyKey) => defineHook(target, propertyKey, 'before', action)
}

/**
 * Registers an `after`-hook for a built-in or custom action. The method
 * receives `(ctx, response)` and may return a modified response or void
 * to keep the response unchanged.
 */
export function After(
  action: BuiltInActionName | string,
): MethodDecorator {
  return (target, propertyKey) => defineHook(target, propertyKey, 'after', action)
}

// Re-exports for convenience.
export type { CurrentAdmin }
