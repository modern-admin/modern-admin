// Property-type rendering: maps a PropertyJSON.type to display + form widgets.
// Custom components registered via ComponentLoader take precedence.

import * as React from 'react'
import { Input, Textarea, Select, Badge } from '@modern-admin/ui'
import type { PropertyJSON } from './types.js'
import { useAdminContext } from './provider.js'

const formatDate = (value: unknown): string => {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

export interface PropertyDisplayProps {
  property: PropertyJSON
  value: unknown
  view?: 'list' | 'show'
}

export function PropertyDisplay({ property, value, view = 'list' }: PropertyDisplayProps): React.ReactElement | null {
  const { components } = useAdminContext()
  const componentName = property.components?.[view]
  if (componentName && components?.has(componentName)) {
    const Custom = components.get(componentName)!
    return <Custom property={property} value={value} view={view} />
  }
  if (value == null || value === '') return <span className="text-slate-400">—</span>
  switch (property.type) {
    case 'boolean':
      return <Badge variant={value ? 'default' : 'outline'}>{value ? 'true' : 'false'}</Badge>
    case 'date':
    case 'datetime':
      return <span>{formatDate(value)}</span>
    case 'json':
    case 'mixed':
    case 'key-value':
      return (
        <code className="text-xs text-slate-600">{JSON.stringify(value)}</code>
      )
    case 'reference':
      return <Badge variant="secondary">→ {String(value)}</Badge>
    case 'richtext':
    case 'textarea':
      return <span className="line-clamp-2 text-slate-700">{String(value)}</span>
    default:
      return <span>{String(value)}</span>
  }
}

export interface PropertyEditorProps {
  property: PropertyJSON
  value: unknown
  onChange(next: unknown): void
  disabled?: boolean
}

export function PropertyEditor({
  property,
  value,
  onChange,
  disabled,
}: PropertyEditorProps): React.ReactElement {
  const { components } = useAdminContext()
  const componentName = property.components?.edit
  if (componentName && components?.has(componentName)) {
    const Custom = components.get(componentName)!
    return <Custom property={property} value={value} onChange={onChange} disabled={disabled} />
  }
  const stringValue = value == null ? '' : String(value)
  if (property.availableValues?.length) {
    return (
      <Select
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">—</option>
        {property.availableValues.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    )
  }
  switch (property.type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4"
        />
      )
    case 'number':
    case 'float':
    case 'currency':
      return (
        <Input
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled}
        />
      )
    case 'date':
      return (
        <Input
          type="date"
          value={formatDate(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
    case 'datetime':
      return (
        <Input
          type="datetime-local"
          value={formatDate(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
    case 'richtext':
    case 'textarea':
      return (
        <Textarea
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={5}
        />
      )
    case 'password':
      return (
        <Input
          type="password"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
    default:
      return (
        <Input
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
  }
}
