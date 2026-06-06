import { RecordNotFoundError } from '../../errors'
import { recordTag } from '../cache-runtime.js'
import { resolveResourceCacheConfig } from '../../decorators/cache-config.js'
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
  const { resource, cacheRuntime } = context
  const id = request.params.recordId
  if (!id) throw new Error('show action requires recordId')

  const cacheKey = `record:${resource.id()}:${id}`
  const cfg = resolveResourceCacheConfig(resource.decorate().options, 'show')

  return cacheRuntime.read<RecordActionResponse>(
    cacheKey,
    {
      enabled: cfg.enabled,
      ttl: cfg.ttl,
      // Show responses are scoped to a single record — mutating any
      // other record of the same resource does NOT invalidate this
      // entry (the `list:<resourceId>` tag is enough for list-side
      // invalidation).
      tags: [recordTag(resource.id(), id)],
    },
    async () => {
      const record = await resource.findOne(id)
      if (!record) throw new RecordNotFoundError(id, resource.id())
      return { record: record.toJSON() }
    },
  )
}

export const showAction: Action<RecordActionResponse> = {
  name: 'show',
  actionType: 'record',
  isAccessible: true,
  isVisible: true,
  component: 'Show',
  handler,
}
