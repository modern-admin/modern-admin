import { listTag } from '../cache-runtime.js'
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
  if (request.method === 'get') {
    // Render form: return a blank record skeleton.
    return { record: resource.build({}).toJSON() }
  }
  const params = (request.payload ?? {}) as Record<string, unknown>
  const created = await resource.create(params)
  // A new row only affects list/search results — no existing `show`
  // response can be made stale by an INSERT, so the per-record tags
  // are left alone.
  await cache.invalidateTag(listTag(resource.id()))
  const record = resource.build(created)
  return {
    record: record.toJSON(),
    notice: { message: 'Record created', type: 'success' },
  }
}

export const newAction: Action<RecordActionResponse> = {
  name: 'new',
  actionType: 'resource',
  isAccessible: true,
  isVisible: true,
  component: 'New',
  handler,
}
