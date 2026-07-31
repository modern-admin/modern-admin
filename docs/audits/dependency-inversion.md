# Dependency Inversion audit

**Scope:** all 24 workspace packages under `packages/*`, plus the reference apps
under `apps/*`.
**Method:** package-level dependency graph (`dependencies` / `peerDependencies`)
cross-checked against actual source imports, plus targeted reads of the wiring
points (`ModernAdmin` constructor, `ResourcesFactory`, the Nest module, the
React provider).
**Date:** 2026-07-31 · **Commit:** `86a3dc3`

---

## Verdict

Dependency inversion is applied systematically across the core and data layers.
High-level modules own the abstractions, concrete implementations live in
separate packages behind `peerDependencies`, and every dependency arrow points
inward — there is not a single upward import from an adapter package into a
transport or into an app.

The violations that do exist are concentrated at the edges of the system, in
subsystems added after the port pattern was established: the AI assistant, the
frontend HTTP client, and the packaging of `feature-upload` / `graphql`. None of
them compromises the core; two of them are worth fixing.

---

## What holds

### 1. The core has no concrete dependencies

`@modern-admin/core` declares exactly one runtime dependency: `zod`. A search
across `packages/core/src` for `@prisma`, `drizzle`, `@nestjs`, `react`,
`ioredis`, `better-auth`, `graphql`, `express`, `socket`, `node:` builtins, and
`process.env` returns zero matches. The layering rule in `CLAUDE.md` is not
aspirational — it is actually enforced in the source.

### 2. Ports are owned by the high-level module

This is the defining shape of DIP: the consumer declares the interface, the
implementer conforms to it. Both port families live in core.

Runtime ports — `packages/core/src/ports/`:

| Port | File | Default (same layer) |
| --- | --- | --- |
| `IAuthProvider` | `auth-provider.ts:15` | `AnonymousAuthProvider` (`:40`) |
| `ICacheProvider` | `cache-provider.ts:6` | `NoopCacheProvider` (`:31`), `MemoryCacheProvider` (`:66`) |
| `IRealtimeBus` | `realtime-bus.ts:24` | `NoopRealtimeBus` (`:34`), `InMemoryRealtimeBus` (`:51`) |
| `IComponentLoader` | `component-loader.ts` | `ComponentLoader` |

System stores — `packages/core/src/system/ports.ts`:
`ILogStore` (`:30`), `IQueryableLogStore` (`:35`), `IWebhookStore` (`:52`),
`IConfigStore` (`:68`), `IHistoryStore` (`:90`), `IAiTaskStore` (`:118`),
`ICacheStore` (`:158`), aggregated by `ISystemStores` (`:179`). In-memory
defaults sit alongside in `system/memory.ts`.

### 3. Null-object defaults plus constructor injection

`packages/core/src/modern-admin.ts:184-191`:

```ts
this.auth = options.auth ?? new AnonymousAuthProvider()
this.cache = withCrossInstanceInvalidation(options.cache ?? new NoopCacheProvider())
this.componentLoader = options.componentLoader ?? new ComponentLoader()
this.realtime = options.realtime ?? new NoopRealtimeBus()
```

Core instantiates only its own no-op defaults, so the framework boots with zero
infrastructure and every dependency stays substitutable. Defaults living in the
same layer as the interface is the correct placement — it does not re-couple the
high-level module to anything external.

### 4. Every arrow points inward

Verified per package by grepping `@modern-admin/*` specifiers in the sources:

| Package | Imports | ORM / infra placement |
| --- | --- | --- |
| `adapter-prisma` | `core` only | `@prisma/client` → peer |
| `adapter-drizzle` | `core` only | `drizzle-orm` → peer |
| `system-prisma` | `core` only | `@prisma/client` → peer |
| `system-drizzle` | `core` only | `drizzle-orm` → peer |
| `cache-redis` | `core` only | `ioredis` → peer |
| `auth-better-auth` | `core` only | `better-auth` → peer |

No adapter imports a transport, an app, or another adapter. Keeping the ORM
clients in `peerDependencies` means the abstraction, not the implementation,
decides what the host installs.

### 5. The adapter contract is structural

`packages/core/src/factories/resources-factory.ts:40`:

```ts
export interface Adapter { Database: DatabaseClass; Resource: ResourceClass }
```

paired with runtime dispatch via `isAdapterFor(db)`. Core never names Prisma or
Drizzle — not in a type, not in a union, not in a string literal. Adding a third
ORM requires no change to core.

### 6. Function-level ports where an interface would be overkill

- `packages/feature-password/src/types.ts:37` — `hash: (plain: string) => string | Promise<string>`.
  The host picks argon2 / bcrypt; the feature never imports either.
- `aiAssistant.rawQuery?: (sql: string) => Promise<unknown[]>` (`packages/nest/src/module.ts`) —
  the SQL executor is injected, with the read-only enforcement contract
  documented at the injection point.
- `apps/_shared/src/admin/source-registry.ts` — shared `@AdminResource`
  controllers reference resources by logical id and resolve through a registry
  the host populates before bootstrap. This is the cleanest instance of the
  pattern in the repo: the same controller code runs against an in-memory table
  or a Prisma model without knowing which.

### 7. Pluggable storage in `feature-upload`

`IUploadProvider` (`packages/feature-upload/src/types.ts:45`) with
`LocalUploadProvider` and `S3UploadProvider` as built-ins, and a documented
example of a third-party GCS implementation. Four methods, no leakage of S3
concepts into the interface.

### 8. Nest DI keyed by symbols, not classes

`packages/nest/src/tokens.ts` — `MODERN_ADMIN`, `MODERN_ADMIN_OPTIONS`,
`MODERN_ADMIN_API_KEY_SERVICE`, with the rationale stated in the file header
("avoid coupling to specific concrete classes so consumers can swap
implementations through `forRoot()`"). Controllers inject `ModernAdmin` by token
and go through `invoke()` rather than reaching into resources.

### 9. The frontend realtime layer is transport-agnostic

`packages/react/src/realtime.ts:20`:

```ts
export type RealtimeSubscriber = (handler: (event: RealtimeWireEvent) => void) => () => void
```

The socket.io implementation is isolated in `realtime-socket.ts` specifically so
hosts bringing their own wire carry no socket.io dependency. Worth noting as the
in-repo precedent for how finding #2 below should be resolved.

---

## Findings

### F1 — The AI assistant is compiled against OpenRouter · **High**

`packages/nest/src/ai-assistant.service.ts`

```
:13    import { createOpenRouter } from '@openrouter/ai-sdk-provider'
:41    provider?: 'openrouter'
:50    provider: 'openrouter'
:259   const openrouter = createOpenRouter({ apiKey: settings.apiKey, ... })
:336   model: openrouter(settings.model ?? 'google/gemini-3.1-flash-lite-preview')
```

This is the only subsystem in the framework without a port. High-level policy —
task lifecycle, tool assembly, per-role permission gates, i18n, `uiActions`
collection — is welded to one vendor SDK. The `provider` field is typed as a
single-member string literal, so the shape does not even anticipate a second
implementation.

Packaging makes it worse: `ai` and `@openrouter/ai-sdk-provider` are hard
`dependencies` of `@modern-admin/nest`, so every consumer installs the LLM SDK
even with the assistant disabled — unlike every ORM and cache backend in the
repo, which are peers.

**Fix:** define `ILlmProvider` in core (`generate(messages, tools, opts)`),
ship `OpenRouterLlmProvider` as its own package or behind an optional peer, and
inject it through `ModernAdminModuleOptions.aiAssistant.provider`.

### F2 — `AdminClient` is a concrete class with no interface · **High**

`packages/react/src/client.ts:68` — roughly 1100 lines, calling `fetch` directly
(`:96`, `:682`, `:712`) and touching browser globals (`window.localStorage` at
`:133-155`, `window.location` at `:211-220`).

The context is typed by the implementation, not an abstraction:

```ts
// packages/react/src/provider.tsx:70
export const useAdminClient = (): AdminClient => useAdminContext().client
```

Every hook in `hooks.ts` and every data-fetching component depends on that
concrete type. Two consequences are already visible:

1. `packages/react/test/client.test.ts:6-15` has to monkey-patch
   `globalThis.fetch` and restore it in a `finally`, because there is no seam to
   inject a stub through.
2. The GraphQL transport that exists on the backend (`@modern-admin/graphql`)
   cannot be substituted on the frontend — the UI can only speak REST.

The same package already solves the equivalent problem correctly for realtime
(see #9 above), which makes this an inconsistency rather than a missing idea.

**Fix:** extract `IAdminClient` and type the context by it. Minimal interim step:
accept a `fetchImpl` / `transport` option in `AdminClientOptions` so tests and
alternative transports have a seam.

### F3 — `AdminClient` hardcodes Better Auth's URL shape · **Medium**

`packages/react/src/client.ts:85-86`

```ts
this.signInPath = `${this.authBasePath}/sign-in/email`
this.signOutPath = `${this.authBasePath}/sign-out`
```

The backend hides the auth provider behind `IAuthProvider`; the frontend bakes
in one provider's endpoint contract. Only the base path is configurable, not the
path shapes, so swapping the backend `IAuthProvider` implementation for one with
different routes silently breaks the client. Layer asymmetry rather than a hard
break.

### F4 — `@modern-admin/graphql` depends on `@modern-admin/nest` · **Medium**

`controller.ts:26`, `module.ts:6`, `schema-holder.ts:10`,
`subscription-server.ts:18` all import from `@modern-admin/nest` — for the
`MODERN_ADMIN` DI token and `ModernAdminAuthGuard`.

Two transports at the same layer, one depending on the other for shared
plumbing. The GraphQL transport cannot be used without pulling in the REST one.

**Fix:** move the shared DI tokens and the guard into a neutral package (or
expose the token constants from core) so both transports depend on that, not on
each other.

### F5 — `feature-upload` pulls NestJS into the feature layer · **Medium**

`packages/feature-upload/src/nest/` ships `upload.module.ts`,
`upload.controller.ts`, and `upload-sweeper.service.ts`, with `@nestjs/common`,
`@nestjs/core`, `rxjs`, and `busboy` as unconditional `dependencies`.

The other five `feature-*` packages depend on `@modern-admin/core` alone. This
one couples a mid-level policy package to a specific transport framework.
Containment in a subdirectory limits the blast radius, but the install cost is
paid by everyone.

**Fix:** split out `@modern-admin/feature-upload-nest`, or demote the Nest deps
to optional peers.

### F6 — Telemetry is called as a concrete function · **Low**

`packages/nest/src/admin/bootstrap.service.ts:14` imports `collectTelemetryInfo`
and `reportTelemetry`; `packages/telemetry/src/report.ts:34` performs a bare
`fetch`. No port, no injection point.

Gated behind `MODERN_ADMIN_TELEMETRY=1` and therefore low-impact in practice,
but it is unstubbable network I/O on the bootstrap path.

### F7 — BullMQ is the only queue implementation · **Low**

`packages/nest/src/ai-assistant.service.ts:104` injects a bullmq `Queue`;
`ai-assistant.processor.ts` extends `WorkerHost` from `@nestjs/bullmq`.
`@modern-admin/queue` is a BullMQ module, not an abstraction over queues.

Mitigated by conditional registration — `packages/nest/src/module.ts:219` only
imports `QueueModule` when the assistant is enabled. Not worth acting on unless
a second broker becomes a requirement.

---

## Priority

| # | Finding | Severity | Effort |
| --- | --- | --- | --- |
| F1 | AI assistant bound to OpenRouter | High | Medium |
| F2 | `AdminClient` has no interface | High | Medium |
| F3 | Better Auth URL shape in the client | Medium | Low |
| F4 | `graphql` → `nest` dependency | Medium | Low |
| F5 | `feature-upload` carries NestJS | Medium | Medium |
| F6 | Telemetry has no port | Low | Low |
| F7 | Queue is BullMQ-only | Low | High |

F1 and F2 are the two that carry real cost. F3–F5 are packaging and layering
hygiene. F6 and F7 are noted for completeness.
