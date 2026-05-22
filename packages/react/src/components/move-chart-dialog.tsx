// Dialog for moving a chart to a different group and adjusting its order.
// Opened from the chart widget's "…" dropdown menu.

import * as React from 'react'
import { FolderPlus } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoTooltip,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@modern-admin/ui'
import type { ChartGroup } from '@modern-admin/core'
import { useI18n } from '../i18n.js'

export interface MoveChartDialogProps {
  groups: ChartGroup[]
  /** Current group id of the chart being moved. */
  initialGroupId?: string
  /** Current order value of the chart being moved. */
  initialOrder?: number
  onSave(input: { groupId: string; order: number }): void
  onClose(): void
  /** Called when the user wants to create a group first (no groups exist). */
  onCreateGroup(): void
}

export function MoveChartDialog({
  groups,
  initialGroupId,
  initialOrder,
  onSave,
  onClose,
  onCreateGroup,
}: MoveChartDialogProps): React.ReactElement {
  const { t } = useI18n()

  const sorted = React.useMemo(
    () => [...groups].sort((a, b) => a.order - b.order),
    [groups],
  )

  // Seed from the chart's current group, or the first group if unset.
  const defaultGroupId = initialGroupId ?? sorted[0]?.id ?? ''
  const [groupId, setGroupId] = React.useState(defaultGroupId)
  const [order, setOrder] = React.useState<number>(initialOrder ?? 0)

  const handleSave = (): void => {
    if (!groupId) return
    onSave({ groupId, order: Number.isFinite(order) ? Math.trunc(order) : 0 })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chart:moveChart')}</DialogTitle>
        </DialogHeader>

        {sorted.length === 0 ? (
          // No groups yet — prompt to create one.
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">{t('chart:moveNoGroups')}</p>
            <p className="text-sm text-muted-foreground">{t('chart:moveNoGroupsHint')}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { onClose(); onCreateGroup() }}
            >
              <FolderPlus className="size-4 mr-2" />
              {t('chart:addGroup')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="move-group">{t('chart:moveGroup')}</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger id="move-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="move-order">{t('chart:order')}</Label>
                <InfoTooltip content={t('chart:orderHint')} />
              </div>
              <Input
                id="move-order"
                type="number"
                step={1}
                value={order}
                onChange={(e) =>
                  setOrder(Number.isFinite(Number(e.target.value)) ? Math.trunc(Number(e.target.value)) : 0)
                }
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
          {sorted.length > 0 && (
            <Button onClick={handleSave} disabled={!groupId}>
              {t('chart:moveToGroup')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
