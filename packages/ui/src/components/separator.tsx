import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '../lib/utils.js'

export const Separator = ({
  ref,
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>> &
  React.RefAttributes<React.ElementRef<typeof SeparatorPrimitive.Root>>) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
)
