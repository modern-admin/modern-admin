import { RecordNotFoundError } from '../../errors'
import { listTag, recordTag } from '../cache-runtime.js'
import type {
  Action,
  ActionContext,
  ActionRequest,
  RecordActionResponse,
} from '../action.js'

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<RecordActionResponse> => {
  const { resource, cache } = context
  const id = request.params.recordId
  if (!id) throw new Error('edit action requires recordId')

  if (request.method === 'get') {
    const record = await resource.findOne(id)
    if (!record) throw new RecordNotFoundError(id, resource.id())
    return { record: record.toJSON() }
  }

  const payload = (request.payload ?? {}) as Record<string, unknown>
  const updated = await resource.update(id, payload)
  // The mutated row may shift in list order, change values, and the
  // canonical show response is stale. Drop both tags but leave other
  // records' show entries intact.
  await cache.invalidateTag([listTag(resource.id()), recordTag(resource.id(), id)])
  return {
    record: resource.build(updated).toJSON(),
    notice: { message: 'Record updated', type: 'success' },
  }
}

export const editAction: Action<RecordActionResponse> = {
  name: 'edit',
  actionType: 'record',
  isAccessible: true,
  isVisible: true,
  component: 'Edit',
  handler,
}
