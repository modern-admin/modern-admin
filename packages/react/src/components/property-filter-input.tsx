import * as React from 'react'
import { Search } from 'lucide-react'
import {
  Checkbox,
  DatePicker,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  dateFnsLocale,
} from '@modern-admin/ui'
import { useDistinctValues } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { ReferenceCombobox } from '../reference.js'
import type { PropertyJSON } from '../types.js'
import {
  ALL_DATE_OPS,
  ALL_NUMERIC_OPS,
  ALL_REFERENCE_OPS,
  ALL_STRING_OPS,
  type DateFilterOp,
  DATE_NULLARY,
  encodeDateFilter,
  encodeFilter,
  encodeNumericFilter,
  encodeReferenceFilter,
  type NumericFilterOp,
  NUMERIC_NULLARY,
  NULLARY_OPS,
  ONE_OF_DEFAULT_MAX,
  parseDateFilter,
  parseFilterString,
  parseNumericFilter,
  parseReferenceFilter,
  type ReferenceFilterOp,
  REFERENCE_NULLARY,
  type StringFilterOp,
} from '../pages/filter-codecs.js'

export interface PropertyFilterInputProps {
  property: PropertyJSON
  resourceId: string
  value: string
  onChange(next: string): void
  inputId?: string
}

export function PropertyFilterInput({
  property,
  resourceId,
  value,
  onChange,
  inputId,
}: PropertyFilterInputProps): React.ReactElement {
  const { t } = useI18n()

  if (property.type === 'date' || property.type === 'datetime') {
    return (
      <DateFilterInput mode={property.type} value={value} onChange={onChange} inputId={inputId} />
    )
  }
  if (property.reference && !property.isArray) {
    return (
      <ReferenceFilterInput
        referenceResourceId={property.reference}
        value={value}
        onChange={onChange}
        inputId={inputId}
      />
    )
  }
  if (property.availableValues?.length) {
    return (
      <ChoiceFilterInput
        value={value}
        onChange={onChange}
        inputId={inputId}
        choices={property.availableValues}
      />
    )
  }
  if (property.type === 'boolean') {
    return (
      <ChoiceFilterInput
        value={value}
        onChange={onChange}
        inputId={inputId}
        choices={[
          { value: 'true', label: t('common:yes') },
          { value: 'false', label: t('common:no') },
        ]}
      />
    )
  }
  if (
    property.type === 'number' ||
    property.type === 'float' ||
    property.type === 'money' ||
    property.type === 'currency'
  ) {
    return <NumericFilterInput value={value} onChange={onChange} inputId={inputId} />
  }
  return (
    <StringFilterInput
      property={property}
      resourceId={resourceId}
      value={value}
      onChange={onChange}
      inputId={inputId}
    />
  )
}

function OperatorSelect<T extends string>({
  value,
  options,
  onChange,
  inputId,
}: {
  value: T
  options: readonly T[]
  onChange(next: T): void
  inputId?: string
}): React.ReactElement {
  const { t } = useI18n()
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={inputId} className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {t(`filter:op.${option}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function ReferenceFilterInput({
  referenceResourceId,
  value,
  onChange,
  inputId,
}: {
  referenceResourceId: string
  value: string
  onChange(next: string): void
  inputId?: string
}): React.ReactElement {
  const { t } = useI18n()
  const parsed = parseReferenceFilter(value)
  const [op, setOp] = React.useState<ReferenceFilterOp>(parsed.op)
  const [selected, setSelected] = React.useState(parsed.val)

  React.useEffect(() => {
    const next = parseReferenceFilter(value)
    setOp(next.op)
    setSelected(next.val)
  }, [value])

  const emit = (nextOp: ReferenceFilterOp, nextValue: string) => {
    setOp(nextOp)
    setSelected(nextValue)
    onChange(encodeReferenceFilter(nextOp, nextValue))
  }

  return (
    <FieldGroup className="gap-2">
      <OperatorSelect
        value={op}
        options={ALL_REFERENCE_OPS}
        onChange={(next) => emit(next, REFERENCE_NULLARY.has(next) ? '' : selected)}
        inputId={inputId}
      />
      {!REFERENCE_NULLARY.has(op) && (
        <ReferenceCombobox
          referenceResourceId={referenceResourceId}
          value={selected || null}
          onChange={(next) => emit(op, next == null ? '' : String(next))}
          placeholder={t('common:any')}
        />
      )}
    </FieldGroup>
  )
}

function ChoiceFilterInput({
  value,
  onChange,
  choices,
  inputId,
}: {
  value: string
  onChange(next: string): void
  choices: Array<{ value: string; label: string }>
  inputId?: string
}): React.ReactElement {
  const { t } = useI18n()
  const parsed = parseReferenceFilter(value)
  const [op, setOp] = React.useState<ReferenceFilterOp>(parsed.op)
  const [selected, setSelected] = React.useState(parsed.val)

  React.useEffect(() => {
    const next = parseReferenceFilter(value)
    setOp(next.op)
    setSelected(next.val)
  }, [value])

  const emit = (nextOp: ReferenceFilterOp, nextValue: string) => {
    setOp(nextOp)
    setSelected(nextValue)
    onChange(encodeReferenceFilter(nextOp, nextValue))
  }

  return (
    <FieldGroup className="gap-2">
      <OperatorSelect
        value={op}
        options={ALL_REFERENCE_OPS}
        onChange={(next) => emit(next, REFERENCE_NULLARY.has(next) ? '' : selected)}
        inputId={inputId}
      />
      {!REFERENCE_NULLARY.has(op) && (
        <Select
          value={selected || '_any_'}
          onValueChange={(next) => emit(op, next === '_any_' ? '' : next)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder={t('common:any')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="_any_">{t('common:any')}</SelectItem>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </FieldGroup>
  )
}

function NumericFilterInput({
  value,
  onChange,
  inputId,
}: {
  value: string
  onChange(next: string): void
  inputId?: string
}): React.ReactElement {
  const { t } = useI18n()
  const parsed = parseNumericFilter(value)
  const [op, setOp] = React.useState<NumericFilterOp>(parsed.op)
  const [from, setFrom] = React.useState(parsed.from)
  const [to, setTo] = React.useState(parsed.to)

  React.useEffect(() => {
    const next = parseNumericFilter(value)
    setOp(next.op)
    setFrom(next.from)
    setTo(next.to)
  }, [value])

  const emit = (nextOp: NumericFilterOp, nextFrom: string, nextTo: string) => {
    setOp(nextOp)
    setFrom(nextFrom)
    setTo(nextTo)
    onChange(encodeNumericFilter(nextOp, nextFrom, nextTo))
  }

  return (
    <FieldGroup className="gap-2">
      <OperatorSelect
        value={op}
        options={ALL_NUMERIC_OPS}
        onChange={(next) => emit(next, from, next === 'between' ? to : '')}
        inputId={inputId}
      />
      {op === 'between' ? (
        <div className="flex gap-2">
          <Input
            type="number"
            className="h-8"
            value={from}
            placeholder={t('common:from')}
            onChange={(event) => emit('between', event.target.value, to)}
          />
          <Input
            type="number"
            className="h-8"
            value={to}
            placeholder={t('common:to')}
            onChange={(event) => emit('between', from, event.target.value)}
          />
        </div>
      ) : !NUMERIC_NULLARY.has(op) ? (
        <Input
          type="number"
          className="h-8"
          value={from}
          placeholder={t('common:any')}
          onChange={(event) => emit(op, event.target.value, '')}
        />
      ) : null}
    </FieldGroup>
  )
}

function DateFilterInput({
  mode,
  value,
  onChange,
  inputId,
}: {
  mode: 'date' | 'datetime'
  value: string
  onChange(next: string): void
  inputId?: string
}): React.ReactElement {
  const { t, locale: uiLocale } = useI18n()
  const locale = dateFnsLocale(uiLocale)
  const parsed = parseDateFilter(value)
  const [op, setOp] = React.useState<DateFilterOp>(parsed.op)
  const [from, setFrom] = React.useState(parsed.from)
  const [to, setTo] = React.useState(parsed.to)

  React.useEffect(() => {
    const next = parseDateFilter(value)
    setOp(next.op)
    setFrom(next.from)
    setTo(next.to)
  }, [value])

  const emit = (nextOp: DateFilterOp, nextFrom: string, nextTo: string) => {
    setOp(nextOp)
    setFrom(nextFrom)
    setTo(nextTo)
    onChange(encodeDateFilter(nextOp, nextFrom, nextTo))
  }

  return (
    <FieldGroup className="gap-2">
      <OperatorSelect
        value={op}
        options={ALL_DATE_OPS}
        onChange={(next) => emit(next, from, to)}
        inputId={inputId}
      />
      {!DATE_NULLARY.has(op) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">{t('common:from')}</FieldLabel>
            <DatePicker
              mode={mode}
              value={from}
              onChange={(next) => emit('between', next, to)}
              ariaLabel={t('common:from')}
              locale={locale}
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">{t('common:to')}</FieldLabel>
            <DatePicker
              mode={mode}
              value={to}
              onChange={(next) => emit('between', from, next)}
              ariaLabel={t('common:to')}
              locale={locale}
            />
          </Field>
        </div>
      )}
    </FieldGroup>
  )
}

function StringFilterInput({
  property,
  resourceId,
  value,
  onChange,
  inputId,
}: {
  property: PropertyJSON
  resourceId: string
  value: string
  onChange(next: string): void
  inputId?: string
}): React.ReactElement {
  const { t } = useI18n()
  const parsed = parseFilterString(value)
  const [op, setOp] = React.useState<StringFilterOp>(parsed.op)
  const [text, setText] = React.useState(parsed.val)
  const { data: distinctData } = useDistinctValues(resourceId, property.path, { limit: 101 })
  const distinctValues = distinctData?.values ?? []
  const isLowCardinality = distinctData != null && !distinctData.hasMore
  const shouldDefaultToOneOf =
    isLowCardinality && distinctValues.length > 0 && distinctValues.length <= ONE_OF_DEFAULT_MAX
  const autoSwitchedRef = React.useRef(false)

  React.useEffect(() => {
    const next = parseFilterString(value)
    setOp(next.op)
    setText(next.val)
  }, [value])

  React.useEffect(() => {
    if (autoSwitchedRef.current) return
    if (shouldDefaultToOneOf && !value && op === 'co' && text === '') {
      autoSwitchedRef.current = true
      setOp('in')
    }
  }, [shouldDefaultToOneOf, value, op, text])

  const emit = (nextOp: StringFilterOp, nextValue: string) => {
    setOp(nextOp)
    setText(nextValue)
    onChange(encodeFilter(nextOp, nextValue))
  }

  return (
    <FieldGroup className="gap-2">
      <OperatorSelect
        value={op}
        options={ALL_STRING_OPS}
        onChange={(next) => {
          if (NULLARY_OPS.has(next) || next === 'in') emit(next, '')
          else emit(next, op === 'in' ? '' : text)
        }}
        inputId={inputId}
      />
      {op === 'in' ? (
        <FilterValuePicker
          resourceId={resourceId}
          field={property.path}
          selected={text ? text.split(',') : []}
          onChange={(selected) => emit('in', selected.join(','))}
          preloadedValues={isLowCardinality ? distinctValues : undefined}
        />
      ) : !NULLARY_OPS.has(op) ? (
        <Input
          className="h-8"
          value={text}
          placeholder={t('common:filterPlaceholder')}
          onChange={(event) => emit(op, event.target.value)}
        />
      ) : null}
    </FieldGroup>
  )
}

function FilterValuePicker({
  resourceId,
  field,
  selected,
  onChange,
  preloadedValues,
}: {
  resourceId: string
  field: string
  selected: string[]
  onChange(selected: string[]): void
  preloadedValues?: string[]
}): React.ReactElement {
  const { t } = useI18n()
  const [search, setSearch] = React.useState('')
  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const needsServerSearch = preloadedValues == null
  const { data: serverData, isLoading } = useDistinctValues(resourceId, field, {
    search: needsServerSearch ? search : undefined,
    limit: 100,
    enabled: needsServerSearch,
  })
  const displayValues = React.useMemo(() => {
    const values = preloadedValues ?? serverData?.values ?? []
    if (!preloadedValues || !search) return values
    const normalizedSearch = search.toLowerCase()
    return values.filter((item) => item.toLowerCase().includes(normalizedSearch))
  }, [preloadedValues, serverData?.values, search])

  const toggle = (item: string) => {
    onChange(
      selectedSet.has(item)
        ? selected.filter((selectedItem) => selectedItem !== item)
        : [...selected, item],
    )
  }

  const handleSelectAll = () => {
    const allSelected =
      displayValues.length > 0 && displayValues.every((item) => selectedSet.has(item))
    if (allSelected) {
      const visible = new Set(displayValues)
      onChange(selected.filter((item) => !visible.has(item)))
      return
    }
    onChange(Array.from(new Set([...selected, ...displayValues])))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-7 pl-7 text-xs"
          value={search}
          placeholder={t('filter:searchValues')}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {displayValues.length > 0 && (
        <div
          role="checkbox"
          aria-checked={
            displayValues.every((item) => selectedSet.has(item))
              ? true
              : displayValues.some((item) => selectedSet.has(item))
                ? 'mixed'
                : false
          }
          tabIndex={0}
          className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleSelectAll}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              handleSelectAll()
            }
          }}
        >
          <Checkbox
            className="pointer-events-none size-3.5"
            tabIndex={-1}
            aria-hidden="true"
            checked={
              displayValues.every((item) => selectedSet.has(item))
                ? true
                : displayValues.some((item) => selectedSet.has(item))
                  ? 'indeterminate'
                  : false
            }
          />
          {t('filter:selectAll')}
        </div>
      )}
      <div className="max-h-48 overflow-y-auto">
        {isLoading && !preloadedValues ? (
          <p className="py-2 text-center text-xs text-muted-foreground">{t('common:loading')}</p>
        ) : displayValues.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">{t('filter:noValues')}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {displayValues.map((item) => (
              <div
                key={item}
                role="checkbox"
                aria-checked={selectedSet.has(item)}
                tabIndex={0}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent"
                onClick={() => toggle(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggle(item)
                  }
                }}
              >
                <Checkbox
                  className="pointer-events-none size-3.5"
                  tabIndex={-1}
                  aria-hidden="true"
                  checked={selectedSet.has(item)}
                />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('common:selectedCount', { count: selected.length })}
        </p>
      )}
    </div>
  )
}
