// Export dialog: lets the user download all records matching the current
// list filters/sorting as CSV or JSON. Rendered inside a generic <Dialog>
// via useDialogs().open() — the parent passes resourceId + visible
// properties + the active ListQuery.

import * as React from 'react'
import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@modern-admin/ui'
import { Download, FileJson, FileSpreadsheet, X } from 'lucide-react'
import { useAdminClient } from '../provider.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import {
  downloadText,
  exportFilename,
  fetchAllRecords,
  recordsToCsv,
  recordsToJson,
  type ExportFormat,
} from '../export.js'
import type { ListQuery, PropertyJSON } from '../types.js'

export interface ExportDialogProps {
  resourceId: string
  resourceLabel: string
  properties: PropertyJSON[]
  query: ListQuery | undefined
  onClose(): void
}

export function ExportDialog({
  resourceId,
  resourceLabel,
  properties,
  query,
  onClose,
}: ExportDialogProps): React.ReactElement {
  const client = useAdminClient()
  const { t } = useI18n()
  const notify = useNotify()
  const [busy, setBusy] = React.useState<ExportFormat | null>(null)
  const [progress, setProgress] = React.useState<{ loaded: number; total: number } | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const run = async (format: ExportFormat): Promise<void> => {
    if (busy) return
    setBusy(format)
    setProgress({ loaded: 0, total: 0 })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const records = await fetchAllRecords(client, resourceId, query, {
        signal: ctrl.signal,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      })
      const body =
        format === 'csv'
          ? recordsToCsv(records, { properties, query })
          : recordsToJson(records, { properties, query })
      const mime = format === 'csv' ? 'text/csv' : 'application/json'
      downloadText(exportFilename(resourceId, format), mime, body)
      notify.success({ key: 'export:exported', params: { count: records.length } })
      onClose()
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      notify.error(
        { key: 'export:exportFailed' },
        { description: err instanceof Error ? err.message : String(err) },
      )
    } finally {
      setBusy(null)
      setProgress(null)
      abortRef.current = null
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('export:title')}</DialogTitle>
        <DialogDescription>
          {t('export:description', { resource: resourceLabel })}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start gap-3 py-3"
          disabled={!!busy}
          onClick={() => run('csv')}
        >
          <FileSpreadsheet className="size-5 shrink-0" />
          <div className="min-w-0 flex flex-col items-start text-left overflow-hidden">
            <span className="font-medium">CSV</span>
            <span className="text-xs text-muted-foreground truncate w-full">
              {t('export:csvHint')}
            </span>
          </div>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start gap-3 py-3"
          disabled={!!busy}
          onClick={() => run('json')}
        >
          <FileJson className="size-5 shrink-0" />
          <div className="min-w-0 flex flex-col items-start text-left overflow-hidden">
            <span className="font-medium">JSON</span>
            <span className="text-xs text-muted-foreground truncate w-full">
              {t('export:jsonHint')}
            </span>
          </div>
        </Button>
      </div>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Download className="size-4 animate-pulse" />
          <span>
            {progress && progress.total > 0
              ? t('export:progress', { loaded: progress.loaded, total: progress.total })
              : t('export:downloading')}
          </span>
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            abortRef.current?.abort()
            onClose()
          }}
        >
          <X className="size-4" />
          {busy ? t('common:cancel') : t('common:close')}
        </Button>
      </DialogFooter>
    </>
  )
}
