import {
  appendAfterHook,
  appendBeforeHook,
  omitFields,
  unflatten,
  type ActionRequest,
  type ActionResponse,
  type CurrentAdmin,
  type FeatureFn,
  type HistoryOp,
  type HistoryRetention,
  type ResourceOptions,
} from '@modern-admin/core'
import { resolveStore } from './stores.js'
import {
  DEFAULT_HISTORY_ACTIONS,
  type HistoryActionName,
  type HistoryFeatureOptions,
} from './types.js'

type BeforeHook = (
  request: ActionRequest,
  context: unknown,
) => ActionRequest | Promise<ActionRequest>

type AfterHook = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => ActionResponse | Promise<ActionResponse>

interface HistoryProperty {
  path(): string
  type(): string
  /** The decorator's raw options; `isAccessible: false` marks a secret. */
  options?: { isAccessible?: unknown }
}

interface HistoryContext {
  resource: {
    decorate(): {
      id: string
      properties: ReadonlyArray<HistoryProperty>
    }
    findOne?(id: string): Promise<{ params(): Record<string, unknown> } | null | undefined>
  }
  record?: { id?: string; params?: Record<string, unknown> }
  currentAdmin?: CurrentAdmin
  /** Snapshot captured by `edit.before` for diffing in `edit.after`. */
  __modernAdminHistoryEditBefore?: Record<string, unknown>
  /** Snapshot captured by `delete.before` for the delete log entry. */
  __modernAdminHistoryDeleteSnapshot?: {
    recordId: string
    snapshot: Record<string, unknown>
  }
}

/** Paths of virtual properties (m2m relations, computed fields, etc.)
 *  that don't exist in the underlying record's params. They get hydrated
 *  into responses by feature hooks asymmetrically — `edit.before` runs
 *  before hydration, `edit.after` runs after — so including them in the
 *  diff would always report phantom additions. Excluding them keeps the
 *  diff focused on the persisted column changes. */
function virtualPropertyPaths(ctx: HistoryContext): string[] {
  const out: string[] = []
  const properties = ctx.resource.decorate().properties ?? []
  for (const p of properties) {
    if (p.type() === 'm2m') out.push(p.path())
  }
  return out
}

/** Paths of secret-bearing properties stripped from snapshots by default:
 *  `password`-typed columns and statically inaccessible properties
 *  (`isAccessible: false`). Access *functions* are per-request and can't be
 *  soundly resolved here, so only the static `false` form is excluded. */
function secretPropertyPaths(ctx: HistoryContext): string[] {
  const out: string[] = []
  const properties = ctx.resource.decorate().properties ?? []
  for (const p of properties) {
    if (p.type() === 'password' || p.options?.isAccessible === false) {
      out.push(p.path())
    }
  }
  return out
}

/** The full set of paths to strip from a snapshot for this request. */
function excludedPaths(
  ctx: HistoryContext,
  userExcluded: string[],
  includeSecrets: boolean,
): Set<string> {
  return new Set([
    ...userExcluded,
    ...virtualPropertyPaths(ctx),
    ...(includeSecrets ? [] : secretPropertyPaths(ctx)),
  ])
}

const defaultUserIdResolver = (admin: CurrentAdmin | undefined): string | undefined => {
  const id = admin?.id
  return id === undefined || id === null ? undefined : String(id)
}

const responseRecord = (response: ActionResponse): {
  id?: string
  params?: Record<string, unknown>
} | undefined => (response as { record?: { id?: string; params?: Record<string, unknown> } }).record

/**
 * `edit.before` runs *before* the mutation and snapshots the current
 * record params onto the action context. The matching `after` hook
 * compares this snapshot against the post-mutation params to compute
 * the diff. Falling back to `ctx.record?.params` (already populated by
 * the runtime for record actions) keeps the hook robust if the
 * underlying resource hasn't been hydrated yet.
 */
function buildEditBeforeHook(options: HistoryFeatureOptions): BeforeHook {
  const userExcluded = options.excludeFields ?? []
  const includeSecrets = options.includeSecrets ?? false
  return async (request, context) => {
    const ctx = context as HistoryContext
    const excluded = excludedPaths(ctx, userExcluded, includeSecrets)
    const recordId = ctx.record?.id ?? request.params.recordId
    if (!recordId) return request
    let snapshot: Record<string, unknown> | undefined
    if (ctx.record?.params) {
      snapshot = ctx.record.params
    } else if (typeof ctx.resource.findOne === 'function') {
      try {
        const fresh = await ctx.resource.findOne(String(recordId))
        snapshot = fresh?.params() ?? undefined
      } catch (err) {
        // Falling back to {} is fine — diff against empty captures the
        // change as a series of `added` fields rather than `changed`.
        console.warn('[history] edit.before findOne failed', err)
      }
    }
    // `ctx.record.params` (and `findOne().params()`) are stored flat
    // (dot-notation keys like `metadata.locale`). The after-snapshot we
    // diff against comes from `response.record.params` which is *nested*
    // (it has already gone through `BaseRecord.toJSON()` → `unflatten`).
    // Unflatten here so both sides share the same shape — otherwise the
    // diff reports every JSON sub-property as removed and the parent
    // object as added, even when nothing actually changed.
    if (snapshot) {
      ctx.__modernAdminHistoryEditBefore = unflatten(omitFields(snapshot, excluded))
    }
    return request
  }
}

function buildAfterHook(
  actionName: HistoryActionName,
  options: Required<Pick<HistoryFeatureOptions, 'userIdResolver'>> & HistoryFeatureOptions & {
    retention: HistoryRetention
  },
): AfterHook {
  const store = resolveStore(options.store, options.retention)
  const userExcluded = options.excludeFields ?? []
  const includeSecrets = options.includeSecrets ?? false
  const retention = options.retention
  const hasRetention = retention.keepLast !== undefined || retention.keepDays !== undefined

  // Drive retention for stores that support pruning (the default memory
  // store already self-trims on append via its constructor policy; this
  // also covers host-supplied database stores that implement `prune`).
  const enforceRetention = async (): Promise<void> => {
    if (!hasRetention || typeof store.prune !== 'function') return
    try {
      await store.prune(retention)
    } catch (err) {
      console.warn('[history] prune failed', err)
    }
  }

  // Persist off the hot path: the mutation response must not wait on the
  // history write. `append` + retention run in the background; any failure
  // is logged, never surfaced (versioning must never break the mutation).
  const persist = (input: Parameters<typeof store.append>[0]): void => {
    void (async () => {
      try {
        await store.append(input)
        await enforceRetention()
      } catch (err) {
        console.warn('[history] failed to record revision', err)
      }
    })()
  }

  return async (response, _request, context) => {
    // The snapshot inputs are read synchronously (before returning) so the
    // background write sees the record state as it was at hook time; the
    // try/catch keeps even that prep from ever breaking the mutation.
    try {
      const ctx = context as HistoryContext
      const resourceId = ctx.resource.decorate().id
      const userId = options.userIdResolver(ctx.currentAdmin)
      const excluded = excludedPaths(ctx, userExcluded, includeSecrets)

      if (actionName === 'delete') {
        const snap = ctx.__modernAdminHistoryDeleteSnapshot
        if (snap) {
          persist({
            resourceId,
            recordId: snap.recordId,
            op: 'delete',
            ...(userId !== undefined ? { userId } : {}),
            snapshot: snap.snapshot,
            // Reverting a delete restores the pre-delete state — same as snapshot.
            snapshotBefore: snap.snapshot,
          })
        }
        return response
      }

      const record = responseRecord(response)
      if (!record?.id || !record.params) return response

      const after = omitFields(record.params, excluded)
      const before = actionName === 'edit'
        ? (ctx.__modernAdminHistoryEditBefore
            // Fallback path: `ctx.record.params` is flat, so unflatten to
            // match the nested shape used by `after` (see edit.before).
            ?? (ctx.record?.params ? unflatten(omitFields(ctx.record.params, excluded)) : {}))
        : {}
      const op: HistoryOp = actionName === 'new' ? 'create' : 'update'
      persist({
        resourceId,
        recordId: String(record.id),
        op,
        ...(userId !== undefined ? { userId } : {}),
        snapshot: after,
        // The state to restore on revert is whatever existed before this
        // change. For `new` revisions this is `{}`, which the controller
        // treats as "create can't be reverted by edit".
        snapshotBefore: before,
      })
    } catch (err) {
      // Versioning must never break the user-facing mutation result.
      // We log so persistence-layer breakage isn't silently swallowed.
      console.warn('[history] failed to record revision', err)
    }

    return response
  }
}

function buildDeleteBeforeHook(options: HistoryFeatureOptions): BeforeHook {
  const userExcluded = options.excludeFields ?? []
  const includeSecrets = options.includeSecrets ?? false
  return (request, context) => {
    const ctx = context as HistoryContext
    const excluded = excludedPaths(ctx, userExcluded, includeSecrets)
    const recordId = ctx.record?.id ?? request.params.recordId
    if (recordId && ctx.record?.params) {
      // Match the nested shape used by edit snapshots (after `unflatten`)
      // so revert and diff stay consistent across op types.
      ctx.__modernAdminHistoryDeleteSnapshot = {
        recordId: String(recordId),
        snapshot: unflatten(omitFields(ctx.record.params, excluded)),
      }
    }
    return request
  }
}

export function historyFeature(options: HistoryFeatureOptions = {}): FeatureFn {
  const actions = options.actions ?? [...DEFAULT_HISTORY_ACTIONS]
  const retention: HistoryRetention = {
    ...(options.keepLast !== undefined ? { keepLast: options.keepLast } : {}),
    ...(options.keepDays !== undefined ? { keepDays: options.keepDays } : {}),
  }
  // Resolve once so every action shares a single store instance (and the
  // in-memory fallback warning fires at most once). Retention bounds the
  // default store's growth.
  const store = resolveStore(options.store, retention)
  const resolved = {
    ...options,
    store,
    retention,
    userIdResolver: options.userIdResolver ?? defaultUserIdResolver,
  }

  return (resourceOptions: ResourceOptions): ResourceOptions => {
    const existingActions = resourceOptions.actions as
      | Record<string, Record<string, unknown>>
      | undefined
    const overrides: Record<string, Record<string, unknown>> = {}

    for (const name of actions) {
      const existing = existingActions?.[name]
      overrides[name] = {
        ...existing,
        after: appendAfterHook(existing, buildAfterHook(name, resolved)),
      }
      if (name === 'delete') {
        overrides[name]!.before = appendBeforeHook(existing, buildDeleteBeforeHook(options))
      } else if (name === 'edit') {
        overrides[name]!.before = appendBeforeHook(existing, buildEditBeforeHook(options))
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
