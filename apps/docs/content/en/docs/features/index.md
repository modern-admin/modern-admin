---
title: Features & plugins
description: Local FeatureFns vs global plugins, merge order, Nest wiring, and how to author extensions.
---

# Features & plugins

Modern Admin builds each resource's **`ResourceOptions`** in a fixed pipeline before
`ResourceDecorator` is attached. Two extension points participate in that merge:

| Mechanism | Scope | Typical use |
|-----------|--------|-------------|
| **`FeatureFn`** | One resource | M2M editor, uploads, JSON sub-keys, password fields, history on a single model |
| **`GlobalPlugin`** | Every resource (with optional `include` / `exclude`) | Action logging, webhooks, wrapping a `FeatureFn` as a global default |

The orchestration lives in **`ResourcesFactory`** (`packages/core`). For the big picture
(package layout, `invoke()`, ports), see [Architecture](../architecture).

---

## Merge order (what wins)

For each `{ resource, options, features }` item:

1. **`features.reduce`** — each `FeatureFn` receives the accumulator and returns the next
   `ResourceOptions`. The chain starts from `{}`.
2. **`plugins.reduce`** — each matching `GlobalPlugin.apply(opts, resource)` mutates the
   result of step 1.
3. **`deepMerge(fromPlugins, options)`** — your explicit `options` from registration (or
   Nest metadata) are merged **on top**. User keys override; nested plain objects are merged
   deeply; **arrays are concatenated** (see `deepMerge` in `packages/core/src/utils/merge-options.ts`).

So: **adapter defaults → local features → global plugins → explicit `ResourceOptions`**,
with the last layer able to override anything above for scalars and shallow conflicts.

---

## `FeatureFn` — per-resource transforms

```ts
import type { FeatureFn, ResourceOptions } from '@modern-admin/core'

export function myFeature(): FeatureFn {
  return (opts: ResourceOptions): ResourceOptions => ({
    ...opts,
    properties: {
      ...opts.properties,
      notes: { description: 'Added by myFeature' },
    },
  })
}
```

Characteristics:

- **Pure-ish over options** — you only reshape `ResourceOptions` (properties, actions,
  `listProperties`, custom actions merged into `actions`, etc.). Side effects should be
  limited to registering companion services *before* the factory runs (see upload feature).
- **Composable** — pass `[featureA, featureB]`; order matters because each function sees
  the output of the previous one.
- **Nest** — declare on `@AdminResource({ features: [m2mFeature({ ... })] })`
  (`packages/nest/src/admin/decorators.ts`).

Resources that come **only** from a database scan (`databases: [...]` with no matching
`resources` override) get **`features: []`** by default. To attach features to an
auto-discovered table, register an explicit `{ resource, options, features }` entry with
the same logical resource id (see override behaviour in [Architecture](../architecture)).

---

## `GlobalPlugin` — cross-cutting transforms

```ts
import type { GlobalPlugin, ResourceOptions } from '@modern-admin/core'
import type { BaseResource } from '@modern-admin/core'

export function myPlugin(): GlobalPlugin {
  return {
    name: 'my-plugin',
    include: ['orders'],      // optional whitelist of decorated resource ids
    exclude: ['health'],      // optional blacklist
    apply: (opts: ResourceOptions, resource: BaseResource): ResourceOptions => ({
      ...opts,
      // e.g. append shared `after` hooks on built-in actions
    }),
  }
}
```

Filtering uses **`candidateId = options.id ?? resource.id()`** — the id your resource will
have **after** merge, i.e. `ResourceOptions.id` wins for `include` / `exclude` matching.
If you rename a resource with `id: 'accounts'` while the adapter table is still `users`,
whitelist **`accounts`**, not `users`.

Pass plugins to **`ModernAdmin`** (`plugins: [...]`) or to **`registerResources({ plugins })`**
(undefined falls back to the admin's constructor plugins). Example from the reference API:

```ts
ModernAdminModule.forRoot({
  plugins: [
    historyPlugin({ store: historyStore }),
    actionLoggingPlugin({ store: logStore }),
  ],
  // ...
})
```

### Wrapping a feature as a plugin

Many packages ship **both** a `FeatureFn` and a thin `GlobalPlugin` that forwards options
and adds `include` / `exclude`. Example: `historyPlugin` delegates to `historyFeature`
(`packages/feature-history`).

---

## Bundled feature packages

**Open-core (MIT):**

| Package | Export shape | Role |
|---------|--------------|------|
| [`@modern-admin/feature-upload`](./upload) | `uploadFeature()` | File columns + storage wiring |
| [`@modern-admin/feature-m2m`](./m2m) | `m2mFeature()` | Junction-backed multi-select |
| [`@modern-admin/feature-history`](./history) | `historyFeature()` / `historyPlugin()` | Revision snapshots |
| [`@modern-admin/feature-password`](./password) | `passwordsFeature()` | Virtual password fields + hashing hooks |
| [`@modern-admin/feature-json-by-key`](./json-by-key) | `jsonByKeyFeature()` | Friendly key/value editor for JSON |

**Pro tier** — [`modernadminpro.com`](https://modernadminpro.com) ($20/dev/month, Enterprise $50/dev/month):

| Package | Export shape | Role |
|---------|--------------|------|
| [`@modern-admin-pro/feature-logging`](./logging) | `actionLoggingFeature()` / `actionLoggingPlugin()` | Persist action audit rows |
| [`@modern-admin-pro/feature-webhooks`](./webhooks) | `webhookPlugin()` | After-hook based outbound events with HMAC, retries, admin UI |
| `@modern-admin-pro/feature-ai-fill` | `aiFillFeature()` | "Fill form from photo / URL / text" button via vision LLM |

These are **not** separate runtime subsystems — they only produce or wrap **`ResourceOptions`**
so the same REST / GraphQL / React stack keeps working.

---

## NestJS discovery

`@AdminResource` metadata may include `features` and all static `ResourceOptions` fields.
The scanner turns controllers into `ResourceWithOptions` entries for `registerResources`.
Global plugins still come from `ModernAdminModule.forRoot({ plugins })` (or per-call
`registerResources` args).

---

## Runtime is not the merge phase

Features and plugins run **at decoration time** (bootstrap). They prepare metadata and
hook points (`before` / `after` on actions, extra properties, etc.). Request-time behaviour
is still **`ModernAdmin.invoke()`** with `ActionContext` — see [Architecture](../architecture)
and [Decorators](../decorators).

---

## Checklist for authors

1. Prefer a **`FeatureFn`** when only one or a few resources need the behaviour.
2. Promote to **`GlobalPlugin`** when every resource (or a large subset) should get the same
   option mutations — use `include` / `exclude` to limit blast radius.
3. Remember **`deepMerge`** concatenates arrays; design feature outputs accordingly.
4. Match **`include` / `exclude`** against the **decorated** resource id (`options.id` override).
5. Keep **`packages/core`** free of ORM / HTTP imports — features belong in `packages/feature-*`
   or your app layer.
