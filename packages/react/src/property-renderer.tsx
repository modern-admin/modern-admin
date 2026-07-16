// Property-type rendering: maps a PropertyJSON.type to display + form widgets.
// Custom components registered via ComponentLoader take precedence.

import * as React from 'react'
import {
  Button,
  Input,
  PasswordInput,
  Textarea,
  Badge,
  FileInput,
  MultiFileInput,
  type MultiFileInputPendingItem,
  Switch,
  DatePicker,
  JsonEditor,
  JsonView,
  KeyValueEditor,
  KeyValueView,
  MediaPreview,
  type RichtextEditorProps,
  RichtextRender,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@modern-admin/ui'
import { Check, Copy } from 'lucide-react'
import { uuidv7 } from '@modern-admin/core'
import { useQueries } from '@tanstack/react-query'
import type {
  KeyValueFieldSpec,
  PropertyDisplayProps,
  PropertyEditorProps,
  PropertyJSON,
} from './types.js'
import { getPropertyExtension } from './extension-registry.js'
import { useAdminContext, useAdminClient } from './provider.js'
import { useI18n } from './i18n.js'
import { useNotify } from './notify.js'
import {
  ReferenceCombobox,
  ReferenceLink,
  ReferenceLinkList,
  ReferenceMultiCombobox,
} from './reference.js'
import { ReferenceMultiTableDialog } from './components/reference-multi-table-dialog.js'
import { useResource } from './hooks.js'

// The tiptap-based editor lives in its own async chunk (see heavy-fields.ts)
// so record forms without richtext/markdown properties never pay for it.
// The skeleton mirrors the editor's footprint to avoid layout shift.
const RichtextEditorImpl = React.lazy(() =>
  import('./heavy-fields.js').then((m) => ({ default: m.RichtextEditor })),
)

function LazyRichtextEditor(props: RichtextEditorProps): React.ReactElement {
  return (
    <React.Suspense
      fallback={
        <div
          role="status"
          aria-busy="true"
          className="min-h-40 w-full animate-pulse rounded-md border border-border bg-muted/30"
        />
      }
    >
      <RichtextEditorImpl {...props} />
    </React.Suspense>
  )
}

export const formatDate = (value: unknown, withTime = false): string => {
  if (value == null) return ''
  // date-only → YYYY-MM-DD; datetime → YYYY-MM-DD HH:MM (UTC, minute precision)
  const render = (d: Date): string =>
    withTime ? d.toISOString().slice(0, 16).replace('T', ' ') : d.toISOString().slice(0, 10)
  if (value instanceof Date) return render(value)
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return render(d)
}

export const formatMoneyValue = (
  value: unknown,
  currency?: string,
  locale?: string,
): string => {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return String(value ?? '')
  try {
    if (!currency) {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}

const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null
}

function CopiableDisplay({
  text,
  children,
}: {
  text: string
  children: React.ReactNode
}): React.ReactElement {
  const { t } = useI18n()
  const notify = useNotify()
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 3_000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      notify.error({ key: 'settings:apiKeys.notice.copyFailed' })
    }
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2 align-middle">
      <span className="min-w-0">{children}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => void onCopy()}
            aria-label={copied ? t('settings:apiKeys.created.copied') : t('settings:apiKeys.created.copy')}
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? t('settings:apiKeys.created.copied') : t('settings:apiKeys.created.copy')}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

// PropertyDisplayProps is defined in types.ts (shared with extension-registry).
// Re-exported here for backwards compat.
export type { PropertyDisplayProps } from './types.js'

function ListCellText({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      className="max-w-full overflow-hidden break-words text-foreground"
      style={{
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 5,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </span>
  )
}

export function PropertyDisplay({ property, value, view = 'list', populated }: PropertyDisplayProps): React.ReactElement | null {
  const { components } = useAdminContext()
  const { t, locale } = useI18n()
  const copiable = view === 'show' && (property.isId === true || property.custom?.copiable === true)
  const withCopy = (content: React.ReactElement): React.ReactElement =>
    copiable ? <CopiableDisplay text={String(value)}>{content}</CopiableDisplay> : content
  const componentName = property.components?.[view]
  if (componentName && components?.has(componentName)) {
    const Custom = components.get(componentName)!
    return <Custom property={property} value={value} view={view} />
  }
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>
  switch (property.type) {
  case 'boolean':
    return <Badge variant={value ? 'default' : 'outline'}>{value ? t('common:yes') : t('common:no')}</Badge>
  case 'date':
  case 'datetime': {
    const withTime = property.type === 'datetime'
    const formatted = formatDate(value, withTime)
    return withCopy(view === 'list' ? <ListCellText>{formatted}</ListCellText> : <span>{formatted}</span>)
  }
  case 'money': {
    const currency = typeof property.custom?.currency === 'string'
      ? property.custom.currency
      : undefined
    return withCopy(
      view === 'list'
        ? <ListCellText>{formatMoneyValue(value, currency, locale)}</ListCellText>
        : <span>{formatMoneyValue(value, currency, locale)}</span>,
    )
  }
  case 'json':
  case 'mixed':
  case 'key-value':
    if (property.keyValueFields?.length) {
      return (
        <KeyValueView
          fields={property.keyValueFields}
          value={value}
          variant={view === 'list' ? 'inline' : 'block'}
          labels={{
            emptyValue: '—',
            trueLabel: t('common:yes'),
            falseLabel: t('common:no'),
          }}
        />
      )
    }
    return <JsonView value={value} inline={view === 'list'} />

  case 'reference':
    if (property.reference) {
      if (property.isArray) {
        const ids = Array.isArray(value)
          ? (value as Array<string | number>)
          : []
        return (
          <ReferenceLinkList
            resourceId={property.reference}
            recordIds={ids}
            populated={populated}
            populatedKeyPrefix={property.path}
          />
        )
      }
      const populatedRecord = populated?.[property.path] as
          | { id?: string; title?: string }
          | undefined
      return (
        <ReferenceLink
          resourceId={property.reference}
          recordId={value as string | number}
          showIcon={view === 'show'}
          populated={populatedRecord}
        />
      )
    }
    return <Badge variant="secondary">{String(value)}</Badge>
  case 'm2m': {
    const items = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
    const m2m = property.custom?.m2m as
        | { reference: string; extraFields?: string[] }
        | undefined
    const reference = m2m?.reference ?? property.reference
    const ids = items.map((i) => String(i.id ?? ''))
    if (!reference) return <span className="text-muted-foreground">—</span>
    if (items.length === 0) return <span className="text-muted-foreground">—</span>
    const extras = m2m?.extraFields ?? []
    if (view === 'list' || extras.length === 0) {
      return (
        <ReferenceLinkList
          resourceId={reference}
          recordIds={ids}
          populated={populated}
          populatedKeyPrefix={property.path}
        />
      )
    }
    return (
      <div className="space-y-1">
        {items.map((it) => {
          const populatedRef = populated?.[`${property.path}.${it.id}`] as
              | { id?: string; title?: string }
              | undefined
          return (
            <div key={String(it.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ReferenceLink
                resourceId={reference}
                recordId={String(it.id)}
                populated={populatedRef}
              />
              {extras.map((f) =>
                it[f] != null && it[f] !== '' ? (
                  <span key={f} className="text-xs text-muted-foreground">
                    {f}:{' '}
                    <span className="text-foreground">{String(it[f])}</span>
                  </span>
                ) : null,
              )}
            </div>
          )
        })}
      </div>
    )
  }
  case 'richtext':
    if (view === 'show') {
      return <RichtextRender value={String(value)} format="html" />
    }
    // List view: strip HTML tags for a compact preview.
    return (
      <ListCellText>
        {String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
      </ListCellText>
    )
  case 'markdown':
    if (view === 'show') {
      return <RichtextRender value={String(value)} format="markdown" />
    }
    return (
      <ListCellText>
        {String(value).replace(/[#>*_`~-]/g, '').replace(/\s+/g, ' ').trim()}
      </ListCellText>
    )
  case 'textarea':
    return withCopy(
      view === 'show'
        ? <span className="whitespace-pre-wrap text-foreground">{String(value)}</span>
        : <ListCellText>{String(value)}</ListCellText>,
    )
  case 'color': {
    const color = normalizeHexColor(value)
    if (!color) {
      return withCopy(view === 'list' ? <ListCellText>{String(value)}</ListCellText> : <span>{String(value)}</span>)
    }
    return withCopy(
      <span className="inline-flex items-center gap-2">
        <span className="size-3 rounded-full border border-border" style={{ backgroundColor: color }} />
        <span>{color.toUpperCase()}</span>
      </span>,
    )
  }
  case 'previewMedia': {
    const url = String(value)
    const labels = {
      preview: t('common:preview'),
      download: t('common:download'),
      openInNewTab: t('common:openInNewTab'),
      title: property.label || t('common:preview'),
    }
    return (
      <MediaPreview
        url={url}
        labels={labels}
        showUrl={view === 'show'}
        triggerSize="sm"
        triggerVariant="outline"
      />
    )
  }
  case 'file': {
    const template = property.custom?.uploadUrlTemplate as string | undefined
    const renderOne = (rawKey: string, idx?: number): React.ReactElement => {
      const url = template
        ? template.replace('{key}', rawKey)
        : rawKey.startsWith('http')
          ? rawKey
          : null
      const filename = rawKey.split('/').pop() ?? rawKey
      if (url) {
        const labels = {
          preview: t('common:preview'),
          download: t('common:download'),
          openInNewTab: t('common:openInNewTab'),
          title: filename,
        }
        return (
          <MediaPreview
            key={idx ?? rawKey}
            url={url}
            downloadName={filename}
            labels={labels}
            showUrl={view === 'show'}
            triggerSize="sm"
            triggerVariant="outline"
          />
        )
      }
      return (
        <span key={idx ?? rawKey} className="text-sm text-muted-foreground">
          {filename}
        </span>
      )
    }
    if (Array.isArray(value)) {
      const arr = value as Array<unknown>
      if (arr.length === 0) return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex flex-wrap items-center gap-2">
          {arr.map((v, i) => renderOne(String(v), i))}
        </div>
      )
    }
    return renderOne(String(value))
  }
  default: {
    // Check the extension registry for a custom type before falling back to plain text.
    const ext = getPropertyExtension(property.type)
    if (ext) return <ext.display property={property} value={value} view={view} populated={populated} />
    return withCopy(view === 'list' ? <ListCellText>{String(value)}</ListCellText> : <span>{String(value)}</span>)
  }
  }
}

// PropertyEditorProps is defined in types.ts (shared with extension-registry).
// Re-exported here for backwards compat.
export type { PropertyEditorProps } from './types.js'

// ─── File upload editor ───────────────────────────────────────────────────────

interface FilePropertyEditorProps {
  property: PropertyJSON
  value: unknown
  onChange(next: unknown): void
  disabled?: boolean
  resourceId?: string
}

/** Build the public URL for a stored key, using `{key}` substitution. */
const urlForKey = (key: string, template: string | undefined): string | null => {
  if (template) return template.replace('{key}', key)
  if (key.startsWith('http')) return key
  return null
}

/**
 * Local pending state for one in-flight upload. A small `id` (set on first
 * insertion and never re-used) keys the React row so progress updates do not
 * disturb the list ordering.
 */
interface PendingUpload {
  id: string
  name: string
  progress: number
  status: 'queued' | 'uploading' | 'error'
  error?: string
}

const newPendingId = (): string => uuidv7()

function FilePropertyEditor({
  property,
  value,
  onChange,
  disabled,
  resourceId,
}: FilePropertyEditorProps): React.ReactElement {
  const client = useAdminClient()
  const { t } = useI18n()
  const isArray = Boolean(property.isArray)
  const [pending, setPending] = React.useState<PendingUpload[]>([])
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  // Map of key → freshly-uploaded URL (so we can render previews without
  // waiting for the form to re-fetch), and the set of keys that were uploaded
  // in this editing session and have not yet been "saved" by submitting the
  // form. The latter is used to fire `cancelUpload` when the user removes a
  // pending file before saving.
  const [uploadedUrls, setUploadedUrls] = React.useState<Record<string, string>>({})
  const pendingKeysRef = React.useRef<Set<string>>(new Set())

  const template = property.custom?.uploadUrlTemplate as string | undefined
  const accept =
    (property.custom?.uploadMimeTypes as string[] | null | undefined)?.join(',') ?? undefined

  // Normalise current value into an array of keys for uniform handling.
  const currentKeys: string[] = React.useMemo(() => {
    if (isArray) {
      return Array.isArray(value)
        ? (value as unknown[]).flatMap((v) => (v == null || v === '' ? [] : [String(v)]))
        : []
    }
    return value == null || value === '' ? [] : [String(value)]
  }, [value, isArray])

  const currentKeysRef = React.useRef(currentKeys)
  React.useEffect(() => {
    currentKeysRef.current = currentKeys
  }, [currentKeys])

  const cancelIfPending = React.useCallback(
    (key: string): void => {
      if (!resourceId) return
      if (!pendingKeysRef.current.has(key)) return
      pendingKeysRef.current.delete(key)
      void client.cancelUpload(resourceId, property.path, key).catch(() => {
        // Best-effort — server-side TTL sweeper handles missed cancellations.
      })
    },
    [client, resourceId, property.path],
  )

  const startUploads = async (files: File[]): Promise<void> => {
    if (!resourceId) {
      setUploadError('resourceId is required for file upload')
      return
    }
    setUploadError(null)
    // For single-value fields, only the first file matters; the rest are
    // dropped before they ever hit the network.
    const accepted = isArray ? files : files.slice(0, 1)
    if (accepted.length === 0) return
    // Pre-allocate one pending row per file; the index correlates with the
    // upload index used by per-item callbacks.
    const ids = accepted.map(() => newPendingId())
    setPending((prev) => [
      ...prev,
      ...accepted.map((f, i) => ({
        id: ids[i]!,
        name: f.name,
        progress: 0,
        status: 'queued' as const,
      })),
    ])

    await client.uploadFiles(resourceId, property.path, accepted, {
      concurrency: 3,
      onItemStart: (i) => {
        setPending((prev) =>
          prev.map((p) => (p.id === ids[i] ? { ...p, status: 'uploading' } : p)),
        )
      },
      onItemProgress: (i, _f, p) => {
        setPending((prev) =>
          prev.map((row) => (row.id === ids[i] ? { ...row, progress: p.percent } : row)),
        )
      },
      onItemComplete: (i, _f, info) => {
        setPending((prev) => prev.filter((p) => p.id !== ids[i]))
        setUploadedUrls((u) => ({ ...u, [info.key]: info.url }))
        pendingKeysRef.current.add(info.key)
        if (isArray) {
          const next = [...currentKeysRef.current, info.key]
          currentKeysRef.current = next
          onChange(next)
        } else {
          // Single value: cancel any previously-staged key being replaced.
          for (const old of currentKeysRef.current) cancelIfPending(old)
          currentKeysRef.current = [info.key]
          onChange(info.key)
        }
      },
      onItemError: (i, _f, err) => {
        setPending((prev) =>
          prev.map((p) =>
            p.id === ids[i] ? { ...p, status: 'error', error: err.message } : p,
          ),
        )
      },
    })
  }

  const dismissPending = (id: string): void => {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  const removeAt = (index: number): void => {
    const key = currentKeys[index]
    if (key) cancelIfPending(key)
    if (isArray) {
      const next = currentKeys.filter((_, i) => i !== index)
      onChange(next)
    } else {
      onChange(null)
    }
    setUploadError(null)
  }

  const stillUploading = pending.some((p) => p.status !== 'error')

  if (isArray) {
    const items = currentKeys.map((key) => ({
      value: key,
      previewUrl: uploadedUrls[key] ?? urlForKey(key, template),
    }))
    const pendingItems: MultiFileInputPendingItem[] = pending.map((p) => ({
      id: p.id,
      name: p.name,
      progress: p.status === 'error' ? undefined : p.progress,
      status: p.status,
      error: p.error,
    }))
    return (
      <MultiFileInput
        items={items}
        pendingItems={pendingItems}
        accept={accept}
        error={uploadError ?? undefined}
        disabled={disabled}
        labels={{
          chooseFiles: t('common:chooseFiles'),
          dragAndDrop: t('common:dragAndDrop'),
          chooseLink: t('common:chooseAFile'),
          addMoreLink: t('common:addMoreFiles'),
          uploading: t('common:uploading'),
          removeFile: t('common:removeFile'),
          uploadFailed: t('common:uploadFailed'),
          dismiss: t('common:dismiss'),
        }}
        onFilesSelect={(files) => {
          void startUploads(files)
        }}
        onRemove={removeAt}
        onPendingDismiss={dismissPending}
      />
    )
  }

  const storedKey = currentKeys[0] ?? null
  const previewUrl = storedKey ? (uploadedUrls[storedKey] ?? urlForKey(storedKey, template)) : null
  // For single-value fields we surface the latest in-flight upload's progress
  // through the simple FileInput's `uploading` flag. The detailed progress UI
  // lives in MultiFileInput.
  const activePending = pending.find((p) => p.status === 'uploading') ?? pending.find((p) => p.status === 'queued')
  const erroredPending = pending.find((p) => p.status === 'error')
  return (
    <FileInput
      value={storedKey}
      previewUrl={previewUrl}
      accept={accept}
      uploading={stillUploading}
      uploadProgress={activePending?.progress}
      uploadingName={activePending?.name}
      error={uploadError ?? erroredPending?.error ?? undefined}
      disabled={disabled}
      labels={{
        chooseFile: t('common:chooseFile'),
        dragAndDrop: t('common:dragAndDrop'),
        chooseAFile: t('common:chooseAFile'),
        uploading: t('common:uploading'),
        uploadingFile: t('common:uploadingFile'),
        removeFile: t('common:removeFile'),
      }}
      onFileSelect={(f) => {
        void startUploads([f])
      }}
      onRemove={() => removeAt(0)}
    />
  )
}

// ─── M2M editor ───────────────────────────────────────────────────────────────

interface M2MItemValue extends Record<string, unknown> {
  id: string
}

/**
 * Editor for many-to-many properties registered by `m2mFeature`. Wraps the
 * existing `ReferenceMultiCombobox` for picking referenced records, then
 * (when the relation has extra junction columns) renders a per-item row of
 * nested `PropertyEditor`s — one per extra field, typed from the junction
 * resource's own property declarations.
 */
function M2MPropertyEditor({
  property,
  value,
  onChange,
  disabled,
}: PropertyEditorProps): React.ReactElement {
  const m2m = property.custom?.m2m as
    | {
        reference: string
        through: string
        extraFields?: string[]
      }
    | undefined
  const junction = useResource(m2m?.through)
  if (!m2m?.reference) return <span className="text-muted-foreground">—</span>
  const items: M2MItemValue[] = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>).flatMap((entry) => {
      if (entry == null) return []
      if (typeof entry === 'string' || typeof entry === 'number') {
        return [{ id: String(entry) }]
      }
      if (typeof entry === 'object' && entry.id != null) {
        return [{ ...entry, id: String((entry as { id: unknown }).id) }]
      }
      return []
    })
    : []
  const ids = items.map((i) => String(i.id))
  const extras = m2m.extraFields ?? []

  const setIds = (nextIds: Array<string | number>): void => {
    const byId = new Map<string, M2MItemValue>(items.map((i) => [String(i.id), i]))
    const next = nextIds.map((rawId) => {
      const id = String(rawId)
      return byId.get(id) ?? ({ id } as M2MItemValue)
    })
    onChange(next)
  }

  const updateItem = (id: string, field: string, val: unknown): void => {
    onChange(items.map((it) => (String(it.id) === id ? { ...it, [field]: val } : it)))
  }

  // m2m relations are typically large tables, so default to the table-driven
  // dialog picker. Opt back into the combobox via `m2m.picker = 'combobox'`.
  const Picker =
    (m2m as { picker?: string } | undefined)?.picker === 'combobox'
      ? ReferenceMultiCombobox
      : ReferenceMultiTableDialog
  return (
    <div className="space-y-3">
      <Picker
        referenceResourceId={m2m.reference}
        value={ids}
        onChange={setIds}
        disabled={disabled}
      />
      {extras.length > 0 && items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-border bg-muted/30 px-2.5 py-2"
            >
              {/* Mobile: stack reference link above the extras row.
                  ≥sm: reference link gets a fixed-width slot on the left,
                  extras flow inline on the right so we don't waste space. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <div className="min-w-0 sm:w-32 sm:shrink-0 sm:pt-1.5">
                  <ReferenceLink resourceId={m2m.reference} recordId={item.id} showIcon />
                </div>
                <div
                  className={
                    'grid min-w-0 flex-1 gap-2 ' +
                    (extras.length > 1 ? 'sm:grid-cols-2' : '')
                  }
                >
                  {extras.map((f) => {
                    const junctionProp = junction?.properties.find((p) => p.path === f)
                    const synthetic: PropertyJSON = junctionProp ?? {
                      path: f,
                      label: f,
                      type: 'string',
                      isId: false,
                      isSortable: false,
                      isRequired: false,
                      isDisabled: false,
                      isArray: false,
                      reference: null,
                      availableValues: null,
                      components: {},
                      visibility: { list: false, show: true, edit: true, filter: false },
                      position: 1,
                      custom: {},
                    }
                    return (
                      <div key={f} className="flex items-center gap-2">
                        <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">
                          {synthetic.label}
                        </label>
                        <div className="min-w-0 flex-1">
                          <PropertyEditor
                            property={synthetic}
                            value={item[f]}
                            onChange={(v) => updateItem(String(item.id), f, v)}
                            disabled={disabled}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── KeyValue editor wrapper that resolves DB-bound autocomplete sources ────

/**
 * Loads dynamic autocomplete suggestions for `keyValueFields[i].type ===
 * 'autocomplete'` fields that declare a `suggestionsResource` +
 * `suggestionsField` binding, then forwards everything to KeyValueEditor.
 *
 * Static suggestions (declared via `availableValues` on the field) are
 * already supported inside the editor itself — this wrapper only handles
 * the network-fetch side, so the UI primitive stays i18n- and
 * client-unaware.
 */
function KeyValueEditorWithSuggestions({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: ReadonlyArray<KeyValueFieldSpec>
  value: unknown
  onChange(next: Record<string, unknown>): void
  disabled?: boolean
}): React.ReactElement {
  const client = useAdminClient()
  const { t } = useI18n()

  // Identify just the fields that need a network fetch. The order is
  // stable across renders (driven by the `fields` prop array) so the
  // `useQueries` array length is stable too.
  const dynamic = React.useMemo(
    () =>
      fields.filter(
        (f): f is KeyValueFieldSpec & {
          suggestionsResource: string
          suggestionsField: string
        } =>
          f.type === 'autocomplete' &&
          !!f.suggestionsResource &&
          !!f.suggestionsField,
      ),
    [fields],
  )

  const queries = useQueries({
    queries: dynamic.map((f) => ({
      queryKey: [
        'modern-admin',
        'fieldSuggestions',
        f.suggestionsResource,
        f.suggestionsField,
        200,
      ] as const,
      queryFn: async (): Promise<string[]> => {
        const res = await client.list(f.suggestionsResource, { perPage: 200 })
        const seen = new Set<string>()
        const out: string[] = []
        for (const r of res.records) {
          const raw = r.params?.[f.suggestionsField]
          if (raw == null || raw === '') continue
          const v = String(raw)
          if (seen.has(v)) continue
          seen.add(v)
          out.push(v)
        }
        out.sort((a, b) => a.localeCompare(b))
        return out
      },
      staleTime: 60_000,
    })),
  })

  const suggestionsByKey: Record<string, string[]> = {}
  const suggestionsLoadingByKey: Record<string, boolean> = {}
  dynamic.forEach((f, i) => {
    suggestionsByKey[f.key] = queries[i]?.data ?? []
    suggestionsLoadingByKey[f.key] = queries[i]?.isLoading ?? false
  })

  return (
    <KeyValueEditor
      fields={fields}
      value={value}
      onChange={onChange}
      disabled={disabled}
      suggestionsByKey={suggestionsByKey}
      suggestionsLoadingByKey={suggestionsLoadingByKey}
      labels={{
        combobox: {
          loading: t('common:loading'),
          // KeyValueEditor's combobox label inherits the field label; this
          // is the empty-state message inside the dropdown.
          noMatches: t('keyValue:noMatches'),
        },
      }}
    />
  )
}

// ─── Generic property editor ──────────────────────────────────────────────────

export function PropertyEditor({
  property,
  value,
  onChange,
  disabled,
  resourceId,
}: PropertyEditorProps): React.ReactElement {
  const { components } = useAdminContext()
  const { t } = useI18n()
  const componentName = property.components?.edit
  if (componentName && components?.has(componentName)) {
    const Custom = components.get(componentName)!
    return <Custom property={property} value={value} onChange={onChange} disabled={disabled} />
  }
  const stringValue = value == null ? '' : String(value)
  if (property.type === 'm2m') {
    return (
      <M2MPropertyEditor
        property={property}
        value={value}
        onChange={onChange}
        disabled={disabled}
        resourceId={resourceId}
      />
    )
  }
  if (property.reference) {
    if (property.isArray) {
      const arr = Array.isArray(value)
        ? (value as Array<string | number>)
        : []
      // Opt into the table-driven dialog picker via `custom.picker = 'dialog'`;
      // default stays as the compact combobox for plain reference arrays.
      const pickerKind = (property.custom as { picker?: string } | undefined)?.picker
      const ArrayPicker =
        pickerKind === 'dialog' ? ReferenceMultiTableDialog : ReferenceMultiCombobox
      return (
        <ArrayPicker
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
      <Select
        value={stringValue}
        onValueChange={(v) => onChange(v === '_empty_' ? '' : v)}
        disabled={disabled}
      >
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
  case 'json':
  case 'mixed':
  case 'key-value':
    if (property.keyValueFields?.length) {
      return (
        <KeyValueEditorWithSuggestions
          fields={property.keyValueFields}
          value={value}
          onChange={(next) => onChange(next)}
          disabled={disabled}
        />
      )
    }
    return (
      <JsonEditor
        value={value}
        onChange={onChange}
        disabled={disabled}
        formatLabel={t('common:format')}
        invalidLabel={t('common:invalidJson')}
      />
    )
  case 'number':
  case 'float':
  case 'currency':
  case 'money':
    return (
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
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
        openCalendarLabel={t('common:openCalendar')}
        timeLabel={t('common:time')}
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
        openCalendarLabel={t('common:openCalendar')}
        timeLabel={t('common:time')}
      />
    )
  case 'richtext':
    return (
      <LazyRichtextEditor
        value={stringValue}
        onChange={(v) => onChange(v)}
        format="html"
        disabled={disabled}
        ariaLabelledBy={property.label}
        labels={{
          bold: t('richtext:bold'),
          italic: t('richtext:italic'),
          strikethrough: t('richtext:strikethrough'),
          inlineCode: t('richtext:inlineCode'),
          heading: t('richtext:heading'),
          bulletList: t('richtext:bulletList'),
          numberedList: t('richtext:numberedList'),
          blockquote: t('richtext:blockquote'),
          horizontalRule: t('richtext:horizontalRule'),
          insertLink: t('richtext:insertLink'),
          undo: t('richtext:undo'),
          redo: t('richtext:redo'),
          source: t('richtext:source'),
          splitView: t('richtext:splitView'),
          visualEditor: t('richtext:visualEditor'),
          fullscreen: t('richtext:fullscreen'),
          exitFullscreen: t('richtext:exitFullscreen'),
          urlPrompt: t('richtext:urlPrompt'),
        }}
      />
    )
  case 'markdown':
    return (
      <LazyRichtextEditor
        value={stringValue}
        onChange={(v) => onChange(v)}
        format="markdown"
        disabled={disabled}
        ariaLabelledBy={property.label}
        labels={{
          bold: t('richtext:bold'),
          italic: t('richtext:italic'),
          strikethrough: t('richtext:strikethrough'),
          inlineCode: t('richtext:inlineCode'),
          heading: t('richtext:heading'),
          bulletList: t('richtext:bulletList'),
          numberedList: t('richtext:numberedList'),
          blockquote: t('richtext:blockquote'),
          horizontalRule: t('richtext:horizontalRule'),
          insertLink: t('richtext:insertLink'),
          undo: t('richtext:undo'),
          redo: t('richtext:redo'),
          source: t('richtext:source'),
          splitView: t('richtext:splitView'),
          visualEditor: t('richtext:visualEditor'),
          fullscreen: t('richtext:fullscreen'),
          exitFullscreen: t('richtext:exitFullscreen'),
          urlPrompt: t('richtext:urlPrompt'),
        }}
      />
    )
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
      <PasswordInput
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        toggleLabel={{
          show: t('common:showPassword'),
          hide: t('common:hidePassword'),
        }}
      />
    )
  case 'file':
    return (
      <FilePropertyEditor
        property={property}
        value={value}
        onChange={onChange}
        disabled={disabled}
        resourceId={resourceId}
      />
    )
  case 'previewMedia':
    return (
      <Input
        type="url"
        inputMode="url"
        placeholder="https://…"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    )
  case 'color':
    return (
      <div className="flex items-center gap-3">
        <Input
          type="color"
          className="h-10 w-14 rounded-md p-1"
          value={normalizeHexColor(value) ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <Input
          value={stringValue}
          placeholder="#000000"
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    )
  default: {
    // Check the extension registry for a custom type before falling back to a plain text input.
    const ext = getPropertyExtension(property.type)
    if (ext) return <ext.editor property={property} value={value} onChange={onChange} disabled={disabled} resourceId={resourceId} />
    return (
      <Input
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    )
  }
  }
}
