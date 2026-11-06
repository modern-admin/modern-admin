import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cn } from '../lib/utils.js'
import { Spinner } from './spinner.js'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        // Colored outline variants — same chrome as `outline` (border +
        // transparent background, height comes from the size token) but
        // with a semantic tint applied to border, text and hover. Use
        // when grouping a row of action buttons so they share a single
        // visual silhouette while still encoding intent through color.
        'outline-primary':
          'border border-primary/40 bg-background text-primary hover:bg-primary/10 hover:border-primary/60',
        'outline-destructive':
          'border border-destructive/40 bg-background text-destructive hover:bg-destructive/10 hover:border-destructive/60',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        xs: 'h-7 gap-1.5 rounded-md px-2 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
        'icon-xs': 'size-7 [&_svg]:size-3.5',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the button styles onto the single child (e.g. a router link). */
  asChild?: boolean
  /** Disables activation, sets `aria-busy`, and replaces direct SVG icons with a spinner. */
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  onClickCapture,
  ...props
}: ButtonProps): React.ReactElement {
  const Comp = asChild ? Slot : 'button'
  let content: React.ReactNode = children
  if (loading) {
    const spinner = <Spinner key="spinner" />
    if (asChild) {
      // A Slot needs exactly one child element: keep it and inject the
      // spinner inside it via `Slottable`.
      content = [spinner, <Slottable key="content">{children}</Slottable>]
    } else {
      content = (
        <>
          {spinner}
          {children}
        </>
      )
    }
  }
  return (
    <Comp
      data-slot="button"
      data-loading={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant, size }),
        loading && '[&>svg:not([data-slot=spinner])]:hidden',
        className,
      )}
      {...props}
      aria-busy={loading || props['aria-busy'] || undefined}
      aria-disabled={asChild && (disabled || loading) ? true : props['aria-disabled']}
      onClickCapture={(event) => {
        if (asChild && (disabled || loading)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onClickCapture?.(event)
      }}
    >
      {content}
    </Comp>
  )
}

export { buttonVariants }
