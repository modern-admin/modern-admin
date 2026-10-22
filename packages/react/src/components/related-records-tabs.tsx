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
import { useNavigate, useRoute, type ListQueryState, type ShowQueryState } from '../router.js'
import type { RelatedResource, ResourceJSON } from '../types.js'

interface RelatedRecordsTabProps {
  parentRecordId: string
  related: RelatedResource
  active: boolean
  query: ListQueryState
  onQueryChange: (next: ListQueryState) => void
}

function RelatedRecordsTab({
  parentRecordId,
  related,
  active,
  query,
  onQueryChange,
}: RelatedRecordsTabProps): React.ReactElement | null {
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
      onQueryChange={onQueryChange}
      lockedFilters={{ [related.foreignKey]: { operator: 'eq', value: parentRecordId } }}
      // The host `CardContent` already pads the tab body — don't double it,
      // or the table stops spanning the block's full width.
      embedPadding={false}
      // Export stays on: `ResourceListPage` folds `lockedFilters` into the
      // query it hands the dialog, so the download holds exactly this
      // parent's related records — not the whole resource.
      features={{
        breadcrumbs: false,
        title: false,
        create: false,
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
  const route = useRoute()
  const navigate = useNavigate()
  const query =
    route.name === 'show' && route.resourceId === resource.id && route.recordId === recordId
      ? route.query
      : undefined
  // Master switch: `showRelatedResources: false` in the resource config hides
  // the whole section regardless of configured/auto-discovered relations.
  const enabled = resource.showRelatedResources !== false
  const tabs = React.useMemo(
    () => (enabled ? resolveRelatedResources(resource, allResources) : []),
    [enabled, resource, allResources],
  )
  const activeTab =
    tabs.find((r) => `${r.resourceId}::${r.foreignKey}` === query?.relatedTab) ?? tabs[0]
  const active = activeTab ? `${activeTab.resourceId}::${activeTab.foreignKey}` : ''
  const updateQuery = (changes: Partial<ShowQueryState>): void => {
    navigate({ name: 'show', resourceId: resource.id, recordId, query: { ...query, ...changes } })
  }
  if (tabs.length === 0) return null

  const labelFor = (r: RelatedResource): string =>
    r.label ? t(r.label) : (allResources.find((x) => x.id === r.resourceId)?.name ?? r.resourceId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('common:relatedRecords')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          key={recordId}
          value={active}
          onValueChange={(relatedTab) => updateQuery({ relatedTab })}
        >
          <TabsList className="h-auto w-full flex-wrap justify-start">
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
                  query={{ perPage: 10, ...query?.related?.[key] }}
                  onQueryChange={(next) =>
                    updateQuery({
                      relatedTab: key,
                      related: {
                        ...query?.related,
                        // ResourceListPage omits its default size (20) from
                        // updates. Related tables have a different default.
                        [key]: { ...next, perPage: next.perPage ?? 20 },
                      },
                    })
                  }
                />
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}
