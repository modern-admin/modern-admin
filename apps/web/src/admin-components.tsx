import * as React from 'react'
import { Input } from '@modern-admin/ui'
import {
  ComponentLoader,
  type PropertyDisplayProps,
  type PropertyEditorProps,
} from '@modern-admin/react'

function ColorPickerEditor({ value, onChange, disabled }: PropertyEditorProps): React.ReactElement {
  const text = typeof value === 'string' ? value : ''
  const normalized = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text) ? text : '#000000'
  return (
    <div className="flex items-center gap-3">
      <Input
        type="color"
        className="h-10 w-14 rounded-md p-1"
        value={normalized}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <Input
        value={text}
        placeholder="#000000"
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

function ColorSwatchShow({ value }: PropertyDisplayProps): React.ReactElement {
  const text = typeof value === 'string' ? value : ''
  if (!text) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-4 rounded border border-border" style={{ backgroundColor: text }} />
      <span>{text.toUpperCase()}</span>
    </span>
  )
}

export const adminComponents = new ComponentLoader()
  .add('color-picker', ColorPickerEditor)
  .add('color-swatch', ColorSwatchShow)
