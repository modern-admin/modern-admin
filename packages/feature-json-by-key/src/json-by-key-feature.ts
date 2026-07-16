/**
 * `jsonByKeyFeature` — local resource feature that fans a single JSON column
 * out into N virtual sub-properties on the edit form.
 *
 *   DB row                         Form fields (showWhen=region)
 *   ─────────────────────────      ───────────────────────────────────────
 *   previews:  {                   region:            <select east-eu|us|…>
 *     east-eu: 's3://…/a.jpg',     previews__east-eu: <file editor>
 *     us:      's3://…/b.jpg',     previews__us:      <file editor>
 *   }
 *
 * Each virtual carries:
 *   • the underlying child type (file / string / reference / textarea / …)
 *   • a `showWhen` rule pointing at `controlField` so only the matching one
 *     is visible in the form
 *   • for files: an entry in `UploadProviderRegistry` so the standard
 *     upload controller handles uploads to the right backend & path.
 *
 * Hooks installed:
 *   • after  show / list / edit / new — expand `params[prop]` (JSON object)
 *     into `params[prop__key]` virtuals so the frontend pre-fills the form.
 *   • before new / edit                — collapse incoming virtuals back into
 *     `payload[prop]` and remove the virtuals so the underlying handler
 *     persists a clean JSON object.
 *   • after  edit                      — diff old vs new file keys per region
 *     and delete orphaned files from the storage backend.
 *   • after  delete                    — delete every file referenced by the
 *     deleted record's JSON columns.
 *
 * Hooks are chained, never replaced — same convention used by `uploadFeature`
 * and `m2mFeature`.
 */

import { appendAfterHook, appendBeforeHook, uuidv7 } from '@modern-admin/core'
import type {
  ActionRequest,
  ActionResponse,
  FeatureFn,
  ListActionResponse,
  RecordActionResponse,
  ResourceOptions,
} from '@modern-admin/core'
import {
  PendingUploadsRegistry,
  UploadProviderRegistry,
  type IUploadProvider,
} from '@modern-admin/feature-upload'
import type {
  JsonByKeyChildConfig,
  JsonByKeyCustomData,
  JsonByKeyFeatureOptions,
  JsonByKeyPropertyConfig,
} from './types.js'

// ─── Hook chaining ───────────────────────────────────────────────────────────

type AfterHookFn = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => ActionResponse | Promise<ActionResponse>

type BeforeHookFn = (
  request: ActionRequest,
  context: unknown,
) => ActionRequest | Promise<ActionRequest>

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract every non-blank file key from a JSON child value. */
const fileKeysFromChildValue = (value: unknown): string[] => {
  if (value == null || value === '') return []
  if (Array.isArray(value)) {
    return value.flatMap((v) => (v == null || v === '' ? [] : [String(v)]))
  }
  return [String(value)]
}

/** Collect all file keys stored in a JSON object across every key. */
const fileKeysFromJsonObject = (obj: unknown): string[] => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.values(obj as Record<string, unknown>).flatMap(fileKeysFromChildValue)
}

interface RegisteredFileChild {
  provider: IUploadProvider
  /** Wrapped key generator (injects JSON key + property), or undefined. */
  uploadPath?: (filename: string) => string
  isArray: boolean
  mimeTypes?: string[]
  maxSize?: number
  /** URL template (or null when the provider issues per-key signed URLs). */
  urlTemplate: string | null
  /**
   * Process-local fallback provider id, used only when the FeatureFn runs
   * without a resource (unit tests). In production a deterministic id derived
   * from `resource.id()` is used instead — see the FeatureFn body.
   */
  fallbackId: string
}

interface PreparedVirtual {
  virtualPath: string
  key: string
  fileChild?: RegisteredFileChild
}

interface PreparedProperty {
  sourceProperty: string
  config: JsonByKeyPropertyConfig
  virtuals: PreparedVirtual[]
  /** Convenience: only set when `child.type === 'file'`. */
  fileProvider?: IUploadProvider
}

/** Build availableValues array in the canonical `{ value, label }[]` shape. */
const normaliseAvailableValues = (
  raw: JsonByKeyChildConfig['availableValues'],
): Array<{ value: string; label: string }> | undefined => {
  if (!raw) return undefined
  return raw.map((v) => (typeof v === 'string' ? { value: v, label: v } : v))
}

// ─── Feature ─────────────────────────────────────────────────────────────────

export function jsonByKeyFeature(options: JsonByKeyFeatureOptions): FeatureFn {
  const separator = options.separator ?? '__'
  const { controlField, keys, defaultKey } = options

  // 1. Prepare per-property virtuals + file-child metadata. Provider
  //    registration is deferred to the FeatureFn so the registry key can be
  //    derived from the resource id (deterministic across replicas).
  const prepared: PreparedProperty[] = []
  for (const [sourceProperty, propConfig] of Object.entries(options.properties)) {
    const isFile = propConfig.child.type === 'file'
    const provider = propConfig.child.upload?.provider
    if (isFile && !provider) {
      throw new Error(
        `[jsonByKeyFeature] property "${sourceProperty}" has type 'file' but no upload.provider`,
      )
    }
    const virtuals: PreparedVirtual[] = keys.map((key) => {
      const virtualPath = `${sourceProperty}${separator}${key}`
      let fileChild: RegisteredFileChild | undefined
      if (isFile && provider) {
        const userPath = propConfig.child.upload?.uploadPath
        // Wrap the user-provided keyer so the JSON key + property name are
        // injected automatically — the underlying registry expects only
        // `(filename) => string`.
        const wrapped = userPath
          ? (filename: string): string =>
            userPath(filename, { key, property: sourceProperty })
          : undefined
        fileChild = {
          provider,
          ...(wrapped ? { uploadPath: wrapped } : {}),
          isArray: propConfig.child.isArray ?? false,
          ...(propConfig.child.upload?.mimeTypes ? { mimeTypes: propConfig.child.upload.mimeTypes } : {}),
          ...(propConfig.child.upload?.maxSize != null ? { maxSize: propConfig.child.upload.maxSize } : {}),
          urlTemplate: provider.urlTemplate?.() ?? null,
          fallbackId: `up_${uuidv7().replace(/-/g, '')}`,
        }
      }
      return fileChild ? { virtualPath, key, fileChild } : { virtualPath, key }
    })
    prepared.push({
      sourceProperty,
      config: propConfig,
      virtuals,
      ...(isFile && provider ? { fileProvider: provider } : {}),
    })
  }

  // 2. Build the FeatureFn that mutates ResourceOptions.
  return (resourceOptions: ResourceOptions, resource?): ResourceOptions => {
    // Register file providers with a DETERMINISTIC id (resource id + source
    // property + JSON key) so every replica resolves the same registry key.
    // Falls back to the process-local uuid when invoked without a resource.
    const providerIdByVirtual = new Map<string, string>()
    for (const { sourceProperty, virtuals } of prepared) {
      for (const virtual of virtuals) {
        const fc = virtual.fileChild
        if (!fc) continue
        const providerId = resource
          ? `up_${resource.id()}_${sourceProperty}_${virtual.key}`
          : fc.fallbackId
        UploadProviderRegistry.register(providerId, {
          provider: fc.provider,
          ...(fc.uploadPath ? { uploadPath: fc.uploadPath } : {}),
          isArray: fc.isArray,
          ...(fc.mimeTypes ? { mimeTypes: fc.mimeTypes } : {}),
          ...(fc.maxSize != null ? { maxSize: fc.maxSize } : {}),
        })
        providerIdByVirtual.set(virtual.virtualPath, providerId)
      }
    }

    const propOverrides: Record<string, Record<string, unknown>> = {}

    for (const { sourceProperty, config, virtuals } of prepared) {
      const existing = resourceOptions.properties?.[sourceProperty] ?? {}
      // Hide the original JSON property — its value is edited via virtuals.
      propOverrides[sourceProperty] = {
        ...existing,
        isVisible: false,
      }

      const basePosition = (existing as { position?: number }).position ?? 1000
      const offset = config.positionOffset ?? 1
      const child = config.child
      const availableValues = normaliseAvailableValues(child.availableValues)
      const childMime = child.upload?.mimeTypes ?? null
      const childMaxSize = child.upload?.maxSize ?? null

      virtuals.forEach((virtual, idx) => {
        const customMarker: JsonByKeyCustomData = {
          jsonByKey: {
            sourceProperty,
            key: virtual.key,
          },
        }
        const fileCustom = virtual.fileChild
          ? {
            uploadProviderId: providerIdByVirtual.get(virtual.virtualPath),
            uploadUrlTemplate: virtual.fileChild.urlTemplate,
            uploadMimeTypes: childMime,
            uploadMaxSize: childMaxSize,
          }
          : {}
        propOverrides[virtual.virtualPath] = {
          type: child.type ?? 'string',
          ...(child.isArray ? { isArray: true } : {}),
          ...(child.reference ? { reference: child.reference } : {}),
          ...(child.isRequired ? { isRequired: true } : {}),
          ...(child.description ? { description: child.description } : {}),
          ...(availableValues ? { availableValues } : {}),
          ...(config.label ? { label: config.label(virtual.key) } : {}),
          position: basePosition + offset + idx * 0.001,
          showWhen: {
            field: controlField,
            equals: virtual.key,
            ...(defaultKey === virtual.key ? { defaultWhenEmpty: true } : {}),
          },
          custom: {
            ...customMarker,
            ...fileCustom,
          },
        }
      })
    }

    // 3. Hooks.

    /**
     * Expand `params[sourceProperty]` (JSON object) into virtual fields on
     * a single record. Mutates `record.params` in place.
     */
    const expandRecord = (record: { params: Record<string, unknown> } | undefined): void => {
      if (!record) return
      for (const { sourceProperty, virtuals } of prepared) {
        const obj = record.params[sourceProperty]
        if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) continue
        const map = obj as Record<string, unknown>
        for (const { virtualPath, key } of virtuals) {
          if (key in map) record.params[virtualPath] = map[key]
        }
      }
    }

    const readHook: AfterHookFn = (response) => {
      const list = response as ListActionResponse
      const single = response as RecordActionResponse
      if (Array.isArray(list.records)) {
        for (const r of list.records) expandRecord(r)
      } else if (single.record) {
        expandRecord(single.record)
      }
      return response
    }

    /**
     * Collapse virtuals back into JSON objects on the payload. Removes the
     * virtual keys so they never reach the underlying handler. Returns a
     * fresh request/payload rather than mutating the caller's object — the
     * runtime threads the returned request downstream.
     */
    const writeBeforeHook: BeforeHookFn = (request) => {
      const payload = request.payload as Record<string, unknown> | undefined
      if (!payload) return request
      const nextPayload: Record<string, unknown> = { ...payload }
      for (const { sourceProperty, virtuals } of prepared) {
        // Start from any existing object in the payload (so callers can
        // pre-populate keys we don't manage), or default to {}.
        let next: Record<string, unknown>
        const incoming = nextPayload[sourceProperty]
        if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
          next = { ...(incoming as Record<string, unknown>) }
        } else {
          next = {}
        }
        let touched = false
        for (const { virtualPath, key } of virtuals) {
          if (virtualPath in nextPayload) {
            const v = nextPayload[virtualPath]
            if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
              delete next[key]
            } else {
              next[key] = v
            }
            delete nextPayload[virtualPath]
            touched = true
          }
        }
        // Only overwrite when we actually saw a virtual — otherwise leave
        // the source property as-is (no-op edits should not zero out JSON).
        if (touched) nextPayload[sourceProperty] = next
      }
      return { ...request, payload: nextPayload }
    }

    /**
     * After save: confirm freshly-uploaded keys, and delete files whose
     * key was replaced or removed (per JSON key, per source property).
     */
    const editAfterHook: AfterHookFn = async (response, _request, context) => {
      const ctx = context as { record?: { get(path: string): unknown } } | undefined
      const single = response as RecordActionResponse
      const newParams = single.record?.params ?? {}
      const newKeys: string[] = []
      const deletions: Array<Promise<void>> = []
      for (const { sourceProperty, virtuals, fileProvider } of prepared) {
        const newObj = newParams[sourceProperty]
        const newFileKeys = fileKeysFromJsonObject(newObj)
        newKeys.push(...newFileKeys)
        if (!fileProvider) continue
        const oldObj = ctx?.record?.get(sourceProperty)
        if (!oldObj || typeof oldObj !== 'object' || Array.isArray(oldObj)) continue
        const newSet = new Set(newFileKeys)
        for (const { key } of virtuals) {
          const oldKeys = fileKeysFromChildValue((oldObj as Record<string, unknown>)[key])
          for (const k of oldKeys) {
            if (!newSet.has(k)) {
              deletions.push(
                fileProvider.delete(k).catch(() => {
                  // Best-effort: never fail the save because of a stale file.
                }),
              )
            }
          }
        }
      }
      if (newKeys.length > 0) PendingUploadsRegistry.confirm(newKeys)
      if (deletions.length > 0) await Promise.all(deletions)
      return response
    }

    /**
     * After create: confirm freshly-uploaded keys so the orphan sweeper
     * leaves them alone. No diff is needed — there is no previous state.
     */
    const newAfterHook: AfterHookFn = (response) => {
      const single = response as RecordActionResponse
      const newParams = single.record?.params ?? {}
      const newKeys: string[] = []
      for (const { sourceProperty } of prepared) {
        newKeys.push(...fileKeysFromJsonObject(newParams[sourceProperty]))
      }
      if (newKeys.length > 0) PendingUploadsRegistry.confirm(newKeys)
      return response
    }

    /** After delete: drop every file referenced by the JSON columns. */
    const deleteAfterHook: AfterHookFn = async (response, _request, context) => {
      const ctx = context as { record?: { get(path: string): unknown } } | undefined
      const deletions: Array<Promise<void>> = []
      for (const { sourceProperty, fileProvider } of prepared) {
        if (!fileProvider) continue
        const obj = ctx?.record?.get(sourceProperty)
        for (const k of fileKeysFromJsonObject(obj)) {
          deletions.push(
            fileProvider.delete(k).catch(() => {
              // Non-fatal — the row is already gone.
            }),
          )
        }
      }
      if (deletions.length > 0) await Promise.all(deletions)
      return response
    }

    const existingActions = (resourceOptions.actions ?? {}) as Record<
      string,
      Record<string, unknown>
    >
    const hasAnyFileChild = prepared.some((p) => p.fileProvider)

    const actionOverrides: Record<string, Record<string, unknown>> = {
      list: {
        ...existingActions.list,
        after: appendAfterHook(existingActions.list, readHook),
      },
      show: {
        ...existingActions.show,
        after: appendAfterHook(existingActions.show, readHook),
      },
      new: {
        ...existingActions.new,
        before: appendBeforeHook(existingActions.new, writeBeforeHook),
        after: appendAfterHook(existingActions.new, async (resp, req, ctx) => {
          const out = await Promise.resolve(readHook(resp, req, ctx))
          return newAfterHook(out, req, ctx)
        }),
      },
      edit: {
        ...existingActions.edit,
        before: appendBeforeHook(existingActions.edit, writeBeforeHook),
        after: appendAfterHook(existingActions.edit, async (resp, req, ctx) => {
          const out = await Promise.resolve(readHook(resp, req, ctx))
          return editAfterHook(out, req, ctx)
        }),
      },
    }
    if (hasAnyFileChild) {
      actionOverrides.delete = {
        ...existingActions.delete,
        after: appendAfterHook(existingActions.delete, deleteAfterHook),
      }
    }

    return {
      ...resourceOptions,
      properties: {
        ...resourceOptions.properties,
        ...propOverrides,
      } as ResourceOptions['properties'],
      actions: {
        ...existingActions,
        ...actionOverrides,
      } as ResourceOptions['actions'],
    }
  }
}
