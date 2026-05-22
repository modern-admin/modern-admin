import { listAction } from './list.js'
import { showAction } from './show.js'
import { newAction } from './new.js'
import { editAction } from './edit.js'
import { deleteAction } from './delete.js'
import { bulkDeleteAction } from './bulk-delete.js'
import { searchAction } from './search.js'
import { valuesAction } from './values.js'

import type { Action, ActionResponse, BuiltInActionName } from '../action.js'

// Built-in actions are stored covariantly: each value is an Action that
// produces *some* ActionResponse subtype. Consumers narrow at use-site.
export const BUILT_IN_ACTIONS: Readonly<
  Record<BuiltInActionName, Action<ActionResponse>>
> = Object.freeze({
  list: listAction as unknown as Action<ActionResponse>,
  show: showAction as unknown as Action<ActionResponse>,
  new: newAction as unknown as Action<ActionResponse>,
  edit: editAction as unknown as Action<ActionResponse>,
  delete: deleteAction as unknown as Action<ActionResponse>,
  bulkDelete: bulkDeleteAction as unknown as Action<ActionResponse>,
  search: searchAction as unknown as Action<ActionResponse>,
  values: valuesAction as unknown as Action<ActionResponse>,
})

export {
  listAction,
  showAction,
  newAction,
  editAction,
  deleteAction,
  bulkDeleteAction,
  searchAction,
  valuesAction,
}
