import type {
  Action,
  ActionContext,
  ActionRequest,
  After,
  Before,
  BulkActionResponse,
  RecordActionResponse,
} from '../action.js'

const toArray = <T>(hook: T | T[] | undefined): T[] =>
  hook === undefined ? [] : Array.isArray(hook) ? hook : [hook]

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<BulkActionResponse> => {
  const { resource } = context
  const idsRaw = request.params.recordIds ?? ''
  const ids = idsRaw.split(',').filter(Boolean)
  if (ids.length === 0) throw new Error('bulkDelete requires recordIds')

  const records = await resource.findMany(ids)
  const recordById = new Map(records.map((r) => [String(r.id()), r]))

  // Route every record through the single-delete hook chain so cleanup
  // registered on `delete` — feature hooks (m2m junction rows, uploaded
  // files, history snapshots) and user hooks alike — fires for bulk
  // deletions too. The `delete` handler itself is not reused: the row is
  // removed here so all deletions share one transaction. DB writes made
  // by hooks join it via the adapters' ambient tx client; non-DB side
  // effects (file removal) remain best-effort, as on single delete.
  const deleteAction = resource.decorate().getAction('delete')?.merged as
    | Action<RecordActionResponse>
    | undefined
  const beforeHooks = toArray<Before>(deleteAction?.before)
  const afterHooks = toArray<After<RecordActionResponse>>(deleteAction?.after)

  // Hooks written for the record-action pipeline read `context.record`
  // (upload cleanup, history snapshots) — point it at the current record
  // for each iteration and restore the original value afterwards.
  const outerRecord = context.record
  try {
    await resource.transaction(async () => {
      for (const id of ids) {
        const record = recordById.get(id)
        if (!record) {
          // Unknown id: still attempt the delete (the adapter surfaces
          // not-found) but skip hooks — there is no state to clean up.
          await resource.delete(id)
          continue
        }
        context.record = record
        let req: ActionRequest = {
          ...request,
          method: 'delete',
          params: { ...request.params, action: 'delete', recordId: id },
        }
        for (const fn of beforeHooks) req = await fn(req, context)
        await resource.delete(id)
        let res: RecordActionResponse = {
          record: record.toJSON(),
          notice: { message: 'Record deleted', type: 'success' },
          redirectUrl: `/resources/${resource.id()}`,
        }
        for (const fn of afterHooks) res = await fn(res, req, context)
      }
    })
  } finally {
    if (outerRecord === undefined) delete context.record
    else context.record = outerRecord
  }

  // Cache invalidation happens centrally in `ModernAdmin.invoke()` after
  // all after-hooks have run — see `invalidateMutationCaches`.
  return {
    records: records.map((r) => r.toJSON()),
    notice: { message: `Deleted ${ids.length} record(s)`, type: 'success' },
    redirectUrl: `/resources/${resource.id()}`,
  }
}

export const bulkDeleteAction: Action<BulkActionResponse> = {
  name: 'bulkDelete',
  actionType: 'bulk',
  isAccessible: true,
  isVisible: true,
  guard: 'confirmBulkDelete',
  component: null,
  handler,
}
