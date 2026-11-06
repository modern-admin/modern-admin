/**
 * MultiFileInput — drag-and-drop file picker that accepts multiple files at
 * once and renders a list of currently-attached files with per-file remove
 * controls. Mirrors `FileInput` but works on an array of values.
 *
 * Purely presentational — upload + cancel logic lives in the
 * `packages/react` property renderer.
 */

import * as React from 'react'
import { Upload, X, FileText } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import { Progress } from './progress.js'
import { Spinner } from './spinner.js'

export interface MultiFileInputItem {
  /** Storage key (or URL). */
  value: string
  /** Optional public URL used for image thumbnails. */
  previewUrl?: string | null
  /** Optional display name. Falls back to the last path segment of `value`. */
  displayName?: string | null
}

/** In-progress upload — rendered as a separate row with progress / error. */
export interface MultiFileInputPendingItem {
  /** Stable identifier for the pending row (e.g. `crypto.randomUUID()`). */
  id: string
  /** Display name (typically the local file name). */
  name: string
  /** 0–100. `undefined` while the request is queued or finished. */
  progress?: number
  /** Status text — when present, replaces the progress bar. */
  status?: 'queued' | 'uploading' | 'error'
  /** Error message to render when `status === 'error'`. */
  error?: string
}

export interface MultiFileInputLabels {
  /** Dropzone aria-label. Default: "Choose files". */
  chooseFiles?: string
  /** Drop zone hint before the link. Default: "Drag and drop or". */
  dragAndDrop?: string
  /** Link text when no files selected. Default: "choose files". */
  chooseLink?: string
  /** Link text when files already exist. Default: "add more files". */
  addMoreLink?: string
  /** Upload spinner text. Default: "Uploading…". */
  uploading?: string
  /** Remove button aria-label. Default: "Remove file". */
  removeFile?: string
  /** Fallback error when pending item has no message. Default: "Upload failed". */
  uploadFailed?: string
  /** Dismiss error button aria-label. Default: "Dismiss". */
  dismiss?: string
}

export interface MultiFileInputProps {
  /** Currently attached files. */
  items: ReadonlyArray<MultiFileInputItem>
  /** Files currently being uploaded — rendered below the persisted list. */
  pendingItems?: ReadonlyArray<MultiFileInputPendingItem>
  /** HTML `accept` attribute (e.g. `'image/*'` or `'.pdf,.docx'`). */
  accept?: string
  /**
   * Whether files are currently being uploaded. Shows a spinner in the
   * dropzone. Ignored when `pendingItems` is non-empty (the per-item
   * progress rows take over the role of the dropzone spinner).
   */
  uploading?: boolean
  /** Upload error message. */
  error?: string
  disabled?: boolean
  /** Marks the dropzone `aria-invalid` and draws the error border. Implied by `error`. */
  invalid?: boolean
  /** `id` of the dropzone button, so a `<label for=…>` can point at it. */
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  /** Ref to the focusable dropzone — lets form libraries focus the field. */
  ref?: React.Ref<HTMLDivElement>
  className?: string
  /** Translated UI labels. All optional — English strings are the defaults. */
  labels?: MultiFileInputLabels
  /** Called when the user picks one or more new files. */
  onFilesSelect: (files: File[]) => void
  /** Called when the user removes the file at the given index. */
  onRemove: (index: number) => void
  /** Called when the user dismisses an errored pending item. */
  onPendingDismiss?: (id: string) => void
}

const isImageUrl = (url: string | null | undefined): boolean =>
  !!url && /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|$)/i.test(url)

export function MultiFileInput({
  items,
  pendingItems,
  accept,
  uploading = false,
  error,
  disabled = false,
  invalid,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ref,
  className,
  labels,
  onFilesSelect,
  onRemove,
  onPendingDismiss,
}: MultiFileInputProps): React.ReactElement {
  const l = {
    chooseFiles: labels?.chooseFiles ?? 'Choose files',
    dragAndDrop: labels?.dragAndDrop ?? 'Drag and drop or',
    chooseLink: labels?.chooseLink ?? 'choose files',
    addMoreLink: labels?.addMoreLink ?? 'add more files',
    uploading: labels?.uploading ?? 'Uploading…',
    removeFile: labels?.removeFile ?? 'Remove file',
    uploadFailed: labels?.uploadFailed ?? 'Upload failed',
    dismiss: labels?.dismiss ?? 'Dismiss',
  }
  const inputRef = React.useRef<HTMLInputElement>(null)
  const errorId = React.useId()
  const isInvalid = Boolean(invalid || error)
  const [isDragging, setIsDragging] = React.useState(false)
  const hasPending = (pendingItems?.length ?? 0) > 0
  // The dropzone spinner is redundant when individual progress rows are
  // already on screen — only show it for batch uploads that don't supply
  // per-item progress.
  const showSpinner = uploading && !hasPending

  const handleFiles = (files: FileList | null): void => {
    if (!files || files.length === 0 || disabled) return
    onFilesSelect(Array.from(files))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    handleFiles(e.target.files)
    // Allow re-selecting the same file again immediately after removing it.
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (): void => setIsDragging(false)

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Drop zone / trigger */}
      <div
        ref={ref}
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : l.chooseFiles)}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={
          [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={isInvalid || undefined}
        aria-disabled={disabled || undefined}
        aria-busy={showSpinner || undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex min-h-[5rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors',
          'hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isInvalid && 'border-destructive/60',
          isDragging && 'border-primary bg-primary/5',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {showSpinner ? (
          <>
            <Spinner className="size-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{l.uploading}</span>
          </>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              <span className="hidden sm:inline">{l.dragAndDrop} </span>
              <span className="text-primary underline-offset-2 hover:underline">
                {items.length > 0 ? l.addMoreLink : l.chooseLink}
              </span>
            </span>
            {accept && <span className="text-xs text-muted-foreground">{accept}</span>}
          </>
        )}
      </div>

      {/* Current file list */}
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, idx) => {
            const label = item.displayName || (item.value ? item.value.split('/').pop() : null)
            const showImage = isImageUrl(item.previewUrl)
            return (
              <li
                key={`${item.value}-${idx}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
              >
                {showImage && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={label ?? 'preview'}
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                )}
                <span
                  className="min-w-0 flex-1 truncate text-sm text-foreground"
                  title={label ?? item.value}
                >
                  {label ?? item.value}
                </span>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={l.removeFile}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(idx)
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* In-progress uploads */}
      {hasPending && (
        <ul className="space-y-1">
          {pendingItems!.map((p) => (
            <li
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-md border bg-background px-3 py-2',
                p.status === 'error' ? 'border-destructive/50' : 'border-border',
              )}
            >
              {p.status === 'error' ? (
                <FileText className="size-5 shrink-0 text-destructive" />
              ) : (
                <Spinner size="lg" className="text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground" title={p.name}>
                  {p.name}
                </div>
                {p.status === 'error' ? (
                  <div className="text-xs text-destructive" role="alert">
                    {p.error || l.uploadFailed}
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <Progress
                      value={p.progress ?? null}
                      className="h-1.5 flex-1"
                      aria-label={p.name}
                    />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {p.progress != null ? `${p.progress}%` : '…'}
                    </span>
                  </div>
                )}
              </div>
              {p.status === 'error' && onPendingDismiss && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={l.dismiss}
                  onClick={(e) => {
                    e.stopPropagation()
                    onPendingDismiss(p.id)
                  }}
                >
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Error message */}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Hidden native input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  )
}
