import * as React from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@modern-admin/ui'
import { useRecords, useResource, useDeleteRecord } from '../hooks.js'
import { PropertyDisplay } from '../property-renderer.js'
import { Link, useNavigate } from '../router.js'
import type { ListQuery, PropertyJSON } from '../types.js'

export interface ResourceListPageProps {
  resourceId: string
}

export function ResourceListPage({ resourceId }: ResourceListPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const [query, setQuery] = React.useState<ListQuery>({ page: 1, perPage: 20 })
  const records = useRecords(resourceId, query)
  const remove = useDeleteRecord(resourceId)
  const navigate = useNavigate()

  if (!resource) return <div className="p-6 text-slate-500">Loading resource…</div>

  const visible = resource.properties.filter((p) => p.visibility.list)
  const idProp = resource.properties.find((p) => p.isId)
  const idPath = idProp?.path ?? 'id'

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{resource.name}</CardTitle>
        <Button onClick={() => navigate({ name: 'new', resourceId })}>New</Button>
      </CardHeader>
      <CardContent>
        {records.isLoading && <p className="text-slate-500">Loading…</p>}
        {records.isError && (
          <p className="text-red-600">Failed to load: {String(records.error)}</p>
        )}
        {records.data && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {visible.map((p) => (
                    <TableHead key={p.path}>{p.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.data.records.map((record) => (
                  <TableRow key={record.id}>
                    {visible.map((p) => (
                      <TableCell key={p.path}>
                        <CellLink resourceId={resourceId} recordId={record.id} property={p}>
                          <PropertyDisplay property={p} value={record.params[p.path]} view="list" />
                        </CellLink>
                      </TableCell>
                    ))}
                    <TableCell className="space-x-2 text-right">
                      <Link to={{ name: 'show', resourceId, recordId: record.id }}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      <Link to={{ name: 'edit', resourceId, recordId: record.id }}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Delete ${idPath}=${record.id}?`)) {
                            remove.mutate(record.id)
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager query={query} setQuery={setQuery} total={records.data.meta.total} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CellLink({
  resourceId,
  recordId,
  property,
  children,
}: {
  resourceId: string
  recordId: string
  property: PropertyJSON
  children: React.ReactNode
}): React.ReactElement {
  if (!property.isId) return <>{children}</>
  return (
    <Link
      to={{ name: 'show', resourceId, recordId }}
      className="font-medium text-slate-900 hover:underline"
    >
      {children}
    </Link>
  )
}

function Pager({
  query,
  setQuery,
  total,
}: {
  query: ListQuery
  setQuery: React.Dispatch<React.SetStateAction<ListQuery>>
  total: number
}): React.ReactElement {
  const page = query.page ?? 1
  const perPage = query.perPage ?? 20
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        Page {page} of {totalPages} — {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
          disabled={page <= 1}
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setQuery((q) => ({ ...q, page: Math.min(totalPages, (q.page ?? 1) + 1) }))
          }
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
