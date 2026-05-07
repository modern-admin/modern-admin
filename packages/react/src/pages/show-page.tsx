import * as React from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@modern-admin/ui'
import { AlertCircle, ArrowLeft, Pencil } from 'lucide-react'
import { useRecord, useResource } from '../hooks.js'
import { parseApiError } from '../client.js'
import { PropertyDisplay } from '../property-renderer.js'
import { Link } from '../router.js'
import { useI18n } from '../i18n.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'

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
    <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-destructive">{title}</p>
        <p className="text-muted-foreground">{message}</p>
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
  const { t } = useI18n()
  if (!resource) return <div className="p-6">{t('common:loading')}</div>

  const recordLabel = record.data?.record.title || recordId

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
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to={{ name: 'list', resourceId }}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
              {t('common:back')}
            </Button>
          </Link>
          <Link to={{ name: 'edit', resourceId, recordId }}>
            <Button size="sm">
              <Pencil className="size-4" />
              {t('common:edit')}
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {record.isLoading && <p className="text-muted-foreground">{t('common:loading')}</p>}
        {record.isError && <PageError error={record.error} t={t} />}
        {record.data && (
          <dl className="grid gap-4 md:grid-cols-2">
            {resource.properties
              .filter((p) => p.visibility.show)
              .map((p) => (
                <div key={p.path}>
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
      </CardContent>
    </Card>
    </div>
  )
}
