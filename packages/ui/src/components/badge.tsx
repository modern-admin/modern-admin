import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

const badgeVariants = cva(
  // Hover tints only apply when the badge is rendered as a link or button
  // (`asChild`) — a plain status label is not interactive.
  'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/80 [button&]:hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80 [button&]:hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/80 [button&]:hover:bg-destructive/80',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground [button&]:hover:bg-accent',
        // Tinted status variants — readable in both themes because the
        // status tokens double as text colors.
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        info: 'border-transparent bg-info/15 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Render the badge styles onto the single child (e.g. a router link). */
  asChild?: boolean
}

export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: BadgeProps): React.ReactElement {
  const Comp = asChild ? Slot : 'span'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
