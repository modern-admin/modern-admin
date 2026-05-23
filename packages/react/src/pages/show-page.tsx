import * as React from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  getModKeyLabel,
} from '@modern-admin/ui'
import { AlertCircle, Pencil, Trash2, Zap } from 'lucide-react'
import { useDeleteRecord, useFeatures, useInvokeRecordAction, useRecord, useResource } from '../hooks.js'
import { parseApiError } from '../client.js'
import { PropertyDisplay } from '../property-renderer.js'
import { Link, useNavigate } from '../router.js'
import { useI18n } from '../i18n.js'
import { useHotkey } from '../use-hotkey.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import { RelatedRecordsTabs } from '../components/related-records-tabs.js'
import { useDialogs } from '../dialogs.js'
import { useNotify } from '../notify.js'
import { ActionMenu } from '../action-menu.js'
import { RevisionsButton } from '../components/revisions-button.js'
import { visibleRecordProperties } from '../relations.js'

function PageError({
  error,
  t,
}: {
  error: unknown
  t: (key: string) => string
}): React.ReactElement {
  const { status, message } = parseApiError(error)
  const title =
    status === 404
      ? t('errors:notFound')
      : status === 403
        ? t('errors:forbidden')
        : t('errors:server')
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 dark:bg-destructive/15">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-destructive">{title}</p>
        <p className="text-destructive/90">{message}</p>
      </div>
    </div>
  )
}

export interface ResourceShowPageProps {
  resourceId: string
  recordId: string
}

export function ResourceShowPage({
  resourceId,
  recordId,
}: ResourceShowPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const record = useRecord(resourceId, recordId)
  const remove = useDeleteRecord(resourceId)
  const invokeRecord = useInvokeRecordAction(resourceId)
  const features = useFeatures()
  const { t } = useI18n()
  const navigate = useNavigate()
  const dialogs = useDialogs()
  const notify = useNotify()

  const customRecordActions = (resource?.actions ?? []).filter(
    (a) => a.actionType === 'record' && !['show', 'edit', 'delete'].includes(a.name),
  )

  // ── Keyboard shortcuts ──
  // Ctrl/Cmd+E jumps into edit. Discoverable via the action-button tooltip.
  useHotkey(
    'mod+e',
    () => {
      if (!record.data) return
      navigate({ name: 'edit', resourceId, recordId })
    },
    { description: t('common:edit') },
  )

  const handleDelete = async (): Promise<void> => {
    const ok = await dialogs.confirm({
      title: t('common:confirmDelete'),
      confirmLabel: t('common:delete'),
      destructive: true,
    })
    if (!ok) return
    await remove.mutateAsync(recordId)
    navigate({ name: 'list', resourceId })
  }

  if (!resource) return <div className="p-6">{t('common:loading')}</div>

  const modLabel = getModKeyLabel()
  const recordLabel = record.data?.record?.title || recordId

  return (
    <div className="space-y-4">
      <PageBreadcrumbs
        items={[
          homeCrumb(t('common:home')),
          { label: resource.name, to: { name: 'list', resourceId } },
          { label: recordLabel },
        ]}
      />
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="truncate">
          {resource.name} #{recordId}
        </CardTitle>
        {record.data && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {features.history && (
              <RevisionsButton resourceId={resourceId} recordId={recordId} />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                {/* `asChild` + Link-as-Button keeps the rendered DOM a
                 *  single `<a>` so it picks up the Button's `h-8` from
                 *  `size="sm"` instead of stacking a Link wrapper that
                 *  collapses to its anchor default height. */}
                <Button variant="outline-primary" size="sm" asChild>
                  <Link to={{ name: 'edit', resourceId, recordId }}>
                    <Pencil className="size-4" />
                    {t('common:edit')}
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-1.5">
                <span>{t('common:edit')}</span>
                <span className="inline-flex items-center gap-0.5">
                  <Kbd>{modLabel}</Kbd>
                  <span className="text-muted-foreground">+</span>
                  <Kbd>E</Kbd>
                </span>
              </TooltipContent>
            </Tooltip>
            <Button
              variant="outline-destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
              {t('common:delete')}
            </Button>
            {customRecordActions.length > 0 && (
              <ActionMenu
                actions={customRecordActions}
                onAction={(action) => {
                  void invokeRecord
                    .mutateAsync({ recordId, actionName: action.name })
                    .then((res) => {
                      if (res.notice) {
                        const type = res.notice.type === 'error' ? 'error'
                          : res.notice.type === 'warning' ? 'warning'
                          : res.notice.type === 'info' ? 'info'
                          : 'success'
                        notify[type]({ message: res.notice.message })
                      }
                    })
                    .catch((err: Error) =>
                      notify.error({ message: err.message }),
                    )
                }}
                t={t}
                trigger={(
                  <Button variant="outline" size="sm" disabled={invokeRecord.isPending}>
                    <Zap className="size-4" />
                    {t('common:actions')}
                  </Button>
                )}
              />
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
        {record.isLoading && <p className="text-muted-foreground">{t('common:loading')}</p>}
        {record.isError && <PageError error={record.error} t={t} />}
        {record.data && (
          <dl className="[column-fill:_balance] md:columns-2">
            {visibleRecordProperties(resource.properties, 'show')
              .map((p) => (
                <div key={p.path} className="mb-8 break-inside-avoid">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {p.label}
                  </dt>
                  <dd className="mt-1">
                    <PropertyDisplay
                      property={p}
                      value={record.data!.record.params[p.path]}
                      view="show"
                    />
                  </dd>
                </div>
              ))}
          </dl>
        )}
        </div>
      </CardContent>
    </Card>
    {record.data && <RelatedRecordsTabs resource={resource} recordId={recordId} />}
    </div>
  )
}
