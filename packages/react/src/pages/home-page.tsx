import * as React from 'react'
import { Plus, Database, BarChart2, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@modern-admin/ui'
import { useResources, useCurrentUser } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { Link } from '../router.js'
import { useDashboardCharts, ServerDashboardStore } from '../use-dashboard-charts.js'
import { useAdminClient } from '../provider.js'
import { useDialogs } from '../dialogs.js'
import { ChartWidget } from '../components/chart-widget.js'
import { ChartBuilderDialog } from '../components/chart-builder-dialog.js'
import { GroupSettingsDialog } from '../components/group-settings-dialog.js'
import { MoveChartDialog } from '../components/move-chart-dialog.js'
import type { ChartDef, ChartGroup } from '@modern-admin/core'

export function HomePage(): React.ReactElement {
  const { t } = useI18n()
  const resources = useResources()
  const { user } = useCurrentUser()
  const adminClient = useAdminClient()
  const dialogs = useDialogs()
  // Use server-backed store so charts persist across devices/browsers.
  // Falls back gracefully when configStore is not configured server-side.
  const serverStore = React.useMemo(() => new ServerDashboardStore(adminClient), [adminClient])
  const {
    charts,
    groups,
    addChart,
    updateChart,
    removeChart,
    addGroup,
    updateGroup,
    removeGroup,
  } = useDashboardCharts({
    userId: user?.id ?? null,
    store: serverStore,
  })

  // Only show resources explicitly visible in navigation (same rule as sidebar).
  const navResources = React.useMemo(
    () => resources.filter((r) => r.navigation !== null),
    [resources],
  )

  const [building, setBuilding] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  // null = no dialog; 'new' = create; ChartGroup = edit-existing.
  const [groupDialog, setGroupDialog] = React.useState<ChartGroup | 'new' | null>(null)
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(null)
  // Chart being moved — null when dialog is closed.
  const [movingChart, setMovingChart] = React.useState<ChartDef | null>(null)

  // Keep `activeGroupId` valid when groups change (group removed, list reloaded
  // from store, etc.). When at least one group exists we always render charts
  // bucketed by group, so we need a definite active id.
  React.useEffect(() => {
    if (groups.length === 0) {
      setActiveGroupId(null)
      return
    }
    if (!activeGroupId || !groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]!.id)
    }
  }, [groups, activeGroupId])

  const editingChart = editingId ? charts.find((c) => c.id === editingId) : undefined

  // Build the chart bucket for the active group: charts whose `groupId`
  // matches OR (fallback) ungrouped charts when the active group is the
  // first one. Sorted by `order` then `createdAt`.
  const firstGroupId = groups[0]?.id ?? null
  const visibleCharts = React.useMemo(() => {
    if (groups.length === 0) return [...charts].sort(byChartOrder)
    if (!activeGroupId) return []
    const filtered = charts.filter((c) => {
      if (c.groupId) return c.groupId === activeGroupId
      // Ungrouped charts default into the first group so they remain visible.
      return activeGroupId === firstGroupId
    })
    return filtered.sort(byChartOrder)
  }, [charts, groups.length, activeGroupId, firstGroupId])

  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null

  const handleDeleteChart = async (chart: ChartDef): Promise<void> => {
    const ok = await dialogs.confirm({
      title: t('chart:deleteChartConfirm'),
      description: t('chart:deleteChartConfirmHint'),
      confirmLabel: t('common:delete'),
      destructive: true,
    })
    if (ok) removeChart(chart.id)
  }

  const handleDeleteGroup = async (group: ChartGroup): Promise<void> => {
    const count = charts.filter((c) => {
      if (c.groupId) return c.groupId === group.id
      // Ungrouped charts also belong to the first group at display time.
      return group.id === firstGroupId
    }).length
    const ok = await dialogs.confirm({
      title: t('chart:deleteGroupConfirm'),
      description: t('chart:deleteGroupConfirmHint').replace('{count}', String(count)),
      confirmLabel: t('common:delete'),
      destructive: true,
    })
    if (ok) removeGroup(group.id)
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── Dashboard charts ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 space-y-0 gap-2 sm:p-6 sm:pb-2">
          <CardTitle>{t('chart:dashboard')}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGroupDialog('new')}
            >
              <FolderPlus className="size-4" />
              <span className="hidden sm:inline ml-1.5">{t('chart:addGroup')}</span>
            </Button>
            <Button size="sm" onClick={() => setBuilding(true)} disabled={navResources.length === 0}>
              <Plus className="size-4" />
              <span className="hidden sm:inline ml-1.5">{t('chart:addChart')}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          {groups.length > 0 && activeGroupId && (
            <Tabs
              value={activeGroupId}
              onValueChange={(v) => setActiveGroupId(v)}
              className="mb-4"
            >
              <div className="flex items-end justify-between gap-2">
                <TabsList className="flex-1">
                  {groups.map((g) => (
                    <TabsTrigger key={g.id} value={g.id}>
                      {g.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {activeGroup && (
                  <div className="mb-1 flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setGroupDialog(activeGroup)}
                      aria-label={t('chart:editGroup')}
                    >
                      <Pencil className="size-3.5" />
                      <span className="hidden sm:inline ml-1.5">{t('chart:editGroup')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDeleteGroup(activeGroup)}
                      aria-label={t('chart:deleteGroup')}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="hidden sm:inline ml-1.5">{t('chart:deleteGroup')}</span>
                    </Button>
                  </div>
                )}
              </div>
            </Tabs>
          )}

          {visibleCharts.length === 0 ? (
            <Empty className="border-0 py-4">
              <EmptyHeader>
                <EmptyMedia>
                  <BarChart2 />
                </EmptyMedia>
                <EmptyTitle>{t('chart:noCharts')}</EmptyTitle>
                <EmptyDescription>{t('chart:noChartsHint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:gap-4 md:grid-cols-2">
              {visibleCharts.map((c) => (
                <div
                  key={c.id}
                  className={c.width === 'full' ? 'md:col-span-2' : undefined}
                >
                  <ChartWidget
                    config={c}
                    onEdit={() => setEditingId(c.id)}
                    onDelete={() => void handleDeleteChart(c)}
                    onMove={() => setMovingChart(c)}
                    onUpdate={(input) => updateChart(c.id, input)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Resources list ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('common:resources')}</CardTitle>
        </CardHeader>
        <CardContent>
          {navResources.length === 0 ? (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia>
                  <Database />
                </EmptyMedia>
                <EmptyTitle>{t('common:noRecords')}</EmptyTitle>
                <EmptyDescription>
                  {t('common:noRecordsHint', { resource: 'resource' })}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {navResources.map((r) => (
                <li key={r.id}>
                  <Link
                    to={{ name: 'list', resourceId: r.id }}
                    className="block rounded-md border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-shadow"
                  >
                    <div className="font-semibold">{r.name}</div>
                    {r.name !== r.id && (
                      <div className="text-xs text-muted-foreground">{r.id}</div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Chart builder dialog ──────────────────────────────────── */}
      {building && (
        <ChartBuilderDialog
          onSave={(input) => {
            // New charts inherit the active group so the user sees them in
            // the tab they were on. The hook also auto-falls back to the
            // first group if `groupId` is undefined.
            addChart(activeGroupId ? { ...input, groupId: activeGroupId } : input)
            setBuilding(false)
          }}
          onClose={() => setBuilding(false)}
        />
      )}
      {editingChart && (
        <ChartBuilderDialog
          initial={editingChart}
          onSave={(input) => { updateChart(editingChart.id, input); setEditingId(null) }}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* ── Move chart dialog ─────────────────────────────────────── */}
      {movingChart && (
        <MoveChartDialog
          groups={groups}
          initialGroupId={movingChart.groupId}
          initialOrder={movingChart.order}
          onSave={({ groupId, order }) => {
            updateChart(movingChart.id, { ...movingChart, groupId, order })
            setMovingChart(null)
          }}
          onClose={() => setMovingChart(null)}
          onCreateGroup={() => {
            setMovingChart(null)
            setGroupDialog('new')
          }}
        />
      )}

      {/* ── Group settings dialog ─────────────────────────────────── */}
      {groupDialog && (
        <GroupSettingsDialog
          initial={groupDialog === 'new' ? undefined : groupDialog}
          onSave={(input) => {
            if (groupDialog === 'new') {
              const newId = addGroup(input)
              setActiveGroupId(newId)
            } else {
              updateGroup(groupDialog.id, input)
            }
            setGroupDialog(null)
          }}
          onClose={() => setGroupDialog(null)}
        />
      )}
    </div>
  )
}

/** Sort charts within a group: by `order` asc, ties broken by `createdAt`. */
function byChartOrder(a: ChartDef, b: ChartDef): number {
  if (a.order !== b.order) return a.order - b.order
  return a.createdAt.localeCompare(b.createdAt)
}
