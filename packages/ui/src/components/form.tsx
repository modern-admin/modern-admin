// react-hook-form bindings. `Form` (== FormProvider) and `FormField` (a
// `Controller`) are the supported entry points; lay the field out with the
// `Field*` primitives from `./field.js`.
//
// `FormItem` / `FormLabel` / `FormControl` / `FormDescription` /
// `FormMessage` / `useFormField` are a second, context-driven layout system
// that duplicates `Field*`. They are deprecated and will be removed in a
// future major release. Existing consumers remain supported.

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'
import { cn } from '../lib/utils.js'
import { Label } from './label.js'

export const Form = FormProvider

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)

export const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>): React.ReactElement => (
  <FormFieldContext.Provider value={{ name: props.name } as FormFieldContextValue}>
    <Controller {...props} />
  </FormFieldContext.Provider>
)

interface FormItemContextValue {
  id: string
  descriptionId?: string
  messageId?: string
  setDescriptionId: React.Dispatch<React.SetStateAction<string | undefined>>
  setMessageId: React.Dispatch<React.SetStateAction<string | undefined>>
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null)

/** @deprecated Use the `Field*` primitives with `FormField` — see `field.tsx`. */
export const useFormField = (): {
  id: string
  name: string
  formItemId: string
  formDescriptionId: string
  formMessageId: string
  error?: { message?: string }
} => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()
  if (!fieldContext) throw new Error('useFormField must be used within <FormField>')
  if (!itemContext) throw new Error('useFormField must be used within <FormItem>')
  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

/** @deprecated Use the `Field*` primitives with `FormField` — see `field.tsx`. */
export const FormItem = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => {
  const id = React.useId()
  const [descriptionId, setDescriptionId] = React.useState<string>()
  const [messageId, setMessageId] = React.useState<string>()
  return (
    <FormItemContext.Provider
      value={{ id, descriptionId, messageId, setDescriptionId, setMessageId }}
    >
      <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props} />
    </FormItemContext.Provider>
  )
}

/** @deprecated Use the `Field*` primitives with `FormField` — see `field.tsx`. */
export const FormLabel = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof Label>> &
  React.RefAttributes<React.ElementRef<typeof Label>>) => {
  const { error, formItemId } = useFormField()
  return (
    <Label
      ref={ref}
      className={cn(error && 'text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

/** @deprecated Use the `Field*` primitives with `FormField` — see `field.tsx`. */
export const FormControl = ({
  ref,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof Slot>> &
  React.RefAttributes<React.ElementRef<typeof Slot>>) => {
  const { error, formItemId } = useFormField()
  const item = React.useContext(FormItemContext)
  const describedBy =
    [item?.descriptionId, item?.messageId, props['aria-describedby']].filter(Boolean).join(' ') ||
    undefined
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-invalid={!!error}
      {...props}
      aria-describedby={describedBy}
    />
  )
}

/** @deprecated Use the `Field*` primitives with `FormField` — see `field.tsx`. */
export const FormDescription = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLParagraphElement>> &
  React.RefAttributes<HTMLParagraphElement>) => {
  const { formDescriptionId } = useFormField()
  const { setDescriptionId } = React.useContext(FormItemContext)!
  const descriptionId = props.id ?? formDescriptionId
  React.useEffect(() => {
    setDescriptionId(descriptionId)
    return () => setDescriptionId(undefined)
  }, [descriptionId, setDescriptionId])
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

/** @deprecated Use the `Field*` primitives with `FormField` — see `field.tsx`. */
export const FormMessage = ({
  ref,
  className,
  children,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLParagraphElement>> &
  React.RefAttributes<HTMLParagraphElement>) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? '') : children
  const { setMessageId } = React.useContext(FormItemContext)!
  const messageId = props.id ?? formMessageId
  React.useEffect(() => {
    if (!body) return
    setMessageId(messageId)
    return () => setMessageId(undefined)
  }, [Boolean(body), messageId, setMessageId])
  if (!body) return null
  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  )
}
