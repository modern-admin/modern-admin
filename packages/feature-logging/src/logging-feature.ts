/**
 * `actionLoggingFeature` — local resource plugin that records every
 * configured action into an `ILogStore` after it runs.
 *
 * The implementation chains an `after` hook onto each target action:
 * existing hooks (e.g. from `uploadFeature`) are preserved and run first,
 * then the logging hook is appended.
 *
 * @example
 * const usersResource: ResourceWithOptions = {
 *   resource: UsersTable,
 *   features: [
 *     actionLoggingFeature({
 *       store: new MemoryLogStore(),
 *       actions: ['new', 'edit', 'delete'],
 *       includePayload: true,
 *     }),
 *   ],
 * }
 */

import {
  uuidv7,
  type ActionRequest,
  type ActionResponse,
  type FeatureFn,
  type ResourceOptions,
} from '@modern-admin/core'
import type { ActionLogEntry, ActionLoggingOptions, ILogStore } from './types.js'
import { DEFAULT_LOGGED_ACTIONS } from './types.js'
import { resolveStore } from './stores.js'

// ─── Hook chaining (mirrors uploadFeature) ───────────────────────────────────

type HookFn = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => ActionResponse | Promise<ActionResponse>

function toArray(hook: unknown): HookFn[] {
  if (!hook) return []
  return Array.isArray(hook) ? (hook as HookFn[]) : [hook as HookFn]
}

function mergeAfterHook(
  existing: Record<string, unknown> | undefined,
  newHook: HookFn,
): HookFn[] {
  return [...toArray(existing?.after), newHook]
}

// ─── Hook factory ────────────────────────────────────────────────────────────

/**
 * Build the `after` hook for a single action. Pulls metadata from
 * the action context / request / response and forwards it to the store.
 * Store errors are swallowed so logging cannot break the action result.
 */
function buildAfterHook(
  actionName: string,
  store: ILogStore,
  options: ActionLoggingOptions,
): HookFn {
  return async (response, request, context) => {
    const ctx = context as {
      resource: { decorate(): { id: string } }
      currentAdmin?: { id?: unknown }
    }
    const rec = response as { record?: { id?: string; title?: string; params?: Record<string, unknown> } }

    const entry: ActionLogEntry = {
      id: uuidv7(),
      resourceId: ctx.resource.decorate().id,
      action: actionName,
      at: Date.now(),
    }

    const recordId = rec.record?.id ?? request.params.recordId
    if (recordId) entry.recordId = String(recordId)

    // Store the human-readable title at write time so it survives deletion
    // and is available without a follow-up fetch. Skip it when it equals
    // the id (title() fell back to id because no title property exists).
    const recordTitle = rec.record?.title
    if (recordTitle && recordTitle !== String(recordId ?? '')) {
      entry.recordTitle = recordTitle
    }

    if (request.params.recordIds) {
      const ids = String(request.params.recordIds).split(',').filter(Boolean)
      if (ids.length > 0) entry.recordIds = ids
    }

    const userId = ctx.currentAdmin?.id
    if (userId !== undefined && userId !== null) entry.userId = String(userId)

    if (options.includePayload && request.payload) {
      // Carry transport-supplied metadata (e.g. revert `reason`) alongside
      // the raw payload so consumers (audit log, webhooks) see it.
      entry.payload = request.meta
        ? { ...request.payload, ...request.meta }
        : request.payload
    } else if (request.meta && Object.keys(request.meta).length > 0) {
      entry.payload = { ...request.meta }
    }
    if (options.includeResult && rec.record?.params) entry.result = rec.record.params

    try {
      await store.record(entry)
    } catch (err) {
      // Logging must never break the action result, but we surface the
      // failure so persistent-store outages aren't silently swallowed.
      console.warn('[action-log] failed to record entry', err)
    }
    return response
  }
}

// ─── Feature function ────────────────────────────────────────────────────────

/**
 * Returns a `FeatureFn` that wires action logging into a resource's
 * `ResourceOptions`. Safe to combine with other features (hooks chain).
 */
export function actionLoggingFeature(options: ActionLoggingOptions = {}): FeatureFn {
  const store = resolveStore(options.store)
  const actions = options.actions ?? DEFAULT_LOGGED_ACTIONS

  return (resourceOptions: ResourceOptions): ResourceOptions => {
    const targetActions = actions === '*'
      // '*' — apply at runtime by reading whichever actions exist on the
      // merged resource. Since ResourceOptions only sees actions explicitly
      // overridden here, we instead expand to the union of (existing
      // overrides) + (default mutating actions) — covers the realistic case.
      ? Array.from(new Set([
          ...DEFAULT_LOGGED_ACTIONS,
          ...Object.keys(resourceOptions.actions ?? {}),
        ]))
      : actions

    const existingActions = resourceOptions.actions as
      | Record<string, Record<string, unknown>>
      | undefined

    const overrides: Record<string, Record<string, unknown>> = {}
    for (const name of targetActions) {
      const existing = existingActions?.[name]
      overrides[name] = {
        ...existing,
        after: mergeAfterHook(existing, buildAfterHook(name, store, options)),
      }
    }

    return {
      ...resourceOptions,
      actions: {
        ...(resourceOptions.actions ?? {}),
        ...overrides,
      } as ResourceOptions['actions'],
    }
  }
}
