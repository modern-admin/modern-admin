// Property-type rendering: maps a PropertyJSON.type to display + form widgets.
// Custom components registered via ComponentLoader take precedence.

import * as React from 'react'
import {
  Input,
  Textarea,
  Badge,
  Switch,
  DatePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@modern-admin/ui'
import type { PropertyJSON } from './types.js'
import { useAdminContext } from './provider.js'
import {
  ReferenceCombobox,
  ReferenceLink,
  ReferenceLinkList,
  ReferenceMultiCombobox,
} from './reference.js'

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
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>
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
        <code className="text-xs text-muted-foreground">{JSON.stringify(value)}</code>
      )
    case 'reference':
      if (property.reference) {
        if (property.isArray) {
          const ids = Array.isArray(value)
            ? (value as Array<string | number>)
            : []
          return <ReferenceLinkList resourceId={property.reference} recordIds={ids} />
        }
        return (
          <ReferenceLink
            resourceId={property.reference}
            recordId={value as string | number}
            showIcon={view === 'show'}
          />
        )
      }
      return <Badge variant="secondary">{String(value)}</Badge>
    case 'richtext':
    case 'textarea':
      return (
        <span className={view === 'show' ? 'whitespace-pre-wrap text-foreground' : 'line-clamp-2 text-foreground'}>
          {String(value)}
        </span>
      )
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
  if (property.reference) {
    if (property.isArray) {
      const arr = Array.isArray(value)
        ? (value as Array<string | number>)
        : []
      return (
        <ReferenceMultiCombobox
          referenceResourceId={property.reference}
          value={arr}
          onChange={(next) => onChange(next)}
          disabled={disabled}
        />
      )
    }
    return (
      <ReferenceCombobox
        referenceResourceId={property.reference}
        value={value as string | number | null | undefined}
        onChange={(next) => onChange(next)}
        disabled={disabled}
      />
    )
  }
  if (property.availableValues?.length) {
    return (
      <Select value={stringValue} onValueChange={(v) => onChange(v === '_empty_' ? '' : v)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_empty_">—</SelectItem>
          {property.availableValues.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  switch (property.type) {
    case 'boolean':
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(Boolean(v))}
          disabled={disabled}
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
        <DatePicker
          mode="date"
          value={value == null ? '' : String(value)}
          onChange={(v) => onChange(v === '' ? null : v)}
          disabled={disabled}
          ariaLabel={property.label}
        />
      )
    case 'datetime':
    case 'datetime-local':
      return (
        <DatePicker
          mode="datetime"
          value={value == null ? '' : String(value)}
          onChange={(v) => onChange(v === '' ? null : v)}
          disabled={disabled}
          ariaLabel={property.label}
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
