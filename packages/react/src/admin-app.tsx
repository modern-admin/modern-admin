// Top-level CRUD shell. Composes provider + router + sidebar + content. Apps
// can render this directly or mount individual pages inside their own layout.

import * as React from 'react'
import { useResources, useAdminConfig } from './hooks.js'
import { Link, Router, useRoute } from './router.js'
import { ResourceListPage } from './pages/list-page.js'
import { ResourceShowPage } from './pages/show-page.js'
import { ResourceEditPage } from './pages/edit-page.js'
import { HomePage } from './pages/home-page.js'

function Sidebar(): React.ReactElement {
  const { data } = useAdminConfig()
  const resources = useResources()
  return (
    <aside className="flex h-full w-60 flex-col gap-2 border-r border-slate-200 bg-white px-3 py-4">
      <div className="px-2 pb-3 text-lg font-semibold">
        {data?.branding?.companyName ?? 'modern-admin'}
      </div>
      <Link
        to={{ name: 'home' }}
        className="rounded-md px-2 py-1 text-sm hover:bg-slate-100"
      >
        Dashboard
      </Link>
      <div className="mt-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Resources
      </div>
      <ul className="flex flex-col gap-1">
        {resources.map((r) => (
          <li key={r.id}>
            <Link
              to={{ name: 'list', resourceId: r.id }}
              className="block rounded-md px-2 py-1 text-sm hover:bg-slate-100"
            >
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function RouteSwitch(): React.ReactElement {
  const route = useRoute()
  switch (route.name) {
    case 'list':
      return <ResourceListPage resourceId={route.resourceId} />
    case 'show':
      return <ResourceShowPage resourceId={route.resourceId} recordId={route.recordId} />
    case 'edit':
      return <ResourceEditPage resourceId={route.resourceId} recordId={route.recordId} />
    case 'new':
      return <ResourceEditPage resourceId={route.resourceId} />
    case 'home':
    default:
      return <HomePage />
  }
}

export function AdminApp(): React.ReactElement {
  return (
    <Router>
      <div className="flex h-screen w-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <RouteSwitch />
        </main>
      </div>
    </Router>
  )
}
