// Edit / new page driven by react-hook-form + zodResolver. The Zod schema
// is derived dynamically from the resource's editable PropertyJSON list via
// `buildValidationSchema()` — every property type maps to the right runtime
// check, with localized error messages. Field-level server errors from
// `record.errors` are projected back onto the form via setError, and global
// success/failure messages surface as toasts.

import * as React from 'react'
import { useForm, useWatch, type Control, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Form,
  FormField,
  InfoTooltip,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  getModKeyLabel,
} from '@modern-admin/ui'
import { AlertCircle, Eye, Plus, Save, Trash2, X } from 'lucide-react'
import { useCreateRecord, useDeleteRecord, useRecord, useResource, useUpdateRecord } from '../hooks.js'
import { parseApiError } from '../client.js'
import { PropertyEditor } from '../property-renderer.js'
import { Link, useNavigate } from '../router.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { useHotkey } from '../use-hotkey.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import type { BreadcrumbItemSpec } from '../breadcrumbs.js'
import { buildValidationSchema, defaultValueFor } from '../validation.js'
import { evaluateShowWhen } from '../show-when.js'
import type { PropertyJSON } from '../types.js'
import { useDialogs } from '../dialogs.js'
import { RevisionsButton } from '../components/revisions-button.js'
import { visibleRecordProperties } from '../relations.js'

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
  const remove = useDeleteRecord(resourceId)
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const notify = useNotify()
  const dialogs = useDialogs()

  const editable = React.useMemo<PropertyJSON[]>(
    () =>
      resource
        ? visibleRecordProperties(resource.properties, 'edit').filter((p) => !p.isDisabled)
        : [],
    [resource],
  )

  // The validation schema needs to consult the live form values so it can
  // skip required/format checks for fields hidden by `showWhen`. We can't
  // call `form.getValues` here (the form isn't built yet), so we route
  // through a ref filled in below — the schema closure reads from the ref
  // at validation time, not at build time.
  const getValuesRef = React.useRef<() => Record<string, unknown>>(() => ({}))

  // Re-build the schema when locale changes so error messages re-translate.
  const schema = React.useMemo(
    () => buildValidationSchema(editable, t, () => getValuesRef.current()),
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

  // Keep the ref pointing at the latest getValues so the schema closure
  // always sees the current form snapshot.
  getValuesRef.current = form.getValues

  // Track which recordId has already been hydrated so background refetches
  // don't overwrite user edits after the initial load.
  const hydratedRecordIdRef = React.useRef<string | undefined>(undefined)

  // Hydrate when the existing record arrives (edit mode) or after the resource
  // schema settles (new mode).
  React.useEffect(() => {
    if (!recordId) {
      // New-record form: reset whenever defaults change (resource schema loaded).
      hydratedRecordIdRef.current = undefined
      form.reset(defaults)
      return
    }
    // Wait until both the resource schema and the record data are ready.
    // Without this guard an early fire with editable=[] would wipe the form.
    if (editable.length === 0 || !existing.data) return
    // Hydrate only once per record — prevents background refetches from
    // overwriting in-progress user edits.
    if (hydratedRecordIdRef.current === recordId) return
    hydratedRecordIdRef.current = recordId

    const params = existing.data.record.params
    const merged: FormValues = { ...defaults }
    for (const p of editable) {
      const v = params[p.path]
      if (p.type === 'boolean') merged[p.path] = Boolean(v)
      else if (v == null) merged[p.path] = defaultValueFor(p)
      else merged[p.path] = v
    }
    form.reset(merged)
  }, [recordId, existing.data, editable, defaults, form])

  const [submitError, setSubmitError] = React.useState<string | null>(null)

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

  const handleDelete = async (): Promise<void> => {
    if (!recordId) return
    const ok = await dialogs.confirm({
      title: t('common:confirmDelete'),
      confirmLabel: t('common:delete'),
      destructive: true,
    })
    if (!ok) return
    await remove.mutateAsync(recordId)
    navigate({ name: 'list', resourceId })
  }

  // While editing an existing record, block submit/delete until the record
  // has been hydrated. Otherwise the form submits with empty defaults and
  // wipes server-side fields (e.g. enums coerce '' → null).
  const isHydrating = !isNew && (existing.isLoading || hydratedRecordIdRef.current !== recordId)

  // ── Keyboard shortcuts ──
  // Ctrl/Cmd+S submits the form. Submit-on-Ctrl+S works even when focus is
  // in an input — that's the standard "save" gesture across editors.
  useHotkey(
    'mod+s',
    () => {
      if (form.formState.isSubmitting || isHydrating) return
      void form.handleSubmit(onSubmit, onInvalid)()
    },
    { description: isNew ? t('common:create') : t('common:save') },
  )

  if (!resource) return <div className="p-6">{t('common:loading')}</div>

  // When editing an existing record that failed to load (e.g. 404), bail out
  // before rendering the form — there's nothing to edit.
  if (!isNew && existing.isError) {
    const { status, message } = parseApiError(existing.error)
    const title =
      status === 404
        ? t('errors:notFound')
        : status === 403
          ? t('errors:forbidden')
          : t('errors:server')
    return (
      <div className="space-y-4">
        <PageBreadcrumbs
          items={[
            homeCrumb(t('common:home')),
            { label: resource.name, to: { name: 'list', resourceId } },
            { label: recordId ?? '' },
          ]}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="truncate">
              {resource.name} #{recordId}
            </CardTitle>
            <Link to={{ name: 'list', resourceId }}>
              <Button variant="ghost" size="sm">
                {t('common:back')}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 dark:bg-destructive/15">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-destructive">{title}</p>
                <p className="text-destructive/90">{message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const modLabel = getModKeyLabel()

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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="truncate">
          {isNew ? `New ${resource.name}` : `Edit ${resource.name} #${recordId}`}
        </CardTitle>
        {!isNew && (
          <div className="flex shrink-0 gap-2">
            <RevisionsButton resourceId={resourceId} recordId={recordId!} />
            <Link to={{ name: 'show', resourceId, recordId: recordId! }}>
              <Button variant="outline" size="sm">
                <Eye className="size-4" />
                {t('common:show')}
              </Button>
            </Link>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending || form.formState.isSubmitting || isHydrating}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
              {t('common:delete')}
            </Button>
          </div>
        )}
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
          <CardContent className="gap-4 [column-fill:_balance] md:columns-2">
            {editable.map((property) => (
              <ConditionalField
                key={property.path}
                control={form.control}
                property={property}
              >
                <FormField
                  control={form.control}
                  name={property.path}
                  render={({ field, fieldState }) => (
                    <Field
                      data-invalid={fieldState.error ? true : undefined}
                      className="mb-8 break-inside-avoid"
                    >
                      <FieldLabel htmlFor={field.name}>
                        {property.label}
                        {property.description ? (
                          <InfoTooltip
                            content={property.description}
                            ariaLabel={property.description}
                          />
                        ) : null}
                        {property.isRequired && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <PropertyEditor
                        property={property}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                        resourceId={resourceId}
                      />
                      {fieldState.error?.message && (
                        <FieldError>{fieldState.error.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
              </ConditionalField>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" disabled={form.formState.isSubmitting || isHydrating}>
                    {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
                    {isNew ? t('common:create') : t('common:save')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1.5">
                  <span>{isNew ? t('common:create') : t('common:save')}</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Kbd>{modLabel}</Kbd>
                    <span className="text-muted-foreground">+</span>
                    <Kbd>S</Kbd>
                  </span>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
    </div>
  )
}

// ── ConditionalField ──────────────────────────────────────────────────────────
// Wraps a FormField with `showWhen` evaluation. Subscribes only to the named
// control field via `useWatch` so unrelated form changes do not re-render the
// branch. When the rule does not match, the entire FormField subtree (label,
// editor, description, error) is unmounted — and crucially, the schema's
// matching `superRefine` skips required/format checks for the same field, so
// hidden branches cannot block submission.

interface ConditionalFieldProps {
  control: Control<FormValues>
  property: PropertyJSON
  children: React.ReactNode
}

function ConditionalField({
  control,
  property,
  children,
}: ConditionalFieldProps): React.ReactElement | null {
  const rule = property.showWhen
  // useWatch with `name: undefined` would subscribe to every field, defeating
  // the purpose. Always pass a string when there's no rule we still want a
  // stable hook order, so we subscribe to the property's own path.
  const watched = useWatch({ control, name: rule?.field ?? property.path })
  if (!rule) return <>{children}</>
  const visible = evaluateShowWhen(rule, { [rule.field]: watched })
  if (!visible) return null
  return <>{children}</>
}
