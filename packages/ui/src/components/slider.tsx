import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../lib/utils.js'

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /**
   * Accessible names for the thumbs, in order (`['Minimum', 'Maximum']` for a
   * range). A single-thumb slider can rely on `aria-label` instead.
   */
  thumbLabels?: ReadonlyArray<string>
}

export function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  'aria-label': ariaLabel,
  ...props
}: SliderProps): React.ReactElement {
  // One thumb per value; fall back to a single thumb at `min`.
  const thumbs = (value ?? defaultValue ?? [min]).length
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          data-slot="slider-thumb"
          aria-label={thumbLabels?.[i] ?? ariaLabel}
          className="block size-4 shrink-0 cursor-grab rounded-full border border-primary bg-background shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  )
}
