// Shared `notice` → toast plumbing for custom-action invocations.
//
// Every surface that fires a custom action (list toolbar, row menu, bulk
// toolbar, show page, action component host) gets back the same
// `CustomActionResponse` shape, so the mapping lives here rather than being
// re-derived at each call site.

import type { useNotify } from './notify.js'
import type { CustomActionResponse } from './types.js'

type NotifyApi = ReturnType<typeof useNotify>

/** Show a custom action's `notice` as the matching toast. Unrecognised
 *  types fall back to a success toast; a missing notice is a no-op. */
export function showActionNotice(notify: NotifyApi, notice: CustomActionResponse['notice']): void {
  if (!notice) return
  const type =
    notice.type === 'error'
      ? 'error'
      : notice.type === 'warning'
        ? 'warning'
        : notice.type === 'info'
          ? 'info'
          : 'success'
  notify[type]({ message: notice.message })
}
