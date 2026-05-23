/**
 * `m2mFeature` — local resource feature that adds a many-to-many relation
 * backed by a real junction table.
 *
 * Architecture:
 *
 *   Parent (e.g. posts) ──┐
 *                         │   localKey
 *                         ▼
 *                   Junction (e.g. postTags + extra fields)
 *                         ▲
 *                         │   foreignKey
 *   Reference (e.g. tags)─┘
 *
 * The junction is itself a regular `BaseResource` registered with the
 * admin. This feature wires three pieces of behaviour onto the parent:
 *
 *   1. A virtual property of `type: 'm2m'` that the UI/transports render
 *      as a multi-select editor (with extra-field rows when extras are
 *      configured).
 *   2. `after` hooks on `list`/`show`/`new`/`edit` that hydrate the
 *      parent's record params from junction rows on read, and persist
 *      junction-row diffs (insert / update / delete) on write.
 *   3. A `delete.after` hook that cleans up junction rows for the
 *      removed parent (gated by `cascadeDelete`).
 *
 * The implementation is **adapter-agnostic** — it relies only on
 * `BaseResource`'s public API (`find`, `findOne`, `create`, `update`,
 * `delete`, `transaction`).
 */

import {
  Filter,
  type ActionRequest,
  type ActionResponse,
  type BaseRecord,
  type BaseResource,
  type FeatureFn,
  type ListActionResponse,
  type ModernAdmin,
  type ParamsType,
  type RecordActionResponse,
  type ResourceOptions,
} from '@modern-admin/core'
import { m2mRelationZ, type M2MCustomData, type M2MItem, type M2MRelation, type M2MRelationInput } from './types.js'

// ─── Hook chaining (mirrors uploadFeature / actionLoggingFeature) ────────────

type HookFn = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => ActionResponse | Promise<ActionResponse>

const toArray = (hook: unknown): HookFn[] => {
  if (!hook) return []
  return Array.isArray(hook) ? (hook as HookFn[]) : [hook as HookFn]
}

const appendAfter = (
  existing: Record<string, unknown> | undefined,
  newHook: HookFn,
): HookFn[] => [...toArray(existing?.after), newHook]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ctxAdmin = (context: unknown): ModernAdmin =>
  (context as { admin: ModernAdmin }).admin

const junctionRowsForParent = async (
  junction: BaseResource,
  localKey: string,
  parentId: string,
): Promise<BaseRecord[]> => {
  // Use Filter so adapter-specific WHERE clauses kick in (Prisma, Drizzle).
  // Post-filter the result in JS so adapters with looser semantics
  // (in-memory's substring match) still produce correct output.
  const filter = new Filter({ [localKey]: parentId }, junction)
  const rows = await junction.find(filter, { limit: 100_000 })
  return rows.filter((r) => String(r.params[localKey]) === String(parentId))
}

const buildItem = (
  junctionRow: BaseRecord,
  foreignKey: string,
  extraFields: string[],
): M2MItem => {
  const item: M2MItem = { id: String(junctionRow.params[foreignKey] ?? '') }
  for (const f of extraFields) {
    if (f in junctionRow.params) item[f] = junctionRow.params[f]
  }
  return item
}

const parsePayloadItems = (
  payload: Record<string, unknown> | undefined,
  property: string,
): M2MItem[] | undefined => {
  if (!payload) return undefined
  const raw = (payload as Record<string, unknown>)[property]
  if (raw !== undefined) {
    if (raw === null) return []
    if (Array.isArray(raw)) return normaliseItems(raw)
    return undefined
  }
  // Form encodings flatten to e.g. `tags.0.id`, `tags.0.addedAt`.
  // Reassemble the array directly without depending on a generic
  // unflatten helper (`Record<index, Record<field, value>>` is enough).
  const prefix = `${property}.`
  const indices = new Map<number, Record<string, unknown>>()
  let any = false
  for (const key of Object.keys(payload)) {
    if (!key.startsWith(prefix)) continue
    any = true
    const tail = key.slice(prefix.length)
    const dot = tail.indexOf('.')
    if (dot < 0) continue
    const idxStr = tail.slice(0, dot)
    const field = tail.slice(dot + 1)
    if (!/^\d+$/.test(idxStr) || !field) continue
    const idx = Number(idxStr)
    const bucket = indices.get(idx) ?? {}
    bucket[field] = (payload as Record<string, unknown>)[key]
    indices.set(idx, bucket)
  }
  if (!any) return undefined
  const ordered = [...indices.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
  return normaliseItems(ordered)
}

const normaliseItems = (raw: unknown[]): M2MItem[] => {
  const out: M2MItem[] = []
  for (const entry of raw) {
    if (entry === null || entry === undefined) continue
    if (typeof entry === 'string' || typeof entry === 'number') {
      out.push({ id: String(entry) })
      continue
    }
    if (typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      const id = obj.id ?? obj.value
      if (id === undefined || id === null || id === '') continue
      const item: M2MItem = { id: String(id) }
      for (const k of Object.keys(obj)) {
        if (k === 'id' || k === 'value') continue
        item[k] = obj[k]
      }
      out.push(item)
    }
  }
  return out
}

const applyDiff = async (
  junction: BaseResource,
  parentId: string,
  localKey: string,
  foreignKey: string,
  extraFields: string[],
  incoming: M2MItem[],
): Promise<void> => {
  const existing = await junctionRowsForParent(junction, localKey, parentId)
  const existingByForeign = new Map<string, BaseRecord>()
  for (const row of existing) {
    existingByForeign.set(String(row.params[foreignKey]), row)
  }
  const incomingForeignIds = new Set(incoming.map((i) => i.id))

  // Delete rows whose foreign-key is no longer in incoming.
  for (const [foreignId, row] of existingByForeign.entries()) {
    if (!incomingForeignIds.has(foreignId)) {
      await junction.delete(row.id())
    }
  }

  // Deduplicate incoming by foreign-id so two payload entries with the same
  // `id` don't insert two junction rows. When a duplicate appears later in
  // the list its extras override the earlier copy — last-write-wins.
  const incomingByForeign = new Map<string, M2MItem>()
  for (const item of incoming) {
    const prev = incomingByForeign.get(item.id)
    incomingByForeign.set(item.id, prev ? { ...prev, ...item } : item)
  }

  // Insert new + update extras for existing.
  for (const item of incomingByForeign.values()) {
    const row = existingByForeign.get(item.id)
    if (row) {
      if (extraFields.length > 0) {
        const updates: ParamsType = {}
        for (const f of extraFields) {
          if (f in item) updates[f] = item[f]
        }
        if (Object.keys(updates).length > 0) {
          await junction.update(row.id(), updates)
        }
      }
    } else {
      const data: ParamsType = {
        [localKey]: parentId,
        [foreignKey]: item.id,
      }
      for (const f of extraFields) {
        if (f in item) data[f] = item[f]
      }
      await junction.create(data)
    }
  }
}

const hydrateRecordParams = async (
  rec: { id: string; params: Record<string, unknown>; populated: Record<string, unknown> },
  admin: ModernAdmin,
  relation: M2MRelation,
): Promise<void> => {
  const { property, through, localKey, foreignKey, reference, extraFields = [] } = relation
  let junction: BaseResource
  let referenceResource: BaseResource
  try {
    junction = admin.findResource(through)
    referenceResource = admin.findResource(reference)
  } catch {
    rec.params[property] = []
    return
  }
  const rows = await junctionRowsForParent(junction, localKey, rec.id)
  const items = rows.map((r) => buildItem(r, foreignKey, extraFields))
  rec.params[property] = items
  if (items.length === 0) return
  const refRecords = await referenceResource.findMany(items.map((i) => i.id))
  for (const ref of refRecords) {
    rec.populated[`${property}.${ref.id()}`] = ref.toJSON()
  }
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const buildReadHook = (relation: M2MRelation): HookFn =>
  async (response, request, context) => {
    const admin = ctxAdmin(context)
    const list = response as ListActionResponse
    const single = response as RecordActionResponse
    if (Array.isArray(list.records)) {
      await Promise.all(
        list.records.map((rec) => hydrateRecordParams(rec, admin, relation)),
      )
    } else if (single.record) {
      await hydrateRecordParams(single.record, admin, relation)
    }
    return response
  }

const buildWriteHook = (relation: M2MRelation): HookFn =>
  async (response, request, context) => {
    // Both `new` (POST) and `edit` (PATCH) need diff application; only the
    // GET-rendered form variants and DELETE should be ignored here.
    if (request.method !== 'post' && request.method !== 'patch') return response
    const single = response as RecordActionResponse
    if (!single.record) return response
    const incoming = parsePayloadItems(request.payload, relation.property)
    if (incoming === undefined) {
      // Property absent from payload → no change. Still hydrate so the
      // response reflects the persisted state.
      await hydrateRecordParams(single.record, ctxAdmin(context), relation)
      return response
    }
    const admin = ctxAdmin(context)
    let junction: BaseResource
    try {
      junction = admin.findResource(relation.through)
    } catch {
      return response
    }
    const parentResource = (context as { resource: BaseResource }).resource
    await parentResource.transaction(() =>
      applyDiff(
        junction,
        single.record.id,
        relation.localKey,
        relation.foreignKey,
        relation.extraFields ?? [],
        incoming,
      ),
    )
    await hydrateRecordParams(single.record, admin, relation)
    return response
  }

const buildDeleteHook = (relation: M2MRelation): HookFn =>
  async (response, request, context) => {
    const id = request.params.recordId
    if (!id) return response
    const admin = ctxAdmin(context)
    let junction: BaseResource
    try {
      junction = admin.findResource(relation.through)
    } catch {
      return response
    }
    const rows = await junctionRowsForParent(junction, relation.localKey, String(id))
    await Promise.all(rows.map((r) => junction.delete(r.id())))
    return response
  }

// ─── Feature ─────────────────────────────────────────────────────────────────

/**
 * Build a `FeatureFn` for a single many-to-many relation. Compose multiple
 * calls on the same resource to expose multiple m2m properties.
 */
export const m2mFeature = (input: M2MRelationInput): FeatureFn => {
  const relation = m2mRelationZ.parse(input)
  const { property, through, localKey, foreignKey, reference, extraFields = [] } = relation

  const customData: M2MCustomData = {
    m2m: {
      reference,
      through,
      localKey,
      foreignKey,
      extraFields,
      ...(relation.picker ? { picker: relation.picker } : {}),
    },
  }

  const readHook = buildReadHook(relation)
  const writeHook = buildWriteHook(relation)
  const deleteHook = relation.cascadeDelete ? buildDeleteHook(relation) : null

  return (options: ResourceOptions): ResourceOptions => {
    const existingActions = (options.actions ?? {}) as Record<string, Record<string, unknown>>
    const existingProperties = options.properties ?? {}

    const propertyOverride = {
      ...(existingProperties[property] ?? {}),
      type: 'm2m' as const,
      reference,
      isArray: true,
      ...(relation.label ? { label: relation.label } : {}),
      custom: {
        ...((existingProperties[property]?.custom ?? {}) as Record<string, unknown>),
        ...customData,
      },
    }

    const overrides: Record<string, Record<string, unknown>> = {
      list: { ...existingActions.list, after: appendAfter(existingActions.list, readHook) },
      show: { ...existingActions.show, after: appendAfter(existingActions.show, readHook) },
      new: { ...existingActions.new, after: appendAfter(existingActions.new, writeHook) },
      edit: { ...existingActions.edit, after: appendAfter(existingActions.edit, writeHook) },
    }
    if (deleteHook) {
      overrides.delete = {
        ...existingActions.delete,
        after: appendAfter(existingActions.delete, deleteHook),
      }
    }

    return {
      ...options,
      properties: {
        ...existingProperties,
        [property]: propertyOverride,
      },
      actions: {
        ...existingActions,
        ...overrides,
      } as ResourceOptions['actions'],
    }
  }
}
