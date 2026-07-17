import * as React from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Input } from './input.js'
import { Button } from './button.js'

export interface ColorSwatchPickerLabels {
  /** Placeholder for the custom hex input. */
  custom?: string
  /** Tooltip / aria for the native color-well trigger. */
  pick?: string
  /** "Reset to automatic palette color" button. */
  auto?: string
}

export interface ColorSwatchPickerProps {
  /** Current override (hex) — undefined means "auto" (palette by index). */
  value?: string
  onChange(next: string | undefined): void
  /** Preset swatches, hex strings. */
  presets: ReadonlyArray<string>
  labels?: ColorSwatchPickerLabels
  className?: string
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Expand `#rgb` → `#rrggbb`; return undefined for anything not a valid hex. */
function expandHex(hex: string | undefined): string | undefined {
  if (!hex || !HEX_RE.test(hex)) return undefined
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return hex
}

/**
 * Preset swatch row + native color-well picker + free hex input +
 * reset-to-auto. i18n-unaware: pass localised strings via `labels`. Emits
 * `undefined` for "auto" and only valid `#rgb` / `#rrggbb` strings otherwise.
 */
export function ColorSwatchPicker({
  value,
  onChange,
  presets,
  labels,
  className,
}: ColorSwatchPickerProps): React.ReactElement {
  const [draft, setDraft] = React.useState(value ?? '')

  // Follow external value changes (e.g. reset from outside).
  React.useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commitDraft = (raw: string): void => {
    setDraft(raw)
    const hex = raw.trim()
    if (hex === '') onChange(undefined)
    else if (HEX_RE.test(hex)) onChange(hex)
  }

  // The native <input type="color"> needs a 6-digit hex; fall back to a
  // neutral value so the picker opens on something sensible when on "auto".
  const wellValue = expandHex(value) ?? '#888888'
  const isCustom = value != null && !presets.includes(value)

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center gap-1.5">
        {presets.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(value === hex ? undefined : hex)}
            className={cn(
              'size-6 rounded-full border transition-shadow',
              value === hex
                ? 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background'
                : 'border-border hover:ring-1 hover:ring-ring',
            )}
            style={{ backgroundColor: hex }}
            aria-label={hex}
            aria-pressed={value === hex}
          />
        ))}
      </div>
      <label
        className={cn(
          'relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border',
          isCustom
            ? 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background'
            : 'border-border hover:ring-1 hover:ring-ring',
        )}
        style={{ backgroundColor: value ?? 'transparent' }}
        title={labels?.pick ?? 'Pick a color'}
      >
        {value == null && (
          <Pipette className="absolute inset-0 m-auto size-4 text-muted-foreground" />
        )}
        <input
          type="color"
          value={wellValue}
          onChange={(e) => commitDraft(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={labels?.pick ?? 'Pick a color'}
        />
      </label>
      <Input
        value={draft}
        onChange={(e) => commitDraft(e.target.value)}
        placeholder={labels?.custom ?? '#8b5cf6'}
        className="h-8 w-24 px-2 font-mono text-xs"
        maxLength={7}
        aria-label={labels?.custom ?? 'Custom color'}
      />
      {value != null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => onChange(undefined)}
        >
          {labels?.auto ?? 'Auto'}
        </Button>
      )}
    </div>
  )
}
