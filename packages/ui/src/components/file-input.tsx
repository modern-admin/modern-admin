/**
 * FileInput — styled file picker with optional drag-and-drop, current-file
 * display, and a remove button. Purely presentational: upload logic lives in
 * the `packages/react` property renderer.
 *
 * Mobile-first: full-width by default, tap-friendly hit areas.
 */

import * as React from 'react'
import { Upload, X, FileText, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'

export interface FileInputLabels {
  /** Dropzone aria-label. Default: "Choose file". */
  chooseFile?: string
  /** Drop zone hint before the link. Default: "Drag and drop or". */
  dragAndDrop?: string
  /** Link text when no file selected. Default: "choose a file". */
  chooseAFile?: string
  /** Upload spinner text (no filename). Default: "Uploading…". */
  uploading?: string
  /** Upload spinner text with filename — `{name}` is replaced. Default: "Uploading {name}…". */
  uploadingFile?: string
  /** Remove button aria-label. Default: "Remove file". */
  removeFile?: string
}

export interface FileInputProps {
  /** Current stored value (storage key or URL). Shown as the "current file". */
  value?: string | null
  /** Human-readable display name for the current file. Falls back to `value`. */
  displayName?: string | null
  /** Public URL used for image thumbnail previews. */
  previewUrl?: string | null
  /** HTML `accept` attribute (e.g. `'image/*'` or `'.pdf,.docx'`). */
  accept?: string
  /** Whether a file is currently being uploaded. Shows a spinner. */
  uploading?: boolean
  /** Upload progress 0–100 (overrides the spinner with a determinate bar when set). */
  uploadProgress?: number
  /** Local file name shown next to the progress indicator. */
  uploadingName?: string
  /** Upload error message. */
  error?: string
  disabled?: boolean
  className?: string
  /** Translated UI labels. All optional — English strings are the defaults. */
  labels?: FileInputLabels
  /** Called when the user picks a new file. */
  onFileSelect: (file: File) => void
  /** Called when the user removes the current file. */
  onRemove?: () => void
}

export function FileInput({
  value,
  displayName,
  previewUrl,
  accept,
  uploading = false,
  uploadProgress,
  uploadingName,
  error,
  disabled = false,
  className,
  labels,
  onFileSelect,
  onRemove,
}: FileInputProps): React.ReactElement {
  const l = {
    chooseFile: labels?.chooseFile ?? 'Choose file',
    dragAndDrop: labels?.dragAndDrop ?? 'Drag and drop or',
    chooseAFile: labels?.chooseAFile ?? 'choose a file',
    uploading: labels?.uploading ?? 'Uploading…',
    uploadingFile: labels?.uploadingFile ?? 'Uploading {name}…',
    removeFile: labels?.removeFile ?? 'Remove file',
  }
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  const handleFiles = (files: FileList | null) => {
    const first = files?.[0]
    if (!first || disabled || uploading) return
    onFileSelect(first)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    handleFiles(e.target.files)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled && !uploading) setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const label = displayName || (value ? value.split('/').pop() : null)

  // Detect image for thumbnail preview
  const isImage =
    previewUrl
      ? /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|$)/i.test(previewUrl)
      : false

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Drop zone / trigger */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={l.chooseFile}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !uploading) {
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
          isDragging && 'border-primary bg-primary/5',
          (disabled || uploading) && 'cursor-not-allowed opacity-60',
        )}
      >
        {uploading ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="truncate" title={uploadingName ?? undefined}>
                {uploadingName
                  ? l.uploadingFile.replace('{name}', uploadingName)
                  : l.uploading}
              </span>
            </div>
            {uploadProgress != null && (
              <div className="flex w-full items-center gap-2">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgress}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {uploadProgress}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              <span className="hidden sm:inline">{l.dragAndDrop} </span>
              <span className="text-primary underline-offset-2 hover:underline">
                {l.chooseAFile}
              </span>
            </span>
            {accept && (
              <span className="text-xs text-muted-foreground">{accept}</span>
            )}
          </>
        )}
      </div>

      {/* Current file row */}
      {value && !uploading && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={label ?? 'preview'}
              className="size-10 shrink-0 rounded object-cover"
            />
          ) : (
            <FileText className="size-5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={label ?? value}>
            {label ?? value}
          </span>
          {onRemove && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={l.removeFile}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Hidden native input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled || uploading}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  )
}
