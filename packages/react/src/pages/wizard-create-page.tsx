// ResourceWizardCreatePage — multi-step creation form for a resource.
// Analogous to ResourceEditPage but splits the fields across declarative
// `steps`, each validated independently before advancing. Submit on the final
// step creates the record and navigates to its show page.

import * as React from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardHeader, CardTitle, Form } from '@modern-admin/ui'
import { useCreateRecord, useResource } from '../hooks.js'
import { useNavigate } from '../router.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import { buildValidationSchema, defaultValueFor } from '../validation.js'
import type { PropertyJSON } from '../types.js'
import { visibleRecordProperties } from '../relations.js'
import {
  WizardForm,
  type WizardStep,
  type WizardFormLabels,
} from '../components/wizard-form.js'

export interface ResourceWizardCreatePageProps {
  resourceId: string
  /** Step definitions. Each step declares which property paths it shows. */
  steps: WizardStep[]
  /**
   * Override wizard button labels. Falls back to locale translations.
   * Useful when embedding the page with a custom i18n setup.
   */
  labels?: WizardFormLabels
}

type FormValues = Record<string, unknown>

export function ResourceWizardCreatePage({
  resourceId,
  steps,
  labels: labelsProp,
}: ResourceWizardCreatePageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const create = useCreateRecord(resourceId)
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const notify = useNotify()

  const editable = React.useMemo<PropertyJSON[]>(
    () =>
      resource
        ? visibleRecordProperties(resource.properties, 'edit', resource.propertyOrder?.edit).filter(
          (p) => !p.isDisabled,
        )
        : [],
    [resource],
  )

  // Route live form values into the validation schema (same pattern as edit-page).
  const getValuesRef = React.useRef<() => FormValues>(() => ({}))

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

  getValuesRef.current = form.getValues

  // Reset when the resource schema arrives (resource loaded after mount).
  React.useEffect(() => {
    form.reset(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults])

  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setSubmitError(null)
    try {
      const result = await create.mutateAsync(values)
      const errors = result.record.errors as Record<
        string,
        { message?: string } | string
      >
      if (errors && Object.keys(errors).length > 0) {
        for (const [path, err] of Object.entries(errors)) {
          const message =
            typeof err === 'string' ? err : (err?.message ?? 'Invalid value')
          form.setError(path, { type: 'server', message })
        }
        if (result.record.baseError) setSubmitError(String(result.record.baseError))
        notify.error({ key: 'toast:validationFailed' })
        return
      }
      notify.success({ key: 'toast:created' })
      navigate({ name: 'show', resourceId, recordId: String(result.record.id) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSubmitError(message)
      notify.error({ key: 'toast:createFailed' }, { description: message })
    }
  }

  const handleSubmit = (): void => {
    void form.handleSubmit(onSubmit, () => {
      notify.error({ key: 'toast:validationFailed' })
    })()
  }

  if (!resource) return <div className="p-6">{t('common:loading')}</div>

  const labels: WizardFormLabels = {
    back: t('common:back'),
    next: t('common:next'),
    submit: t('common:create'),
    cancel: t('common:cancel'),
    stepOf: t('wizard:stepOf'),
    ...labelsProp,
  }

  const crumbs = [
    homeCrumb(t('common:home')),
    { label: resource.name, to: { name: 'list' as const, resourceId } },
    { label: t('common:new') },
  ]

  return (
    <div className="flex min-h-full flex-col gap-4">
      <PageBreadcrumbs items={crumbs} />
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="truncate">
            {t('common:newRecord', { name: resource.name })}
          </CardTitle>
        </CardHeader>
        <Form {...form}>
          <WizardForm
            steps={steps}
            properties={editable}
            resourceId={resourceId}
            control={form.control}
            trigger={form.trigger}
            onSubmit={handleSubmit}
            onCancel={() => navigate({ name: 'list', resourceId })}
            isSubmitting={form.formState.isSubmitting}
            submitError={submitError}
            labels={labels}
          />
        </Form>
      </Card>
    </div>
  )
}
