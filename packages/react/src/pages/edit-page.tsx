// Edit / new page driven by react-hook-form + zodResolver. The Zod schema
// is derived dynamically from the resource's editable PropertyJSON list via
// `buildValidationSchema()` — every property type maps to the right runtime
// check, with localized error messages. Field-level server errors from
// `record.errors` are projected back onto the form via setError, and global
// success/failure messages surface as toasts.

import * as React from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@modern-admin/ui'
import { Plus, Save, X } from 'lucide-react'
import { useCreateRecord, useRecord, useResource, useUpdateRecord } from '../hooks.js'
import { PropertyEditor } from '../property-renderer.js'
import { useNavigate } from '../router.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import type { BreadcrumbItemSpec } from '../breadcrumbs.js'
import { buildValidationSchema, defaultValueFor } from '../validation.js'
import type { PropertyJSON } from '../types.js'

export interface ResourceEditPageProps {
  resourceId: string
  recordId?: string
}

type FormValues = Record<string, unknown>

export function ResourceEditPage({
  resourceId,
  recordId,
}: ResourceEditPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const existing = useRecord(resourceId, recordId)
  const create = useCreateRecord(resourceId)
  const update = useUpdateRecord(resourceId)
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const notify = useNotify()

  const editable = React.useMemo<PropertyJSON[]>(
    () => resource?.properties.filter((p) => p.visibility.edit && !p.isDisabled) ?? [],
    [resource],
  )

  // Re-build the schema when locale changes so error messages re-translate.
  const schema = React.useMemo(
    () => buildValidationSchema(editable, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, locale],
  )
  const defaults = React.useMemo<FormValues>(() => {
    const out: FormValues = {}
    for (const p of editable) out[p.path] = defaultValueFor(p)
    return out
  }, [editable])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  // Hydrate when the existing record arrives (edit mode) or after the resource
  // schema settles (new mode).
  React.useEffect(() => {
    if (recordId) {
      if (existing.data) {
        const params = existing.data.record.params
        const merged: FormValues = { ...defaults }
        for (const p of editable) {
          const v = params[p.path]
          if (p.type === 'boolean') merged[p.path] = Boolean(v)
          else if (v == null) merged[p.path] = defaultValueFor(p)
          else merged[p.path] = v
        }
        form.reset(merged)
      }
    } else {
      form.reset(defaults)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, existing.data, defaults])

  const [submitError, setSubmitError] = React.useState<string | null>(null)

  if (!resource) return <div className="p-6">{t('common:loading')}</div>

  const isNew = !recordId

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setSubmitError(null)
    try {
      const result = isNew
        ? await create.mutateAsync(values)
        : await update.mutateAsync({ id: recordId!, payload: values })
      // Field-level errors come back as 200 with `record.errors`.
      const errors = result.record.errors as Record<string, { message?: string } | string>
      if (errors && Object.keys(errors).length > 0) {
        for (const [path, err] of Object.entries(errors)) {
          const message = typeof err === 'string' ? err : (err?.message ?? 'Invalid value')
          form.setError(path, { type: 'server', message })
        }
        if (result.record.baseError) {
          setSubmitError(String(result.record.baseError))
        }
        notify.error({ key: 'toast:validationFailed' })
        return
      }
      notify.success({ key: isNew ? 'toast:created' : 'toast:saved' })
      navigate({ name: 'show', resourceId, recordId: String(result.record.id) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSubmitError(message)
      notify.error({ key: isNew ? 'toast:createFailed' : 'toast:saveFailed' }, { description: message })
    }
  }

  const onInvalid = (): void => {
    notify.error({ key: 'toast:validationFailed' })
  }

  const recordLabel = existing.data?.record.title || recordId
  const crumbs: BreadcrumbItemSpec[] = [
    homeCrumb(t('common:home')),
    { label: resource.name, to: { name: 'list', resourceId } },
    ...(isNew
      ? [{ label: t('common:new') }]
      : [
          {
            label: recordLabel ?? '',
            to: { name: 'show' as const, resourceId, recordId: recordId! },
          },
          { label: t('common:edit') },
        ]),
  ]

  return (
    <div className="space-y-4">
      <PageBreadcrumbs items={crumbs} />
    <Card>
      <CardHeader>
        <CardTitle>
          {isNew ? `New ${resource.name}` : `Edit ${resource.name} #${recordId}`}
        </CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {editable.map((property) => (
              <FormField
                key={property.path}
                control={form.control}
                name={property.path}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {property.label}
                      {property.isRequired && (
                        <span className="ml-1 text-destructive">*</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      {/* Slot forwards id/aria-* onto the editor's wrapper. */}
                      <div>
                        <PropertyEditor
                          property={property}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={form.formState.isSubmitting}
                        />
                      </div>
                    </FormControl>
                    {property.description && (
                      <FormDescription>{property.description}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
          <CardFooter className="justify-between">
            {submitError && (
              <span className="text-sm text-destructive">{submitError}</span>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  navigate(
                    isNew
                      ? { name: 'list', resourceId }
                      : { name: 'show', resourceId, recordId: recordId! },
                  )
                }
              >
                <X className="size-4" />
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
                {isNew ? t('common:create') : t('common:save')}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
    </div>
  )
}
