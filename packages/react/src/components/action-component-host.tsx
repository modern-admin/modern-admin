// Runtime host for a custom action's UI component.
//
// An action declaring `component: 'MyForm'` (see `Action.component` in
// @modern-admin/core) does not fire on click. Instead the operator lands
// here: the named component is looked up on the ComponentLoader and rendered
// with everything it needs to run the action — the priming `GET` response,
// the record for record-scoped actions, and an `invoke(payload)` callback
// that POSTs and surfaces the resulting `notice`.
//
// The host is presentation-neutral so the same code backs both surfaces:
// the full `/resources/:id/actions/:name` page and the modal opened for
// actions declaring `custom.showAs: 'dialog'`.

import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import {
  useActionData,
  useInvokeBulkAction,
  useInvokeRecordAction,
  useInvokeResourceAction,
  useRecord,
  useResource,
} from '../hooks.js'
import { useAdminContext } from '../provider.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { showActionNotice } from '../action-notice.js'
import type { ActionComponentProps, CustomActionResponse } from '../types.js'

export interface ActionComponentHostProps {
  resourceId: string
  actionName: string
  /** Set for record-scoped actions (`actionType: 'record'`). */
  recordId?: string
  /** Set for bulk-scoped actions (`actionType: 'bulk'`) — the selection. */
  recordIds?: string[]
  /** Dismiss the action — pop the page or close the dialog. */
  onClose(): void
  /** Fired after each successful `invoke()`. The bulk toolbar uses it to
   *  clear its selection; in page mode the list has already unmounted, so
   *  only dialog callers see it. */
  onSuccess?(): void
}

function HostError({ title, hint }: { title: string; hint?: string }): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 dark:bg-destructive/15"
    >
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-destructive">{title}</p>
        {hint && <p className="text-destructive/90">{hint}</p>}
      </div>
    </div>
  )
}

export function ActionComponentHost({
  resourceId,
  actionName,
  recordId,
  recordIds,
  onClose,
  onSuccess,
}: ActionComponentHostProps): React.ReactElement {
  const resource = useResource(resourceId)
  const { components } = useAdminContext()
  const { t } = useI18n()
  const notify = useNotify()

  const action = resource?.actions?.find((a) => a.name === actionName)
  const componentName = action?.component ?? null
  const Custom = componentName ? components?.get(componentName) : undefined

  // Only prime once we know the action exists and its component resolved —
  // otherwise the page renders an error and the handler must not run.
  const primed = useActionData(resourceId, actionName, {
    ...(recordId !== undefined ? { recordId } : {}),
    ...(recordIds !== undefined ? { recordIds } : {}),
    enabled: Boolean(action) && Boolean(Custom),
  })
  const record = useRecord(resourceId, recordId)
  const invokeRecord = useInvokeRecordAction(resourceId)
  const invokeResource = useInvokeResourceAction(resourceId)
  const invokeBulk = useInvokeBulkAction(resourceId)

  const submitting = invokeRecord.isPending || invokeResource.isPending || invokeBulk.isPending
  const invoke = React.useCallback(
    async (payload: Record<string, unknown> = {}): Promise<CustomActionResponse> => {
      // Scope is decided by what the host was mounted with, not by the
      // action's declared `actionType` — a mismatch would build a request
      // the server can't route.
      const res = recordId
        ? await invokeRecord.mutateAsync({ recordId, actionName, payload })
        : recordIds?.length
          ? await invokeBulk.mutateAsync({ actionName, ids: recordIds, payload })
          : await invokeResource.mutateAsync({ actionName, payload })
      showActionNotice(notify, res.notice)
      onSuccess?.()
      return res
    },
    [recordId, recordIds, actionName, invokeRecord, invokeBulk, invokeResource, notify, onSuccess],
  )

  if (!resource) return <p className="text-muted-foreground">{t('common:loading')}</p>
  if (!action) {
    return <HostError title={t('action:notFound', { action: actionName })} />
  }
  if (!componentName || !Custom) {
    return (
      <HostError
        title={t('action:componentMissing', { component: componentName ?? actionName })}
        hint={t('action:componentMissingHint')}
      />
    )
  }
  if (primed.isError) {
    return (
      <HostError
        title={t('action:loadFailed')}
        hint={primed.error instanceof Error ? primed.error.message : undefined}
      />
    )
  }

  const props: ActionComponentProps = {
    action,
    resource,
    resourceId,
    ...(recordId !== undefined ? { recordId } : {}),
    ...(recordIds !== undefined ? { recordIds } : {}),
    ...(record.data?.record ? { record: record.data.record } : {}),
    ...(primed.data?.records ? { records: primed.data.records } : {}),
    ...(primed.data ? { data: primed.data } : {}),
    loading: primed.isLoading || (Boolean(recordId) && record.isLoading),
    invoke,
    submitting,
    close: onClose,
  }
  return <Custom {...props} />
}
