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
  const { resource } = context
  if (request.method === 'get') {
    // Render form: return a blank record skeleton.
    return { record: resource.build({}).toJSON() }
  }
  const params = (request.payload ?? {}) as Record<string, unknown>
  const created = await resource.create(params)
  // Cache invalidation happens centrally in `ModernAdmin.invoke()` after
  // every after-hook has run (see `invalidateMutationCaches`) — the
  // handler-level invalidation used to race with hooks that write related
  // rows (m2m diffs) and leave repopulated stale entries behind.
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
