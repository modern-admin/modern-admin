// MediaPreview — opens a dialog with an image/video preview and a download
// button. Used by the `previewMedia` property type to render HTTP(S) URLs to
// remote photos/videos as a "Preview" button instead of raw text.

import * as React from 'react'
import { Download, Eye, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog.js'

export type MediaKind = 'image' | 'video' | 'audio' | 'unknown'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg|ico|heic|heif)(\?|#|$)/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|avi|mkv)(\?|#|$)/i
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i

export function detectMediaKind(url: string): MediaKind {
  if (!url) return 'unknown'
  if (IMAGE_EXT.test(url)) return 'image'
  if (VIDEO_EXT.test(url)) return 'video'
  if (AUDIO_EXT.test(url)) return 'audio'
  return 'unknown'
}

/**
 * Probes the Content-Type of `url` when extension-based detection returns
 * 'unknown'. Runs only when `enabled` is true (dialog has been opened).
 *
 * Strategy:
 *  1. HEAD request — reads Content-Type header (works for same-origin or
 *     CORS-enabled APIs like public avatar services).
 *  2. Image constructor fallback — handles servers that block HEAD but allow
 *     img GET (bypasses CORS for image fetches by design).
 *
 * Returns [resolvedKind, isLoading].
 */
function useProbeMediaKind(
  url: string,
  kindOverride: MediaKind | undefined,
  enabled: boolean,
): [MediaKind, boolean] {
  const byExt = React.useMemo(() => detectMediaKind(url), [url])
  const [kind, setKind] = React.useState<MediaKind>(kindOverride ?? byExt)
  const [loading, setLoading] = React.useState(false)

  // Keep kind in sync when url or kindOverride changes (e.g. parent re-renders).
  React.useEffect(() => {
    setKind(kindOverride ?? detectMediaKind(url))
    setLoading(false)
  }, [url, kindOverride])

  React.useEffect(() => {
    if (!enabled) return
    if (kindOverride) return
    if (byExt !== 'unknown') return
    if (!url.startsWith('http')) return

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    const resolve = (k: MediaKind) => {
      if (cancelled) return
      setKind(k)
      setLoading(false)
    }

    // Image constructor fallback — works even when HEAD is CORS-blocked.
    const tryImage = () => {
      const img = new window.Image()
      img.onload = () => resolve('image')
      img.onerror = () => resolve('unknown')
      img.src = url
    }

    fetch(url, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        const ct = res.headers.get('content-type') ?? ''
        if (ct.startsWith('image/')) resolve('image')
        else if (ct.startsWith('video/')) resolve('video')
        else if (ct.startsWith('audio/')) resolve('audio')
        else tryImage()
      })
      .catch(() => {
        if (!cancelled) tryImage()
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [url, kindOverride, byExt, enabled])

  return [kind, loading]
}

export interface MediaPreviewProps {
  /** Media URL. Should be a fully-qualified HTTP(S) URL. */
  url: string
  /** Optional override for the auto-detected media kind. */
  kind?: MediaKind
  /** Suggested file name for the download. Falls back to URL pathname. */
  downloadName?: string
  /** Strings (already-translated) to render in the UI. */
  labels?: {
    preview?: string
    download?: string
    downloadError?: string
    openInNewTab?: string
    title?: string
    description?: string
    cannotPreview?: string
  }
  /** Show the URL as secondary text next to the trigger. */
  showUrl?: boolean
  /** Variant of the trigger button. Defaults to 'outline'. */
  triggerVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link'
  /** Size of the trigger button. Defaults to 'sm'. */
  triggerSize?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function MediaPreview({
  url,
  kind: kindProp,
  downloadName,
  labels,
  showUrl = false,
  triggerVariant = 'outline',
  triggerSize = 'sm',
  className,
}: MediaPreviewProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [kind, kindLoading] = useProbeMediaKind(url, kindProp, open)
  const [downloading, setDownloading] = React.useState(false)
  const [downloadError, setDownloadError] = React.useState(false)

  const previewLabel = labels?.preview ?? 'Preview'
  const downloadLabel = labels?.download ?? 'Download'
  const openLabel = labels?.openInNewTab ?? 'Open in new tab'
  const titleLabel = labels?.title ?? previewLabel
  const cannotLabel = labels?.cannotPreview ?? 'Preview is unavailable for this media type.'

  const inferredName = React.useMemo(() => {
    if (downloadName) return downloadName
    try {
      const u = new URL(url)
      const last = u.pathname.split('/').filter(Boolean).pop()
      return last || 'download'
    } catch {
      return 'download'
    }
  }, [downloadName, url])

  // Force a file download via fetch → blob → blob URL. The <a download> attribute
  // is silently ignored by browsers for cross-origin URLs, so we always use the
  // blob approach. Falls back to window.open if fetch fails (e.g. no CORS).
  const handleDownload = async () => {
    setDownloadError(false)
    setDownloading(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = inferredName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  // Stop click propagation so that events from the Dialog portal (which bubble
  // through the React component tree, not the DOM) do not reach parent row
  // click handlers and trigger unintended navigation (e.g. list-page TableRow
  // opening edit on backdrop/dialog click).
  const stopClick = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className={cn('inline-flex items-center gap-2', className)} onClick={stopClick}>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen(true)}
        disabled={!url}
      >
        <Eye className="size-4" />
        <span>{previewLabel}</span>
      </Button>

      {showUrl && url ? (
        <span
          className="max-w-[24rem] truncate text-xs text-muted-foreground"
          title={url}
        >
          {url}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{titleLabel}</DialogTitle>
            {labels?.description ? (
              <DialogDescription>{labels.description}</DialogDescription>
            ) : (
              <DialogDescription className="break-all text-xs">{url}</DialogDescription>
            )}
          </DialogHeader>

          <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-md border border-border bg-muted/30 p-2">
            {kindLoading ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : kind === 'image' ? (
              <img
                src={url}
                alt={inferredName}
                className="max-h-[68vh] w-auto max-w-full object-contain"
              />
            ) : kind === 'video' ? (
              <video
                src={url}
                controls
                className="max-h-[68vh] w-full max-w-full"
              />
            ) : kind === 'audio' ? (
              <audio src={url} controls className="w-full" />
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {cannotLabel}
              </div>
            )}
          </div>

          <DialogFooter>
            {downloadError && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {labels?.downloadError ?? 'Download failed'}
              </span>
            )}
            <Button asChild variant="ghost" size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                <span>{openLabel}</span>
              </a>
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={downloading}
              onClick={() => { void handleDownload() }}
            >
              {downloading
                ? <Loader2 className="size-4 animate-spin" />
                : <Download className="size-4" />}
              <span>{downloadLabel}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
