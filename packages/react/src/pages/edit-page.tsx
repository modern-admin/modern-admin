import * as React from 'react'
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Label,
} from '@modern-admin/ui'
import { useCreateRecord, useRecord, useResource, useUpdateRecord } from '../hooks.js'
import { PropertyEditor } from '../property-renderer.js'
import { useNavigate } from '../router.js'
import type { PropertyJSON } from '../types.js'

export interface ResourceEditPageProps {
  resourceId: string
  recordId?: string
}

export function ResourceEditPage({
  resourceId,
  recordId,
}: ResourceEditPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const existing = useRecord(resourceId, recordId)
  const create = useCreateRecord(resourceId)
  const update = useUpdateRecord(resourceId)
  const navigate = useNavigate()
  const [form, setForm] = React.useState<Record<string, unknown>>({})
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (recordId && existing.data) {
      setForm({ ...existing.data.record.params })
    }
  }, [recordId, existing.data])

  if (!resource) return <div className="p-6">Loading resource…</div>

  const editable = resource.properties.filter((p) => p.visibility.edit && !p.isDisabled)
  const isNew = !recordId

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const result = isNew
        ? await create.mutateAsync(form)
        : await update.mutateAsync({ id: recordId!, payload: form })
      navigate({ name: 'show', resourceId, recordId: String(result.record.id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? `New ${resource.name}` : `Edit ${resource.name} #${recordId}`}</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {editable.map((p) => (
            <Field
              key={p.path}
              property={p}
              value={form[p.path]}
              onChange={(next) => setForm((s) => ({ ...s, [p.path]: next }))}
            />
          ))}
        </CardContent>
        <CardFooter className="justify-between">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                navigate(isNew ? { name: 'list', resourceId } : { name: 'show', resourceId, recordId: recordId! })
              }
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isNew ? 'Create' : 'Save'}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}

function Field({
  property,
  value,
  onChange,
}: {
  property: PropertyJSON
  value: unknown
  onChange(next: unknown): void
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <Label htmlFor={`field-${property.path}`}>
        {property.label}
        {property.isRequired && <span className="ml-1 text-red-500">*</span>}
      </Label>
      <PropertyEditor property={property} value={value} onChange={onChange} />
      {property.description && (
        <p className="text-xs text-slate-500">{property.description}</p>
      )}
    </div>
  )
}
