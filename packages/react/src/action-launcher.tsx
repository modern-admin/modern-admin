// Launch strategy for custom actions.
//
// An action with no `component` is a one-click operation: the menu fires it
// straight at the API. An action *with* a `component` renders its own UI
// first — a page by default (deep-linkable, room for a real form), or a
// modal when the action opts in with `custom.showAs: 'dialog'`.
//
// Both presentations render the same `<ActionComponentHost/>`, so the only
// thing that varies here is the container.

import * as React from 'react'
import { DialogHeader, DialogTitle } from '@modern-admin/ui'
import { useDialogs } from './dialogs.js'
import { useNavigate } from './router.js'
import { getActionLabel } from './action-menu.js'
import { ActionComponentHost } from './components/action-component-host.js'
import type { ActionDescriptor } from './types.js'
import { useI18n } from './i18n.js'

/** True when the action renders its own UI instead of firing on click. */
export const hasActionComponent = (action: ActionDescriptor): boolean =>
  typeof action.component === 'string' && action.component.length > 0

export interface LaunchActionOptions {
  /** Record id for `actionType: 'record'` actions. */
  recordId?: string
  /** Selection for `actionType: 'bulk'` actions. */
  recordIds?: string[]
  /** Fired after each successful invoke — only observable in dialog mode,
   *  since navigating away unmounts the caller. */
  onSuccess?(): void
}

/**
 * Opens a custom action's component. Callers should gate on
 * `hasActionComponent(action)` first and fall back to their direct-invoke
 * path when it returns false.
 */
export type OpenActionComponent = (
  action: ActionDescriptor,
  options?: LaunchActionOptions,
) => void

export const useActionLauncher = (resourceId: string): OpenActionComponent => {
  const dialogs = useDialogs()
  const navigate = useNavigate()
  const { t } = useI18n()

  return React.useCallback(
    (action: ActionDescriptor, options: LaunchActionOptions = {}) => {
      const { recordId, recordIds, onSuccess } = options
      if (action.custom?.showAs === 'dialog') {
        void dialogs.open({
          className: action.component === 'modern-admin:media-generation' ? 'sm:max-w-4xl' : 'sm:max-w-2xl',
          render: ({ close }) => (
            <>
              <DialogHeader>
                <DialogTitle>{getActionLabel(action, t)}</DialogTitle>
              </DialogHeader>
              <ActionComponentHost
                resourceId={resourceId}
                actionName={action.name}
                {...(recordId !== undefined ? { recordId } : {})}
                {...(recordIds !== undefined ? { recordIds } : {})}
                {...(onSuccess !== undefined ? { onSuccess } : {})}
                onClose={() => close()}
              />
            </>
          ),
        })
        return
      }
      navigate({
        name: 'action',
        resourceId,
        actionName: action.name,
        ...(recordId !== undefined ? { recordId } : {}),
        ...(recordIds !== undefined ? { recordIds } : {}),
      })
    },
    [dialogs, navigate, resourceId, t],
  )
}
