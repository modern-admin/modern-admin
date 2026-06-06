import { listTag, recordTag } from '../cache-runtime.js'
import type {
  Action,
  ActionContext,
  ActionRequest,
  BulkActionResponse,
} from '../action.js'

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<BulkActionResponse> => {
  const { resource, cache } = context
  const idsRaw = request.params.recordIds ?? ''
  const ids = idsRaw.split(',').filter(Boolean)
  if (ids.length === 0) throw new Error('bulkDelete requires recordIds')

  const records = await resource.findMany(ids)
  await resource.transaction(async () => {
    for (const id of ids) {
      await resource.delete(id)
    }
  })
  await cache.invalidateTag([
    listTag(resource.id()),
    ...ids.map((id) => recordTag(resource.id(), id)),
  ])
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
