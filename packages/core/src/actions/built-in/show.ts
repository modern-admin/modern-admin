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
  if (!id) throw new Error('show action requires recordId')

  const cacheKey = `record:${resource.id()}:${id}`
  const cached = await cache.get<RecordActionResponse>(cacheKey)
  if (cached) return cached

  const record = await resource.findOne(id)
  if (!record) {
    throw new RecordNotFoundError(id, resource.id())
  }
  const response: RecordActionResponse = { record: record.toJSON() }
  await cache.set(cacheKey, response, {
    ttl: 60,
    tags: [`resource:${resource.id()}`, `record:${resource.id()}:${id}`],
  })
  return response
}

export const showAction: Action<RecordActionResponse> = {
  name: 'show',
  actionType: 'record',
  isAccessible: true,
  isVisible: true,
  component: 'Show',
  handler,
}
