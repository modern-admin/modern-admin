// shadcn-style Field — composable form-field layout primitives.
// Pure layout; no react-hook-form binding here. Pair with FormField from
// `./form.js` when wiring to RHF, or use standalone for lightweight forms.
//
// Conventions match the canonical shadcn `field` recipe:
//   <Field>
//     <FieldLabel>…</FieldLabel>
//     <Input />
//     <FieldDescription>…</FieldDescription>
//     <FieldError>…</FieldError>
//   </Field>
//
//   <FieldGroup>…</FieldGroup>
//   <FieldSet><FieldLegend/><FieldGroup/></FieldSet>

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'
import { Label } from './label.js'

const fieldVariants = cva('group/field flex w-full', {
  variants: {
    orientation: {
      vertical: 'flex-col gap-2',
      horizontal: 'flex-row items-center gap-3',
      responsive: 'flex-col gap-2 sm:flex-row sm:items-center sm:gap-3',
    },
  },
  defaultVariants: { orientation: 'vertical' },
})

export interface FieldProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof fieldVariants> {
  /** Render with a custom element via Radix Slot. */
  asChild?: boolean
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, orientation, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'
    return (
      <Comp
        ref={ref}
        data-slot="field"
        data-orientation={orientation ?? 'vertical'}
        className={cn(fieldVariants({ orientation }), className)}
        {...props}
      />
    )
  },
)
Field.displayName = 'Field'

export const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => (
  <Label
    ref={ref}
    data-slot="field-label"
    className={cn(
      'group-data-[invalid=true]/field:text-destructive flex items-center gap-2 text-sm font-medium leading-none',
      className,
    )}
    {...props}
  />
))
FieldLabel.displayName = 'FieldLabel'

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="field-description"
    className={cn('text-sm text-muted-foreground leading-snug', className)}
    {...props}
  />
))
FieldDescription.displayName = 'FieldDescription'

export const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & { errors?: ReadonlyArray<string | undefined> }
>(({ className, children, errors, ...props }, ref) => {
  const list = errors?.filter((e): e is string => Boolean(e))
  const body = list && list.length > 0 ? list.join(', ') : children
  if (!body) return null
  return (
    <p
      ref={ref}
      data-slot="field-error"
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  )
})
FieldError.displayName = 'FieldError'

export const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-group"
      role="group"
      className={cn('flex flex-col gap-5', className)}
      {...props}
    />
  ),
)
FieldGroup.displayName = 'FieldGroup'

export const FieldSet = React.forwardRef<HTMLFieldSetElement, React.FieldsetHTMLAttributes<HTMLFieldSetElement>>(
  ({ className, ...props }, ref) => (
    <fieldset
      ref={ref}
      data-slot="field-set"
      className={cn('flex flex-col gap-4 rounded-lg border border-border p-4', className)}
      {...props}
    />
  ),
)
FieldSet.displayName = 'FieldSet'

export const FieldLegend = React.forwardRef<
  HTMLLegendElement,
  React.HTMLAttributes<HTMLLegendElement>
>(({ className, ...props }, ref) => (
  <legend
    ref={ref}
    data-slot="field-legend"
    className={cn('px-1 text-sm font-medium leading-none', className)}
    {...props}
  />
))
FieldLegend.displayName = 'FieldLegend'

export const FieldSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-separator"
      role="separator"
      aria-orientation="horizontal"
      className={cn('h-px w-full bg-border', className)}
      {...props}
    />
  ),
)
FieldSeparator.displayName = 'FieldSeparator'

/** Wrapper for label + description + control + error stacked vertically. */
export const FieldContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-content"
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      {...props}
    />
  ),
)
FieldContent.displayName = 'FieldContent'
