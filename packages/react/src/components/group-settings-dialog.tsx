// Create / edit dialog for a dashboard chart group. Lives in the react
// package because it is i18n-aware; the actual primitives come from
// @modern-admin/ui.

import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@modern-admin/ui'
import type { ChartGroup } from '@modern-admin/core'
import { useI18n } from '../i18n.js'

export interface GroupSettingsDialogProps {
  /** When set, the dialog is in edit mode and pre-populates from this group. */
  initial?: ChartGroup
  onSave(input: { name: string; order: number }): void
  onClose(): void
}

export function GroupSettingsDialog({
  initial,
  onSave,
  onClose,
}: GroupSettingsDialogProps): React.ReactElement {
  const { t } = useI18n()
  const [name, setName] = React.useState(initial?.name ?? '')
  const [order, setOrder] = React.useState<number>(initial?.order ?? 0)
  const [error, setError] = React.useState<string>('')

  const handleSave = (): void => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('chart:groupNameRequired'))
      return
    }
    setError('')
    onSave({ name: trimmed, order: Number.isFinite(order) ? Math.trunc(order) : 0 })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? t('chart:editGroup') : t('chart:newGroup')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">{t('chart:groupName')}</Label>
            <Input
              id="group-name"
              placeholder={t('chart:groupNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-order">{t('chart:groupOrder')}</Label>
            <Input
              id="group-order"
              type="number"
              step={1}
              value={order}
              onChange={(e) =>
                setOrder(Number.isFinite(Number(e.target.value)) ? Math.trunc(Number(e.target.value)) : 0)
              }
            />
            <p className="text-xs text-muted-foreground">{t('chart:orderHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
          <Button onClick={handleSave}>{t('chart:saveGroup')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
