// WizardForm — multi-step create form. Each step shows a subset of the
// resource's editable properties. Clicking "Next" validates only the current
// step's fields before advancing; "Back" never re-validates. "Create" on the
// final step triggers the caller-supplied submit handler.
//
// The component is i18n-unaware: all visible strings are passed via the
// `labels` prop with English defaults. The ResourceWizardCreatePage calls
// t() and wires the results in.

import * as React from 'react'
import { useWatch, type Control, type UseFormTrigger } from 'react-hook-form'
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  FormField,
  InfoTooltip,
  cn,
} from '@modern-admin/ui'
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { PropertyEditor } from '../property-renderer.js'
import { evaluateShowWhen } from '../show-when.js'
import type { PropertyJSON } from '../types.js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface WizardStep {
  /** Short label shown in the step indicator circles */
  label: string
  /** Optional longer description rendered below the step indicator */
  description?: string
  /**
   * Property paths (from the resource) to show in this step.
   * If omitted on exactly one step, that step receives all properties not
   * claimed by the other steps (catch-all).
   */
  properties?: string[]
}

export interface WizardFormLabels {
  back?: string
  next?: string
  submit?: string
  cancel?: string
  /** Template: 'Step {current} of {total}' — shown only on mobile */
  stepOf?: string
}

type FormValues = Record<string, unknown>

export interface WizardFormProps {
  steps: WizardStep[]
  /** All editable properties of the resource. */
  properties: PropertyJSON[]
  resourceId: string
  control: Control<FormValues>
  trigger: UseFormTrigger<FormValues>
  onSubmit: () => void
  onCancel: () => void
  isSubmitting?: boolean
  submitError?: string | null
  labels?: WizardFormLabels
}

// ── WizardForm ────────────────────────────────────────────────────────────────

export function WizardForm({
  steps,
  properties,
  resourceId,
  control,
  trigger,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitError,
  labels = {},
}: WizardFormProps): React.ReactElement {
  const backLabel = labels.back ?? 'Back'
  const nextLabel = labels.next ?? 'Next'
  const submitLabel = labels.submit ?? 'Create'
  const cancelLabel = labels.cancel ?? 'Cancel'
  const stepOfTemplate = labels.stepOf ?? 'Step {current} of {total}'

  const [currentStep, setCurrentStep] = React.useState(0)

  // ── Distribute properties across steps ───────────────────────────────────
  const stepProperties = React.useMemo<PropertyJSON[][]>(() => {
    const claimedPaths = new Set(steps.flatMap((s) => s.properties ?? []))
    const unclaimed = properties.filter((p) => !claimedPaths.has(p.path))
    return steps.map((step) => {
      if (step.properties) {
        return step.properties
          .map((path) => properties.find((p) => p.path === path))
          .filter((p): p is PropertyJSON => p != null)
      }
      return unclaimed
    })
  }, [steps, properties])

  const totalSteps = steps.length
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1

  const handleNext = async (): Promise<void> => {
    const paths = (stepProperties[currentStep] ?? []).map((p) => p.path)
    // When the step has no properties, advance without validation.
    const valid =
      paths.length === 0 ||
      (await trigger(paths as Parameters<typeof trigger>[0]))
    if (valid) setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))
  }

  const currentStepDef = steps[currentStep]!
  const currentProperties = stepProperties[currentStep] ?? []

  const stepOfLabel = stepOfTemplate
    .replace('{current}', String(currentStep + 1))
    .replace('{total}', String(totalSteps))

  return (
    <div>
      {/* ── Step indicator ──────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-5">
        <div className="flex w-full max-w-xl items-start mx-auto">
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              {/* Step node */}
              <div className="flex shrink-0 flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    index < currentStep &&
                      'border-primary bg-primary text-primary-foreground',
                    index === currentStep &&
                      'border-primary bg-background text-primary',
                    index > currentStep &&
                      'border-border bg-background text-muted-foreground',
                  )}
                >
                  {index < currentStep ? (
                    <Check className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'mt-1.5 hidden max-w-[6rem] text-center text-xs leading-tight sm:block',
                    index === currentStep
                      ? 'font-medium text-foreground'
                      : index < currentStep
                        ? 'text-primary'
                        : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector line between nodes */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 mt-3.5 h-0.5 flex-1 transition-colors',
                    index < currentStep ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Mobile: compact "Step N of M · Label" summary */}
        <p className="mt-2 text-center text-xs text-muted-foreground sm:hidden">
          {stepOfLabel}
          {currentStepDef.label ? ` · ${currentStepDef.label}` : ''}
        </p>
      </div>

      {/* ── Step description ────────────────────────────────────────── */}
      {currentStepDef.description && (
        <p className="px-6 pb-2 text-sm text-muted-foreground">
          {currentStepDef.description}
        </p>
      )}

      {/* ── Fields ──────────────────────────────────────────────────── */}
      <div className="gap-4 px-6 pb-4 [column-fill:_balance] md:columns-2">
        {currentProperties.map((property) => (
          <WizardConditionalField
            key={property.path}
            control={control}
            property={property}
          >
            <FormField
              control={control}
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
                    disabled={isSubmitting}
                    resourceId={resourceId}
                  />
                  {fieldState.error?.message && (
                    <FieldError>{fieldState.error.message}</FieldError>
                  )}
                </Field>
              )}
            />
          </WizardConditionalField>
        ))}
      </div>

      {/* ── Navigation footer ───────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <div>
          {submitError && (
            <span className="text-sm text-destructive">{submitError}</span>
          )}
        </div>
        <div className="flex gap-2">
          {isFirst ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              <X className="size-4" />
              {cancelLabel}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={isSubmitting}
            >
              <ChevronLeft className="size-4" />
              {backLabel}
            </Button>
          )}
          {isLast ? (
            <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
              <Plus className="size-4" />
              {submitLabel}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleNext()}
              disabled={isSubmitting}
            >
              {nextLabel}
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

WizardForm.displayName = 'WizardForm'

// ── WizardConditionalField ────────────────────────────────────────────────────
// Same showWhen evaluation as ConditionalField in edit-page, scoped here.

interface WizardConditionalFieldProps {
  control: Control<FormValues>
  property: PropertyJSON
  children: React.ReactNode
}

function WizardConditionalField({
  control,
  property,
  children,
}: WizardConditionalFieldProps): React.ReactElement | null {
  const rule = property.showWhen
  const watched = useWatch({ control, name: rule?.field ?? property.path })
  if (!rule) return <>{children}</>
  return evaluateShowWhen(rule, { [rule.field]: watched }) ? <>{children}</> : null
}
