# Permissions — roles × actions matrix

Modern Admin gates every `invoke()` call through a permissions matrix.
Wiring:

```ts
ModernAdminModule.forRoot({
  // …
  rolesResourceId: 'roles',  // resource id whose rows are MaRole
})
```

The matrix lives in `MaRole.permissions` as JSON:

```json
{ "products": ["list", "show"], "orders": ["*"], "*": ["list"] }
```

Wildcards: `"*"` as a key matches any resource; `["*"]` as the value
matches any action. The `admin` role is seeded with `{ "*": ["*"] }`.

## 6a. WHERE policy lives — DB-driven (default) vs code-pinned

There are two places a permission rule can live:

- **DB-driven (default, preferred)** — `MaRole.permissions` JSON,
  edited by admins through the panel. Use this for any rule the
  product owner might want to tune without a deploy. Seed
  baseline roles (`admin`, `editor`, `viewer`) at boot, then never
  touch them in code.
- **Code-pinned** — `isAccessible` on a property or action in the
  resource decorator. Use this **only** for rules that are
  invariants of the data model (e.g. nobody, ever, including the
  `admin` role, may PATCH an immutable audit row). If you find
  yourself writing `currentAdmin?.role === 'admin'` inside a
  resource, you are duplicating what the role matrix already
  expresses — delete the code and seed the role instead.

> **Anti-pattern:** declaring both at once. If `MaRole(admin).permissions`
> already grants `delete` on `apps`, and the resource also pins
> `isAccessible: ({currentAdmin}) => currentAdmin?.role === 'admin'`,
> changing the role in the panel produces no effect — the code
> overrides it. Pick one. The DB-driven path is almost always right.

## 6b. NestJS-style: `actions:` key is FORBIDDEN in `@AdminResource`

> ⚠️ This is the #1 mistake AI agents make. Read it twice.

The `@modern-admin/nest` decorator type is
`AdminResourceMeta = Omit<ResourceOptions, 'actions'> & { source, ... }`
(see `packages/nest/src/admin/decorators.ts`). **The `actions:` key
does not exist on the decorator argument.** Any code like

```ts
// ❌ TS2353: Object literal may only specify known properties,
//    and 'actions' does not exist in type 'AdminResourceMeta'.
@AdminResource({
  source: () => adminSource('reviews'),
  actions: {
    new:    { isAccessible: false },
    delete: { isAccessible: false },
  },
})
```

is rejected by TypeScript and would not work even with a cast — the
scanner never reads it. In the NestJS style, actions are configured
**exclusively** through method-level decorators on the controller
class:

| Goal                                          | How to achieve it in NestJS style                  |
|-----------------------------------------------|----------------------------------------------------|
| Add a custom action (button)                  | `@Action({...})` method                            |
| Override a built-in handler                   | Method named `delete` / `edit` / `new` / `bulkDelete` / `list` / `show` / `search` |
| Add a `before`/`after` hook                   | `@Before('actionName')` / `@After('actionName')`   |
| **Hide / disable a built-in for a role**      | **Permissions matrix in `MaRole.permissions`** — NOT in code |
| Hide a built-in for ALL roles (true invariant)| `@Action({ name: 'delete', actionType: 'record', isAccessible: false })` on a stub method (see 6c) |

## 6c. Making a resource read-only — through roles, not code

The right way to make `Review` / `AuditLog` / `Reply` read-only is to
seed the `editor` (and any other non-admin) role with a restricted
permissions list:

```ts
// One-time seed (e.g. in a Nest `OnApplicationBootstrap` hook).
await prisma.maRole.upsert({
  where: { id: 'editor' },
  create: {
    id: 'editor',
    description: 'Read-only for review streams, full access to apps',
    permissions: {
      // read-only resources
      reviews:              ['list', 'show'],
      'audit-logs':         ['list', 'show'],
      replies:              ['list', 'show'],
      'review-processings': ['list', 'show', 'edit'],
      // editable resources
      apps:           ['*'],
      moderators:     ['*'],
      'global-config':['list', 'show', 'edit'],
      // hidden entirely
      admins: [],
      roles:  [],
    },
    isBuiltin: false,
  },
  update: {},
})
```

The `admin` role keeps `{ "*": ["*"] }`. Users with no role match get
nothing.

This single-source-of-truth approach beats the "disable in code"
approach because:
- The product owner can tune permissions through the admin UI
  without a redeploy.
- All visibility rules live in one place (the role row).
- The same logic governs the API and the UI — `invoke()` rejects
  unauthorised calls server-side regardless of what the UI does.

## 6d. Overriding a built-in action — signature MUST match the base class

Every built-in (`list`/`show`/`new`/`edit`/`delete`/`bulkDelete`/`search`)
is declared on `AdminController<TRow>` with a precise signature, e.g.

```ts
async delete(ctx: DeleteContext<TRow>): Promise<RecordActionResponse>
```

Any override on a subclass MUST keep that signature, otherwise
TypeScript emits `TS2416: Property 'delete' in type 'X' is not
assignable to the same property in base type 'AdminController<...>'`.

**Wrong** — `() => void` is not `(ctx) => Promise<RecordActionResponse>`:

```ts
// ❌ TS2416
@Action({ actionType: 'record', name: 'delete', guard: 'confirmDeleteAdmin' })
delete() {}
```

**Right** — add `guard:` while delegating to the default handler:

```ts
import type { DeleteContext, RecordActionResponse } from '@modern-admin/nest'

@Action({ actionType: 'record', name: 'delete', guard: 'confirmDeleteAdmin' })
override async delete(ctx: DeleteContext<MaUserRow>): Promise<RecordActionResponse> {
  return super.delete(ctx)   // keep default behaviour
}
```

The `super.delete(ctx)` call is essential — without it, the action
becomes a no-op (the empty method replaces the default handler).

## 6e. True invariants — `@Action`-decorated stub with `never` return

When a constraint must hold **for every role, including `admin`**
(e.g. `ReviewProcessing` rows are created by the background pipeline
only, never by humans), express it with an `isAccessible: false`
stub. Return type **must be either `Promise<never>` or `never`** so
that the override is signature-compatible with the base class
(`never` is a subtype of every other type):

```ts
import {
  Action,
  AdminController,
  AdminResource,
  type DeleteContext,
  type BulkDeleteContext,
  type NewContext,
  type RecordActionResponse,
} from '@modern-admin/nest'

@AdminResource({
  source: () => adminSource('audit-logs'),
  // …
})
export class AuditLogAdminController extends AdminController<AuditLogRow> {
  @Action({ actionType: 'resource', name: 'new', isAccessible: false })
  override async new(_ctx: NewContext<AuditLogRow>): Promise<never> {
    throw new Error('unreachable')
  }
  @Action({ actionType: 'record', name: 'delete', isAccessible: false })
  override async delete(_ctx: DeleteContext<AuditLogRow>): Promise<never> {
    throw new Error('unreachable')
  }
  @Action({ actionType: 'bulk', name: 'bulkDelete', isAccessible: false })
  override async bulkDelete(_ctx: BulkDeleteContext<AuditLogRow>): Promise<never> {
    throw new Error('unreachable')
  }
}
```

Mind the parameter types — `DeleteContext<Row>` for `delete`,
`BulkDeleteContext<Row>` for `bulkDelete`, `NewContext<Row>` for
`new`, `EditContext<Row>` for `edit`. Importing the wrong context
type produces another `TS2416`.

This is verbose by design — if you find yourself writing it on more
than one or two resources, you almost certainly want the role-matrix
path from §6c instead.

## 6f. Sealed-invariant `isAccessible` on properties (allowed)

`properties:` IS part of `AdminResourceMeta`, so property-level
`isAccessible` is fine:

```ts
import type { ActionContext } from '@modern-admin/core'

properties: {
  // A column whose value comes from a third-party system and must
  // never be human-edited (rustore feedback id, stripe charge id, …):
  rustoreFeedbackId: {
    isVisible:    { edit: false },   // hide from UI
    isAccessible: ({ action }: ActionContext) => action.name !== 'edit',
  },
}
```

Always type the callback as `(ctx: ActionContext) => boolean` and
import `ActionContext` from `@modern-admin/core`. Do NOT write inline
types like `({ currentAdmin }: { currentAdmin?: { role?: string } })`
— they shadow real fields (`record`, `records`, `cache`, `admin`,
`resource`) and rot when the API changes.

## 6g. `guard` — confirmation prompt, NOT a permission name

`guard: '<i18n-key>'` is the translation key for the confirm dialog
the UI shows before running a destructive action. It is **not** a
permission identifier. It lives on the `@Action(...)` decorator, not
on a hypothetical `actions:` map.

```ts
@Action({
  actionType: 'record',
  name: 'delete',
  // ↓ The built-in delete handler keeps running; this just adds a confirm.
  guard: 'confirmDeleteApp',   // i18n key, resolved client-side
})
delete() { /* … override or empty to keep default … */ }
```

Then add `confirmDeleteApp: 'Delete app "{name}"? This cannot be
undone.'` to every locale file (conventions.md §12).

`guard:` and `isAccessible:` are **independent**. `isAccessible: false`
hides the button; `guard: 'foo'` adds a confirmation prompt to the
visible button. They are not interchangeable.
