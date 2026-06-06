// AiFillDialog — dropzone + "Recognize" button that sends a single image to
// the resource's `aiFill` action and forwards the extracted values to the
// caller. The dialog is purely presentational regarding form state; the
// edit page handles merging the returned values into the live form.

import * as React from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileInput,
} from '@modern-admin/ui'
import { useAdminClient } from '../provider.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { parseApiError } from '../client.js'

export interface AiFillDialogProps {
  resourceId: string
  onClose(): void
  /** Called with the extracted values map. Caller merges into form state. */
  onFilled(values: Record<string, unknown>): void
}

export function AiFillDialog({
  resourceId,
  onClose,
  onFilled,
}: AiFillDialogProps): React.ReactElement {
  const { t } = useI18n()
  const client = useAdminClient()
  const notify = useNotify()
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)

  // Use useEffect for createObjectURL to ensure cleanup is always paired with
  // creation and happens at the right time (avoiding the side-effect-in-useMemo
  // anti-pattern).
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Abort any in-flight request when the dialog unmounts.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort('dialog unmounted')
    }
  }, [])

  const handleFill = async (): Promise<void> => {
    if (!file || busy) return

    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    try {
      const { values } = await client.aiFillFromImage(resourceId, file, { signal: ac.signal })
      const count = Object.keys(values).length
      if (count === 0) {
        notify.error({ key: 'aiFill:noValues' })
        return
      }
      onFilled(values)
      // The undo toast is surfaced by the edit-page (applyAiFillValues); the
      // dialog only needs to close cleanly after handing off the values.
      onClose()
    } catch (err) {
      if (ac.signal.aborted) return // user-initiated close — silently ignore
      const { message } = parseApiError(err)
      notify.error(
        { key: 'aiFill:errorGeneric', params: { message } },
        { description: message },
      )
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const handleClose = (): void => {
    if (busy) {
      abortRef.current?.abort('dialog closed')
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            {t('aiFill:dialogTitle')}
          </DialogTitle>
          <DialogDescription>{t('aiFill:dialogDescription')}</DialogDescription>
        </DialogHeader>

        <FileInput
          accept="image/*"
          value={file ? file.name : null}
          displayName={file?.name ?? null}
          previewUrl={previewUrl}
          uploading={busy}
          uploadingName={file?.name}
          disabled={busy}
          onFileSelect={(f) => setFile(f)}
          onRemove={() => setFile(null)}
          labels={{
            chooseFile: t('common:chooseFile'),
            dragAndDrop: t('common:dragAndDrop'),
            chooseAFile: t('common:chooseAFile'),
            uploading: t('aiFill:processing'),
            uploadingFile: t('aiFill:processing'),
            removeFile: t('common:removeFile'),
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common:cancel')}
          </Button>
          <Button onClick={() => void handleFill()} disabled={!file || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t('aiFill:fillButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
