// Visually joins adjacent buttons (and inputs/selects) into one control:
// shared borders, rounded only at the outer ends.
//
//   <ButtonGroup aria-label="Zoom">
//     <Button variant="outline" size="icon-sm"><Minus /></Button>
//     <Button variant="outline" size="icon-sm"><Plus /></Button>
//   </ButtonGroup>

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

const buttonGroupVariants = cva(
  'flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10',
  {
    variants: {
      orientation: {
        horizontal:
          '[&>*:not(:first-child)]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none',
        vertical:
          'flex-col [&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none',
      },
    },
    defaultVariants: { orientation: 'horizontal' },
  },
)

export interface ButtonGroupProps
  extends React.ComponentProps<'div'>, VariantProps<typeof buttonGroupVariants> {}

export function ButtonGroup({
  className,
  orientation,
  ...props
}: ButtonGroupProps): React.ReactElement {
  return (
    <div
      data-slot="button-group"
      role="group"
      data-orientation={orientation ?? 'horizontal'}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  )
}

export { buttonGroupVariants }
