/**
 * `uploadFeature` — resource plugin that wires file upload into any resource.
 *
 * Returns a `FeatureFn` that, when applied to a resource's `ResourceOptions`,
 * marks the configured properties as `type: 'file'` (with `isArray` when
 * configured), registers the upload providers in `UploadProviderRegistry`, and
 * installs action hooks that:
 *
 *   - on `new.after` / `edit.after` — confirm freshly-uploaded keys against
 *     `PendingUploadsRegistry` so the orphan sweeper leaves them alone;
 *   - on `edit.after` — delete files whose key was replaced or removed
 *     (single-value: old !== new; array: keys present in old but missing
 *     from new);
 *   - on `delete.after` — delete every file referenced by the deleted record.
 *
 * Hooks are **chained**, not replaced: if the incoming `ResourceOptions`
 * already has hooks (e.g. from another feature), the upload hooks are
 * appended so all hooks run in order.
 *
 * @example
 * uploadFeature({
 *   properties: {
 *     thumbnail: { provider: localProvider, mimeTypes: ['image/*'] },
 *     gallery:   { provider: localProvider, isArray: true, mimeTypes: ['image/*'] },
 *   },
 * })
 */

import { appendAfterHook, uuidv7, type ActionRequest, type ActionResponse, type FeatureFn, type ResourceOptions } from '@modern-admin/core'
import type { UploadFeatureOptions, UploadPropertyConfig } from './types.js'
import { UploadProviderRegistry } from './registry.js'
import { PendingUploadsRegistry } from './pending-registry.js'

interface RegisteredProp {
  providerId: string
  config: UploadPropertyConfig
}

// ─── Hook chaining ────────────────────────────────────────────────────────────

type HookFn = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => ActionResponse | Promise<ActionResponse>

// ─── Value helpers ────────────────────────────────────────────────────────────

/** Return non-empty file keys for the given value (handles single + array). */
function toKeys(value: unknown): string[] {
  if (value == null || value === '') return []
  if (Array.isArray(value)) {
    return value.flatMap((v) => (v == null || v === '' ? [] : [String(v)]))
  }
  return [String(value)]
}

// ─── Feature function ─────────────────────────────────────────────────────────

export function uploadFeature(options: UploadFeatureOptions): FeatureFn {
  // Precompute per-property config plus a process-local fallback id, used only
  // when the FeatureFn is invoked without a resource (e.g. unit tests calling
  // it directly). In production the id is derived from `resource.id()` below.
  const props = Object.entries(options.properties).map(([propPath, config]) => ({
    propPath,
    config,
    fallbackId: `up_${uuidv7().replace(/-/g, '')}`,
  }))

  return (resourceOptions: ResourceOptions, resource?): ResourceOptions => {
    // Register providers with a DETERMINISTIC id derived from the resource id
    // + property path. Every replica behind a load balancer computes the same
    // id, so a property served by replica A resolves on replica B's registry
    // (a per-process UUID would 500 on the "wrong" replica). Registration
    // happens here (at bootstrap decorate time), before any request is served.
    const registered = new Map<string, RegisteredProp>()
    for (const { propPath, config, fallbackId } of props) {
      const providerId = resource ? `up_${resource.id()}_${propPath}` : fallbackId
      UploadProviderRegistry.register(providerId, {
        provider: config.provider,
        uploadPath: config.uploadPath,
        isArray: config.isArray ?? false,
        ...(config.mimeTypes ? { mimeTypes: config.mimeTypes } : {}),
        ...(config.maxSize != null ? { maxSize: config.maxSize } : {}),
      })
      registered.set(propPath, { providerId, config })
    }

    // --- Property overrides ---
    const propOverrides: ResourceOptions['properties'] = {}
    for (const [propPath, { providerId, config }] of registered) {
      // S3 with signed URLs has no static URL template.
      const urlTmpl = config.provider.urlTemplate?.() ?? null
      propOverrides[propPath] = {
        type: 'file',
        ...(config.isArray ? { isArray: true } : {}),
        custom: {
          uploadProviderId: providerId,
          uploadUrlTemplate: urlTmpl,
          uploadMimeTypes: config.mimeTypes ?? null,
          uploadMaxSize: config.maxSize ?? null,
        },
      }
    }

    // --- Action hooks ---

    // After new: confirm every freshly-uploaded key against the pending registry.
    const newAfterHook: HookFn = (
      response: ActionResponse,
      _request: ActionRequest,
      _context: unknown,
    ): ActionResponse => {
      const rec = response as { record?: { params?: Record<string, unknown> } }
      const params = rec.record?.params ?? {}
      const newKeys: string[] = []
      for (const propPath of registered.keys()) {
        newKeys.push(...toKeys(params[propPath]))
      }
      if (newKeys.length > 0) PendingUploadsRegistry.confirm(newKeys)
      return response
    }

    // After edit: delete keys that disappeared and confirm keys that arrived.
    const editAfterHook: HookFn = async (
      response: ActionResponse,
      _request: ActionRequest,
      context: unknown,
    ): Promise<ActionResponse> => {
      const ctx = context as { record?: { get(path: string): unknown } }
      const rec = response as { record?: { params?: Record<string, unknown> } }
      const params = rec.record?.params ?? {}
      for (const [propPath, { config }] of registered) {
        const oldKeys = new Set(toKeys(ctx.record?.get(propPath)))
        const newKeys = toKeys(params[propPath])
        // Confirm new keys (possibly fresh uploads).
        if (newKeys.length > 0) PendingUploadsRegistry.confirm(newKeys)
        // Delete keys that were present before and are gone now.
        const newSet = new Set(newKeys)
        for (const k of oldKeys) {
          if (!newSet.has(k)) {
            try {
              await config.provider.delete(k)
            } catch {
              // Non-fatal — don't break the action response.
            }
          }
        }
      }
      return response
    }

    // After delete: delete every file referenced by the (now-removed) record.
    const deleteAfterHook: HookFn = async (
      response: ActionResponse,
      _request: ActionRequest,
      context: unknown,
    ): Promise<ActionResponse> => {
      const ctx = context as { record?: { get(path: string): unknown } }
      for (const [propPath, { config }] of registered) {
        const keys = toKeys(ctx.record?.get(propPath))
        for (const k of keys) {
          try {
            await config.provider.delete(k)
          } catch {
            // Non-fatal.
          }
        }
      }
      return response
    }

    // Retrieve any existing action overrides so we can chain, not replace.
    const existingActions = resourceOptions.actions as Record<string, Record<string, unknown>> | undefined
    const existingNew = existingActions?.['new']
    const existingEdit = existingActions?.['edit']
    const existingDelete = existingActions?.['delete']

    const actionOverrides = {
      new: {
        ...existingNew,
        after: appendAfterHook(existingNew, newAfterHook),
      },
      edit: {
        ...existingEdit,
        after: appendAfterHook(existingEdit, editAfterHook),
      },
      delete: {
        ...existingDelete,
        after: appendAfterHook(existingDelete, deleteAfterHook),
      },
    } as ResourceOptions['actions']

    return {
      ...resourceOptions,
      properties: { ...resourceOptions.properties, ...propOverrides },
      actions: {
        ...(resourceOptions.actions ?? {}),
        ...actionOverrides,
      },
    }
  }
}
