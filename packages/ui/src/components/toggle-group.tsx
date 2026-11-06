// Segmented control / toolbar of toggles. `type="single"` is the accessible
// replacement for a row of buttons where exactly one is "active": items are
// exposed as radios with roving focus, so the selection is announced and the
// arrow keys move between options.

import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'
import { toggleVariants } from './toggle.js'

type ToggleGroupStyle = VariantProps<typeof toggleVariants>

const ToggleGroupContext = React.createContext<ToggleGroupStyle>({
  variant: 'default',
  size: 'default',
})

export type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  ToggleGroupStyle

export function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: ToggleGroupProps): React.ReactElement {
  const style = React.useMemo(() => ({ variant, size }), [variant, size])
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      className={cn('flex w-fit flex-wrap items-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={style}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

export type ToggleGroupItemProps = React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  ToggleGroupStyle

export function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: ToggleGroupItemProps): React.ReactElement {
  const ctx = React.useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({ variant: variant ?? ctx.variant, size: size ?? ctx.size }),
        className,
      )}
      {...props}
    />
  )
}
