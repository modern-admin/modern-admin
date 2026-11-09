// shadcn-style Field — composable form-field layout primitives.
//
// This is THE form-field layout of the kit. It is pure layout with no
// react-hook-form dependency; to bind it to RHF wrap it in `<FormField>`
// (a thin `Controller`) and wire the ids yourself:
//
//   <FormField control={control} name="email" render={({ field, fieldState }) => (
//     <Field invalid={fieldState.invalid}>
//       <FieldLabel htmlFor="email">Email</FieldLabel>
//       <Input id="email" aria-invalid={fieldState.invalid} {...field} />
//       <FieldError>{fieldState.error?.message}</FieldError>
//     </Field>
//   )} />
//
// The older `FormItem` / `FormLabel` / `FormControl` / `FormMessage` family in
// `./form.js` is deprecated in favour of this one.
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
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof fieldVariants> {
  /** Render with a custom element via Radix Slot. */
  asChild?: boolean
  /** Tints the label/description for an invalid field (sets `data-invalid`). */
  invalid?: boolean
}

export const Field = ({
  ref,
  className,
  orientation,
  asChild,
  invalid,
  ...props
}: React.PropsWithoutRef<FieldProps> & React.RefAttributes<HTMLDivElement>) => {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      ref={ref}
      data-slot="field"
      data-orientation={orientation ?? 'vertical'}
      data-invalid={invalid || undefined}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

export const FieldLabel = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof Label>> &
  React.RefAttributes<React.ElementRef<typeof Label>>) => (
  <Label
    ref={ref}
    data-slot="field-label"
    className={cn(
      'group-data-[invalid=true]/field:text-destructive flex items-center gap-2 text-sm font-medium leading-none',
      className,
    )}
    {...props}
  />
)

export const FieldDescription = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLParagraphElement>> &
  React.RefAttributes<HTMLParagraphElement>) => (
  <p
    ref={ref}
    data-slot="field-description"
    className={cn('text-sm text-muted-foreground leading-snug', className)}
    {...props}
  />
)

export const FieldError = ({
  ref,
  className,
  children,
  errors,
  ...props
}: React.PropsWithoutRef<
  React.HTMLAttributes<HTMLParagraphElement> & { errors?: ReadonlyArray<string | undefined> }
> &
  React.RefAttributes<HTMLParagraphElement>) => {
  const list = errors?.filter((e): e is string => Boolean(e))
  const body = list && list.length > 0 ? list.join(', ') : children
  if (!body) return null
  return (
    <p
      ref={ref}
      data-slot="field-error"
      // Rendered only while there is an error, so `alert` announces it once
      // as it appears.
      role="alert"
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  )
}

export const FieldGroup = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="field-group"
    role="group"
    className={cn('flex flex-col gap-5', className)}
    {...props}
  />
)

export const FieldSet = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.FieldsetHTMLAttributes<HTMLFieldSetElement>> &
  React.RefAttributes<HTMLFieldSetElement>) => (
  <fieldset
    ref={ref}
    data-slot="field-set"
    className={cn('flex flex-col gap-4 rounded-lg border border-border p-4', className)}
    {...props}
  />
)

export const FieldLegend = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLLegendElement>> &
  React.RefAttributes<HTMLLegendElement>) => (
  <legend
    ref={ref}
    data-slot="field-legend"
    className={cn('px-1 text-sm font-medium leading-none', className)}
    {...props}
  />
)

export const FieldSeparator = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="field-separator"
    role="separator"
    aria-orientation="horizontal"
    className={cn('h-px w-full bg-border', className)}
    {...props}
  />
)

/** Wrapper for label + description + control + error stacked vertically. */
export const FieldContent = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="field-content"
    className={cn('flex min-w-0 flex-col gap-1.5', className)}
    {...props}
  />
)
