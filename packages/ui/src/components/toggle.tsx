import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

const toggleVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
      },
      size: {
        default: 'h-9 min-w-9 px-3',
        sm: 'h-8 min-w-8 px-2.5 text-xs',
        lg: 'h-10 min-w-10 px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ToggleProps = React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>

export function Toggle({ className, variant, size, ...props }: ToggleProps): React.ReactElement {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { toggleVariants }
