// An input with inline decorations — icons, prefixes, units, buttons — that
// all live inside one bordered box. The group draws the border, focus ring
// and invalid state; the control inside is borderless and fills the rest.
//
//   <InputGroup>
//     <InputGroupAddon><Search /></InputGroupAddon>
//     <InputGroupInput placeholder="Search…" />
//     <InputGroupAddon align="inline-end">
//       <InputGroupButton aria-label="Clear"><X /></InputGroupButton>
//     </InputGroupAddon>
//   </InputGroup>
//
// Because `className` lands on the visible box, width/height utilities
// behave exactly like they do on a plain `<Input>`.

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'
import { Button, type ButtonProps } from './button.js'

/** Shared chrome of every single-line text control in the kit. */
export const inputBoxClassName =
  'rounded-md border border-input bg-background shadow-sm transition-colors'

/** Invalid state for a control that draws its own box (`aria-invalid="true"`). */
export const invalidControlClassName =
  'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/40'

/** Focus/disabled/invalid rules for a group, keyed off its inner control. */
const groupStateClassName =
  'has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:opacity-50 has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control][aria-invalid=true]:focus-visible]:ring-destructive/40'

export function InputGroup({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        inputBoxClassName,
        groupStateClassName,
        'relative flex h-9 w-full min-w-0 items-center has-[>textarea]:h-auto has-[>textarea]:items-stretch',
        className,
      )}
      {...props}
    />
  )
}

const addonVariants = cva(
  'flex h-full shrink-0 cursor-text select-none items-center gap-1.5 text-sm text-muted-foreground [&>svg:not([class*=size-])]:size-4',
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-3 has-[>button]:pl-1',
        'inline-end': 'order-last pr-3 has-[>button]:pr-1',
      },
    },
    defaultVariants: { align: 'inline-start' },
  },
)

export interface InputGroupAddonProps
  extends React.ComponentProps<'div'>, VariantProps<typeof addonVariants> {}

export function InputGroupAddon({
  className,
  align,
  onMouseDown,
  ...props
}: InputGroupAddonProps): React.ReactElement {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align ?? 'inline-start'}
      className={cn(addonVariants({ align }), className)}
      // Clicking decoration text focuses the control, like a label would.
      onMouseDown={(event) => {
        onMouseDown?.(event)
        if (event.defaultPrevented) return
        if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return
        const control = event.currentTarget.parentElement?.querySelector<HTMLElement>(
          '[data-slot=input-group-control]',
        )
        if (control) {
          event.preventDefault()
          control.focus()
        }
      }}
      {...props}
    />
  )
}

export function InputGroupText({
  className,
  ...props
}: React.ComponentProps<'span'>): React.ReactElement {
  return (
    <span
      data-slot="input-group-text"
      className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export function InputGroupButton({
  className,
  variant = 'ghost',
  size = 'icon-xs',
  type = 'button',
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <Button
      data-slot="input-group-button"
      type={type}
      variant={variant}
      size={size}
      className={cn('text-muted-foreground shadow-none hover:text-foreground', className)}
      {...props}
    />
  )
}

/** Borderless control classes — the group owns the chrome. */
export const inputGroupControlClassName =
  'flex h-full w-full min-w-0 flex-1 rounded-[inherit] border-0 bg-transparent px-3 py-1 text-sm shadow-none outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-0 [[data-slot=input-group-addon][data-align=inline-start]~&]:pl-0 [&:has(~[data-slot=input-group-addon][data-align=inline-end])]:pr-0'

export function InputGroupInput({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>): React.ReactElement {
  return (
    <input
      data-slot="input-group-control"
      type={type ?? 'text'}
      className={cn(inputGroupControlClassName, className)}
      {...props}
    />
  )
}

export function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>): React.ReactElement {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(inputGroupControlClassName, 'min-h-16 resize-none py-2', className)}
      {...props}
    />
  )
}
