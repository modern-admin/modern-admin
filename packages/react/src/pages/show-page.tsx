import * as React from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@modern-admin/ui'
import { useRecord, useResource } from '../hooks.js'
import { PropertyDisplay } from '../property-renderer.js'
import { Link } from '../router.js'

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
  if (!resource) return <div className="p-6">Loading resource…</div>

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          {resource.name} #{recordId}
        </CardTitle>
        <div className="flex gap-2">
          <Link to={{ name: 'list', resourceId }}>
            <Button variant="ghost">Back</Button>
          </Link>
          <Link to={{ name: 'edit', resourceId, recordId }}>
            <Button>Edit</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {record.isLoading && <p className="text-slate-500">Loading…</p>}
        {record.isError && (
          <p className="text-red-600">Failed to load: {String(record.error)}</p>
        )}
        {record.data && (
          <dl className="grid gap-4 md:grid-cols-2">
            {resource.properties
              .filter((p) => p.visibility.show)
              .map((p) => (
                <div key={p.path}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
  )
}
