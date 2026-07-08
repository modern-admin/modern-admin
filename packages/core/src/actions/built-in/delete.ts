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
  const { resource } = context
  const id = request.params.recordId
  if (!id) throw new Error('delete action requires recordId')

  const record = await resource.findOne(id)
  if (!record) throw new RecordNotFoundError(id, resource.id())

  await resource.delete(id)
  // Cache invalidation happens centrally in `ModernAdmin.invoke()` after
  // all after-hooks have run — see `invalidateMutationCaches`.
  return {
    record: record.toJSON(),
    notice: { message: 'Record deleted', type: 'success' },
    redirectUrl: `/resources/${resource.id()}`,
  }
}

export const deleteAction: Action<RecordActionResponse> = {
  name: 'delete',
  actionType: 'record',
  isAccessible: true,
  isVisible: true,
  guard: 'confirmDelete',
  // No own view — handler runs immediately on click.
  component: null,
  handler,
}
