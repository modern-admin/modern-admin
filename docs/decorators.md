---
title: Decorators
description: ResourceDecorator, PropertyDecorator, ActionDecorator and the options model.
---

# Decorators

Decorators wrap raw `BaseResource` / `BaseProperty` instances with
user-supplied options, producing the runtime metadata the transports and
the frontend consume.

## ResourceOptions

```ts
interface ResourceOptions {
  id?: string                                  // override resource id
  navigation?: { name: string; icon?: string } // sidebar grouping
  properties?: Record<string, PropertyOptions>
  actions?: Record<string, ActionOptions>
  listProperties?: string[]
  showProperties?: string[]
  editProperties?: string[]
  filterProperties?: string[]
  titleProperty?: string
  hooks?: {
    before?: ResourceHook[]
    after?: ResourceHook[]
  }
  features?: FeatureFunction[]
}
```

Pass options at registration:

```ts
ModernAdminModule.forRoot({
  databases: [...],
  resources: [
    {
      id: 'User',
      options: {
        navigation: { name: 'People', icon: 'Users' },
        listProperties: ['email', 'role', 'createdAt'],
        properties: {
          email: { isTitle: true },
          passwordHash: { isVisible: false },
          role: {
            availableValues: [
              { value: 'admin', label: 'Admin' },
              { value: 'user', label: 'User' },
            ],
          },
        },
      },
    },
  ],
})
```

## PropertyOptions

```ts
interface PropertyOptions {
  type?: PropertyType                  // override inferred type
  isTitle?: boolean
  isId?: boolean
  isVisible?: boolean | { list?: boolean; show?: boolean; edit?: boolean; filter?: boolean }
  isRequired?: boolean
  isSortable?: boolean
  position?: number
  reference?: string                   // resource id this FK points to
  availableValues?: Array<{ value: unknown; label: string }>
  components?: {
    list?: string
    show?: string
    edit?: string
    filter?: string
  }
  props?: Record<string, unknown>      // forwarded to custom components
}
```

`isVisible` accepts either a boolean (applies to every view) or per-view
toggles for fine-grained control. `components.*` strings reference names
registered with the `ComponentLoader`.

## ActionOptions

```ts
interface ActionOptions {
  isAccessible?: AccessPredicate       // (ctx) => boolean | Promise<boolean>
  isVisible?: AccessPredicate
  before?: ActionHook[]                // run before handler
  after?: ActionHook[]                 // run after handler
  handler?: ActionHandler              // override built-in handler
  cache?: { ttlMs?: number } | false
  guards?: string[]                    // names of registered global guards
}
```

Built-in actions: `list`, `show`, `new`, `edit`, `delete`, `bulkDelete`,
`search`. Define your own:

```ts
{
  actions: {
    archive: {
      actionType: 'record',
      handler: async ({ resource, record, currentAdmin }) => {
        await resource.update(record.id(), { archivedAt: new Date() })
        return { record }
      },
      isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
    },
  },
}
```

Custom actions are exposed automatically over both REST
(`POST /admin/api/resources/:id/actions/archive`) and GraphQL
(`mutation { archive(id: ...) }`).

## Validation with Zod

Resource and property options are validated with Zod 4 schemas at
registration time, so misconfigurations fail fast with a useful error
rather than at first request. The same schemas drive the auto-generated
OpenAPI / GraphQL types.

## Features

`features` is a list of higher-order functions that mutate options
before they're frozen — the canonical way to share cross-cutting concerns
(soft-delete, audit trail, file uploads):

```ts
import { softDelete } from '@modern-admin/feature-soft-delete'

{ id: 'Document', features: [softDelete()] }
```

(Feature packages aren't part of the v0 release; the hook exists so the
ecosystem can grow.)
