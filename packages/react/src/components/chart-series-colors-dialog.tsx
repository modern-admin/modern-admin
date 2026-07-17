// Per-series color override dialog for a dashboard chart. Opened from the
// widget "…" menu so it can list the series actually rendered (groupBy
// values are only known once data is loaded). Lives in the react package
// because it is i18n-aware; primitives come from @modern-admin/ui.

import * as React from 'react'
import {
  Button,
  ColorSwatchPicker,
  CHART_COLOR_PRESETS,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@modern-admin/ui'
import { useI18n } from '../i18n.js'

export interface SeriesColorItem {
  /** Stable series key (`__total__`, groupBy value, …). */
  key: string
  /** Display label (legend text). */
  label: string
  /** Persisted override, if any. */
  override?: string
  /** Palette color used when no override is set — shown as the row swatch. */
  auto: string
}

export interface ChartSeriesColorsDialogProps {
  items: ReadonlyArray<SeriesColorItem>
  /** Receives only the overrides (key → hex); auto rows are omitted. */
  onSave(overrides: Record<string, string>): void
  onClose(): void
}

export function ChartSeriesColorsDialog({
  items,
  onSave,
  onClose,
}: ChartSeriesColorsDialogProps): React.ReactElement {
  const { t } = useI18n()
  const [draft, setDraft] = React.useState<Record<string, string | undefined>>(
    () => Object.fromEntries(items.map((i) => [i.key, i.override])),
  )

  const handleSave = (): void => {
    const overrides: Record<string, string> = {}
    for (const [key, color] of Object.entries(draft)) {
      if (color) overrides[key] = color
    }
    onSave(overrides)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dashboard:widget.colorsTitle')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-1">
          {items.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: draft[item.key] ?? item.auto }}
                />
                <span className="truncate font-medium">{item.label}</span>
              </div>
              <ColorSwatchPicker
                value={draft[item.key]}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, [item.key]: next }))
                }
                presets={CHART_COLOR_PRESETS}
                labels={{
                  custom: t('dashboard:widget.colorCustom'),
                  pick: t('dashboard:widget.colorPick'),
                  auto: t('dashboard:widget.colorAuto'),
                }}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
          <Button onClick={handleSave}>{t('common:save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
