---
title: Frontend
description: ModernAdminProvider, hooks, AdminApp, and customizing components.
---

# Frontend

`@modern-admin/react` provides the React runtime: a provider, hooks for
each REST action, a tiny hash-based router, and a default `<AdminApp />`
shell. `@modern-admin/ui` ships shadcn/ui primitives styled with our
theme tokens.

## Provider

```tsx
import { ModernAdminProvider, AdminApp } from '@modern-admin/react'
import '@modern-admin/ui/styles.css'

export default function Root(): React.ReactElement {
  return (
    <ModernAdminProvider apiBaseUrl="/admin/api">
      <AdminApp />
    </ModernAdminProvider>
  )
}
```

The provider creates a `QueryClient` automatically; pass your own with
`queryClient={...}` if you want shared cache across the app.

## Hooks

| Hook                | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `useAdminConfig`    | Read the server-supplied resource config |
| `useResource(id)`   | Look up a single resource descriptor     |
| `useResources()`    | All resources                            |
| `useRecords(id, q)` | Paginated list with filter/sort          |
| `useRecord(id, recId)` | Single record                         |
| `useCreateRecord(id)`  | TanStack mutation                     |
| `useUpdateRecord(id)`  | TanStack mutation                     |
| `useDeleteRecord(id)`  | TanStack mutation                     |

Every hook is a thin wrapper over TanStack Query; compose freely.

## Routing

The bundled `<Router />` is a hash-based router — survives refresh and
back/forward, and works as a drop-in inside any host router (TanStack
Router, React Router, Next, …) without conflict. URLs:

```
#/                                          → home
#/resources/:resourceId                     → list
#/resources/:resourceId/new                 → create
#/resources/:resourceId/:recordId           → show
#/resources/:resourceId/:recordId/edit      → edit
```

Use `buildHref(route)` and `<Link to={...} />` for navigation.

## Theming

`@modern-admin/ui/styles.css` exposes shadcn-style HSL CSS variables on
`:root` and `.dark`. Toggle modes via:

```ts
import { initTheme, setThemeMode } from '@modern-admin/ui'

initTheme()              // applies persisted preference, follows system
setThemeMode('dark')     // 'light' | 'dark' | 'system'
```

Override any token to rebrand:

```css
:root {
  --primary: 142 76% 36%;     /* emerald */
  --radius: 0.75rem;
}
```

## Custom components

Replace any property's display/editor with a custom component via
`ComponentLoader`:

```ts
import { ComponentLoader } from '@modern-admin/react'
import { JsonEditor } from './JsonEditor'

const loader = new ComponentLoader()
loader.add('JsonEditor', JsonEditor)

<ModernAdminProvider apiBaseUrl="/admin/api" components={loader}>
  ...
</ModernAdminProvider>
```

Reference the component by name in your resource options:

```ts
{
  id: 'Settings',
  options: {
    properties: {
      payload: { components: { edit: 'JsonEditor', show: 'JsonEditor' } },
    },
  },
}
```

No runtime bundling — components are just regular ES modules imported by
the host app. This keeps cold-start fast and debugging straightforward.
