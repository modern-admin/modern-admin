// Tabs of records that reference the open record through a foreign key.
// Each tab embeds the full ResourceListPage filtered by a locked
// `{ [foreignKey]: parentRecordId }` so it gets the same table, filters,
// bulk actions, pagination, and row-click behaviour as the main list.
//
// Designed to live below the property card on the show page.

import * as React from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@modern-admin/ui'
import { useResources } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { ResourceListPage } from '../pages/list-page.js'
import { resolveRelatedResources } from '../relations.js'
import type { ListQueryState } from '../router.js'
import type { RelatedResource, ResourceJSON } from '../types.js'

interface RelatedRecordsTabProps {
  parentRecordId: string
  related: RelatedResource
  active: boolean
}

function RelatedRecordsTab({
  parentRecordId,
  related,
  active,
}: RelatedRecordsTabProps): React.ReactElement | null {
  // Each tab keeps its own page/sort/filter state. Defaults: page 1, perPage 10
  // so embedded tables stay compact compared to the main list (default 20).
  const [query, setQuery] = React.useState<ListQueryState>({ perPage: 10 })

  // Lazy-load tab content: only mount the (heavy) ResourceListPage once the
  // user actually visits the tab. Subsequent toggles keep state thanks to
  // Radix's mount-on-activate semantics on TabsContent (we don't force unmount).
  const [hasBeenActive, setHasBeenActive] = React.useState(active)
  React.useEffect(() => {
    if (active) setHasBeenActive(true)
  }, [active])

  if (!hasBeenActive) return null

  return (
    <ResourceListPage
      resourceId={related.resourceId}
      query={query}
      onQueryChange={setQuery}
      lockedFilters={{ [related.foreignKey]: parentRecordId }}
      // The host `CardContent` already pads the tab body — don't double it,
      // or the table stops spanning the block's full width.
      embedPadding={false}
      features={{
        breadcrumbs: false,
        title: false,
        create: false,
        export: false,
        card: false,
      }}
    />
  )
}

export interface RelatedRecordsTabsProps {
  resource: ResourceJSON
  recordId: string
}

export function RelatedRecordsTabs({
  resource,
  recordId,
}: RelatedRecordsTabsProps): React.ReactElement | null {
  const { t } = useI18n()
  const allResources = useResources()
  // Master switch: `showRelatedResources: false` in the resource config hides
  // the whole section regardless of configured/auto-discovered relations.
  const enabled = resource.showRelatedResources !== false
  const tabs = React.useMemo(
    () => (enabled ? resolveRelatedResources(resource, allResources) : []),
    [enabled, resource, allResources],
  )
  // Hooks must run before any early return — call useState unconditionally.
  const [active, setActive] = React.useState<string>(
    () => tabs[0] ? `${tabs[0].resourceId}::${tabs[0].foreignKey}` : '',
  )
  React.useEffect(() => {
    if (tabs.length === 0) return
    if (tabs.some((r) => `${r.resourceId}::${r.foreignKey}` === active)) return
    setActive(`${tabs[0]!.resourceId}::${tabs[0]!.foreignKey}`)
  }, [active, tabs])
  if (tabs.length === 0) return null

  const labelFor = (r: RelatedResource): string =>
    r.label ?? allResources.find((x) => x.id === r.resourceId)?.name ?? r.resourceId

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('common:relatedRecords')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="w-full justify-start">
            {tabs.map((r) => {
              const key = `${r.resourceId}::${r.foreignKey}`
              return (
                <TabsTrigger key={key} value={key}>
                  {labelFor(r)}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {tabs.map((r) => {
            const key = `${r.resourceId}::${r.foreignKey}`
            return (
              <TabsContent key={key} value={key} className="mt-4">
                <RelatedRecordsTab
                  parentRecordId={recordId}
                  related={r}
                  active={active === key}
                />
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}
