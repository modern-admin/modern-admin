import { RecordNotFoundError } from '../../errors'
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
  await cache.invalidateTag([`resource:${resource.id()}`, `record:${resource.id()}:${id}`])
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
