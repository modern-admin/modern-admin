import type { ActionDescriptor } from './types.js'
import type { ConfirmOptions, DialogsApi } from './dialogs.js'

/**
 * If `action.guard` is set, shows a confirm dialog with that text as the
 * description before proceeding. Returns `true` if the action should run
 * (no guard configured, or user clicked Confirm), `false` if cancelled.
 *
 * Usage at an invoke call-site:
 *   if (!await confirmGuard(action, dialogs)) return
 *   invoke.mutate(...)
 */
export async function confirmGuard(
  action: Pick<ActionDescriptor, 'guard'>,
  dialogs: Pick<DialogsApi, 'confirm'>,
  extra?: Omit<ConfirmOptions, 'description'>,
): Promise<boolean> {
  if (!action.guard) return true
  return dialogs.confirm({ description: action.guard, ...extra })
}
