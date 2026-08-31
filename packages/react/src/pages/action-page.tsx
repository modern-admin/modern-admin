// Full-page surface for a custom action that declares a `component`.
//
// Routed at `/resources/:resourceId/actions/:actionName` (resource-scoped)
// and `/resources/:resourceId/:recordId/actions/:actionName` (record-scoped).
// The page owns the chrome — breadcrumbs, title, back button — and delegates
// the action itself to `<ActionComponentHost/>`, which is also what the
// dialog presentation (`custom.showAs: 'dialog'`) renders.

import * as React from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@modern-admin/ui'
import { ArrowLeft } from 'lucide-react'
import { useRecord, useResource } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { useNavigate } from '../router.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import { getActionLabel } from '../action-menu.js'
import { ActionComponentHost } from '../components/action-component-host.js'

export interface ResourceActionPageProps {
  resourceId: string
  actionName: string
  /** Present for record-scoped actions. */
  recordId?: string
  /** Present for bulk-scoped actions — read from `?recordIds=a,b,c`. */
  recordIds?: string[]
}

export function ResourceActionPage({
  resourceId,
  actionName,
  recordId,
  recordIds,
}: ResourceActionPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const record = useRecord(resourceId, recordId)
  const { t } = useI18n()
  const navigate = useNavigate()

  const action = resource?.actions?.find((a) => a.name === actionName)
  const title = action ? getActionLabel(action) : actionName

  // Dismissing returns to wherever the action was launched from: the record
  // for record-scoped actions, the list for resource-scoped ones.
  const close = React.useCallback(() => {
    if (recordId) navigate({ name: 'show', resourceId, recordId })
    else navigate({ name: 'list', resourceId })
  }, [navigate, resourceId, recordId])

  const recordLabel = record.data?.record?.title || recordId

  return (
    <div className="space-y-2 sm:space-y-4">
      <PageBreadcrumbs
        items={[
          homeCrumb(t('common:home')),
          { label: resource?.name ?? resourceId, to: { name: 'list', resourceId } },
          ...(recordId
            ? [
                {
                  label: recordLabel ?? recordId,
                  to: { name: 'show' as const, resourceId, recordId },
                },
              ]
            : []),
          { label: title },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="truncate">{title}</CardTitle>
          <Button variant="outline" size="sm" onClick={close} className="shrink-0">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">{t('common:back')}</span>
          </Button>
        </CardHeader>
        <CardContent>
          <ActionComponentHost
            resourceId={resourceId}
            actionName={actionName}
            {...(recordId !== undefined ? { recordId } : {})}
            {...(recordIds !== undefined ? { recordIds } : {})}
            onClose={close}
          />
        </CardContent>
      </Card>
    </div>
  )
}
