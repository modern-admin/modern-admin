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
import { AlertCircle, Eye, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { useCreateRecord, useDeleteRecord, useFeatures, useRecord, useResource, useUpdateRecord } from '../hooks.js'
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
import { AiFillDialog } from '../components/ai-fill-dialog.js'
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
  const features = useFeatures()
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

  const isNew = !recordId

  // localStorage key for the per-resource new-record draft. We persist the
  // form snapshot here whenever the user has typed anything but not yet
  // submitted, so that closing the tab / navigating away doesn't lose work.
  const draftKey = isNew ? `modern-admin:draft:${resourceId}` : null

  // Once-per-resource init flag for the new-record form. Gates the whole
  // initialisation block — without this, every dep change in the hydration
  // effect (e.g. a background `useResource` refetch bumping the `defaults`
  // reference) would re-run `form.reset(defaults)` and wipe the user's
  // in-progress input (and any draft we just restored).
  const newFormInitForRef = React.useRef<string | undefined>(undefined)

  // When we programmatically reset the form (draft restore / undo), we don't
  // want that synthetic change to trigger the persistence watcher and re-save
  // a draft that we just decided not to keep.
  const skipNextPersistRef = React.useRef(false)

  // Hydrate when the existing record arrives (edit mode) or after the resource
  // schema settles (new mode).
  React.useEffect(() => {
    if (!recordId) {
      // New-record form: initialise exactly once per resource. Second and
      // later runs (triggered by background refetches changing `editable` /
      // `defaults` references) must NOT touch the form — `form.reset(...)`
      // would wipe the user's in-progress input.
      hydratedRecordIdRef.current = undefined
      if (newFormInitForRef.current === resourceId) return
      // Defer until the schema has loaded — otherwise we'd "initialise"
      // against an empty defaults map and then refuse to ever re-init.
      if (editable.length === 0) return
      newFormInitForRef.current = resourceId

      // Attempt to restore a saved draft. If we find one, reset to the
      // merged snapshot and surface a bottom-center toast with an Undo
      // action. If not, fall back to a single reset to defaults.
      let draft: FormValues | null = null
      if (draftKey && typeof window !== 'undefined') {
        try {
          const stored = window.localStorage.getItem(draftKey)
          if (stored) draft = JSON.parse(stored) as FormValues
        } catch {
          /* corrupted JSON — ignore */
        }
      }

      if (draft && typeof draft === 'object') {
        const merged: FormValues = { ...defaults }
        for (const p of editable) {
          if (Object.prototype.hasOwnProperty.call(draft, p.path)) {
            merged[p.path] = (draft as FormValues)[p.path]
          }
        }
        skipNextPersistRef.current = true
        form.reset(merged)
        notify.raw(t('common:draftRestored'), {
          position: 'bottom-center',
          duration: 8000,
          action: {
            label: t('common:undoDraftRestore'),
            onClick: () => {
              skipNextPersistRef.current = true
              form.reset(defaults)
              try {
                if (draftKey) window.localStorage.removeItem(draftKey)
              } catch {
                /* ignore */
              }
            },
          },
        })
      } else {
        form.reset(defaults)
      }
      return
    }
    // Wait until both the resource schema and the record data are ready.
    // Without this guard an early fire with editable=[] would wipe the form.
    if (editable.length === 0 || !existing.data) return
    // Hydrate only once per record — prevents background refetches from
    // overwriting in-progress user edits.
    if (hydratedRecordIdRef.current === recordId) return
    hydratedRecordIdRef.current = recordId
    // Switching into edit mode invalidates any prior new-form init — so the
    // next visit to `/new` (potentially in a reused component instance)
    // restores the draft / resets to defaults instead of keeping the edit
    // record's values.
    newFormInitForRef.current = undefined

    const params = existing.data.record.params
    const merged: FormValues = { ...defaults }
    for (const p of editable) {
      const v = params[p.path]
      if (p.type === 'boolean') merged[p.path] = Boolean(v)
      else if (v == null) merged[p.path] = defaultValueFor(p)
      else merged[p.path] = v
    }
    form.reset(merged)
  }, [recordId, existing.data, editable, defaults, form, draftKey, resourceId, notify, t])

  // Persist the form snapshot to localStorage on every change in new mode.
  // We only write when at least one field deviates from defaults; when the
  // form is back to pristine state we delete the key so the user isn't
  // greeted with an "empty draft" toast on reopen.
  React.useEffect(() => {
    if (!isNew || !draftKey || editable.length === 0 || typeof window === 'undefined') return
    const subscription = form.watch((values) => {
      if (skipNextPersistRef.current) {
        skipNextPersistRef.current = false
        return
      }
      let isDirty = false
      const sanitized: FormValues = {}
      for (const p of editable) {
        const v = (values as FormValues)[p.path]
        // Skip non-serializable values (File objects from file inputs).
        if (v instanceof File) continue
        if (Array.isArray(v) && v.some((x) => x instanceof File)) continue
        sanitized[p.path] = v
        if (!valuesEqual(v, defaults[p.path])) isDirty = true
      }
      try {
        if (isDirty) {
          window.localStorage.setItem(draftKey, JSON.stringify(sanitized))
        } else {
          window.localStorage.removeItem(draftKey)
        }
      } catch {
        /* quota / disabled storage — ignore */
      }
    })
    return () => subscription.unsubscribe()
  }, [isNew, draftKey, editable, defaults, form])

  const clearDraft = React.useCallback((): void => {
    // After a successful submit we navigate to the show page, but the
    // component might be reused if the user clicks "back" or follows a
    // Create link again. Clearing the init flag forces the next /new visit
    // to fall back to defaults instead of retaining the just-submitted
    // values.
    newFormInitForRef.current = undefined
    if (!draftKey || typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      /* ignore */
    }
  }, [draftKey])

  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [aiFillOpen, setAiFillOpen] = React.useState(false)

  // The `aiFill` feature plugin (packages/feature-ai-fill) registers a
  // resource-scoped action whose `custom.aiFill === true` flag tells us
  // the resource opts in. Absent the action, the button is hidden.
  // Detect the aiFill plugin by the `custom.aiFill === true` marker, not by
  // action name, so renaming the action in the future can't silently break this.
  const aiFillEnabled = React.useMemo(
    () =>
      Boolean(
        resource?.actions.find(
          (a) => (a.custom as { aiFill?: boolean } | undefined)?.aiFill === true,
        ),
      ),
    [resource],
  )

  const applyAiFillValues = React.useCallback(
    (values: Record<string, unknown>): void => {
      // Snapshot the current values of the fields that will be overwritten so
      // the user can undo with a single toast action.
      const known = new Set(editable.map((p) => p.path))
      const snapshot: Record<string, unknown> = {}
      const current = form.getValues()
      for (const path of Object.keys(values)) {
        if (!known.has(path)) continue
        snapshot[path] = current[path]
      }

      for (const [path, value] of Object.entries(values)) {
        if (!known.has(path)) continue
        form.setValue(path, value as never, { shouldDirty: true, shouldValidate: false })
      }

      // Offer a quick undo via a bottom-center toast — same pattern as draft restore.
      notify.raw(t('aiFill:applied'), {
        position: 'bottom-center',
        duration: 8000,
        action: {
          label: t('common:undoDraftRestore'),
          onClick: () => {
            for (const [path, prev] of Object.entries(snapshot)) {
              form.setValue(path, prev as never, { shouldDirty: true, shouldValidate: false })
            }
          },
        },
      })
    },
    [editable, form, notify, t],
  )

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
      // Successful submit — drop the saved draft so we don't restore it on
      // the next visit to the new-form route.
      if (isNew) clearDraft()
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
      <div className="flex min-h-full flex-col gap-4">
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
    <div className="flex min-h-full flex-col gap-4">
      <PageBreadcrumbs items={crumbs} />
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="truncate">
            {isNew
              ? t('common:newRecord', { name: resource.name })
              : t('common:editRecord', { name: resource.name, id: recordId ?? '' })}
          </CardTitle>
          <div className="flex shrink-0 gap-2">
            {aiFillEnabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.formState.isSubmitting || isHydrating}
                onClick={() => setAiFillOpen(true)}
              >
                <Sparkles className="size-4" />
                <span className="hidden sm:inline">{t('aiFill:button')}</span>
              </Button>
            )}
            {!isNew && (
              <>
                {features.history && (
                  <RevisionsButton resourceId={resourceId} recordId={recordId!} />
                )}
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
              </>
            )}
          </div>
        </CardHeader>
        <Form {...form}>
          <form id="edit-record-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
            <CardContent className="gap-4 pb-6 [column-fill:_balance] md:columns-2">
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
          </form>
        </Form>
      </Card>
      {/* Sticky action bar — sibling of Card, same pattern as the list-page
          paginator. Pinned to the viewport bottom while the user scrolls.
          `form="edit-record-form"` ties the submit button to the <form> above
          even though it's not a descendant of that element. */}
      {aiFillOpen && (
        <AiFillDialog
          resourceId={resourceId}
          onClose={() => setAiFillOpen(false)}
          onFilled={applyAiFillValues}
        />
      )}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card px-4 py-3 pr-16 sm:-mx-6 sm:px-6 sm:pr-16">
        <div className="flex items-center justify-between">
          <div>
            {submitError && (
              <span className="text-sm text-destructive">{submitError}</span>
            )}
          </div>
          <div className="flex gap-2">
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
                <Button
                  type="submit"
                  form="edit-record-form"
                  disabled={form.formState.isSubmitting || isHydrating}
                >
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
        </div>
      </div>
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

// Cheap structural equality for form values. Empty-ish primitives are treated
// as equal (`''` ≈ `null` ≈ `undefined`) so the persistence watcher does not
// store a draft for an untouched form whose defaults happen to be `''` vs
// `undefined`. Falls back to JSON stringify for objects/arrays.
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  const aEmpty = a == null || a === ''
  const bEmpty = b == null || b === ''
  if (aEmpty && bEmpty) return true
  if (aEmpty || bEmpty) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return false
}
