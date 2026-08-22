// Keeps `document.title` in step with the active route.
//
// The SPA shipped a single static <title> from the HTML shell, so every page
// looked identical in the tab strip, in browser history, and in a bookmark —
// on a panel whose whole job is navigating between resources.

import * as React from 'react'
import { useResources } from './hooks.js'
import { useI18n } from './i18n.js'
import { useRoute } from './router.js'

/**
 * Sets `document.title` to `<section> · <appName>`, or just `<appName>` on
 * the home page. Section names come from the same localized resource list
 * the sidebar renders, so they follow the active locale and any
 * `metadataTranslations` overrides.
 */
export function useDocumentTitle(appName: string): void {
  const route = useRoute()
  const { t } = useI18n()
  const resources = useResources()

  const section = React.useMemo<string | null>(() => {
    switch (route.name) {
    case 'home':
      return null
    case 'audit-log':
      return t('audit:title')
    case 'cache':
      return t('cache:title')
    case 'settings':
      return t('settings:menuItem')
    case 'extension':
      return null
    default: {
      // Every remaining route is resource-scoped (list/show/edit/new/action).
      const resourceId = 'resourceId' in route ? route.resourceId : undefined
      if (!resourceId) return null
      return resources.find((r) => r.id === resourceId)?.name ?? resourceId
    }
    }
  }, [route, resources, t])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = section ? `${section} · ${appName}` : appName
  }, [section, appName])
}
