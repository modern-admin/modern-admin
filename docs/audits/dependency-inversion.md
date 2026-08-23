# Dependency Inversion audit

**Scope:** all 24 workspace packages under `packages/*`, plus the reference
applications under `apps/*`.

**Method:** workspace dependency graph and source imports, followed by targeted
inspection of the composition roots and the seven boundaries identified by the
previous audit: LLM generation, frontend data access, authentication routes,
GraphQL DI, upload transport packaging, telemetry, and background jobs.

**Updated:** 2026-08-23 · **Baseline:** `6ffece0` (PR branch after merging the
latest `origin/main`)

---

## Verdict

Dependency inversion is consistently applied across core, adapters, system
stores, transports, and the frontend after the remediation in this PR. Core
owns framework-wide abstractions and the shared framework-instance token;
concrete infrastructure remains replaceable at composition roots.

The seven findings from the 2026-07-31 audit have been rechecked against the
current tree. All now have an explicit substitution seam. OpenRouter and the
upload transport stack are optional peers, GraphQL no longer depends on the
REST package, and telemetry no longer runs as an unstubbable concrete call from
Nest bootstrap.

The built-in defaults remain intentionally pragmatic: OpenRouter for LLM calls,
Better Auth-compatible routes in the browser client, BullMQ for background
jobs, and the bundled Nest upload subpath. Defaults no longer define the
interfaces consumed by high-level policy.

---

## Dependency rules that hold

### Core remains infrastructure-free

`@modern-admin/core` has one runtime dependency, `zod`. It does not import an
ORM, transport, browser framework, queue, telemetry backend, or vendor SDK.
Runtime services and system stores are expressed as ports under
`packages/core/src/ports/` and `packages/core/src/system/ports.ts`.

The shared `MODERN_ADMIN` DI token is now owned by core in
`packages/core/src/ports/di-tokens.ts`. It deliberately retains the historical
`Symbol.for('@modern-admin/nest:ModernAdmin')` registry key for binary/runtime
compatibility while allowing sibling transports to inject the framework
instance without importing `@modern-admin/nest`.

### Adapters still point inward

The database, system-store, auth, cache, feature, realtime, and transport
packages depend on core abstractions. No ORM adapter imports a transport or an
application. Prisma, Drizzle, Redis, and Better Auth implementations remain
outside core and are supplied by the host.

### Null-object defaults remain local to the abstraction

`ModernAdmin` still defaults to `AnonymousAuthProvider`, `NoopCacheProvider`,
`ComponentLoader`, and `NoopRealtimeBus`. These implementations have no
external infrastructure and preserve the zero-configuration core runtime.

### The `invoke()` pipeline remains the transport boundary

REST, GraphQL, and realtime authorization continue to delegate framework
policy to `ModernAdmin` and its ports. The GraphQL HTTP guard is now local to
the GraphQL transport and resolves identity through core's `IAuthProvider`.

---

## Finding status

| # | Previous finding | Previous severity | Current status |
| --- | --- | --- | --- |
| F1 | AI assistant compiled directly against OpenRouter | High | Resolved |
| F2 | React context depended on concrete `AdminClient` | High | Resolved |
| F3 | Browser client fixed Better Auth route shapes | Medium | Resolved |
| F4 | `graphql` depended on sibling `nest` transport | Medium | Resolved |
| F5 | Upload feature installed Nest transport dependencies unconditionally | Medium | Resolved |
| F6 | Nest bootstrap called concrete telemetry functions | Low | Resolved |
| F7 | AI background work had no broker-neutral dispatch seam | Low | Resolved |

### F1 — LLM provider port

`packages/nest/src/llm-provider.ts` defines the consumer-owned
`ILlmProvider` contract. `AiAssistantService` supplies prompts, tools, messages,
and step policy to that interface and only reads provider identity/defaults
through it.

`OpenRouterLlmProvider` is the built-in adapter. It dynamically imports `ai`
and `@openrouter/ai-sdk-provider` only when generation is requested; both SDKs
are optional peers of `@modern-admin/nest`. A host can pass any implementation
through `ModernAdminModuleOptions.aiAssistant.provider` without changing the
assistant task lifecycle, authorization, tool assembly, citations, or UI
actions.

The stored/public provider field is now a string rather than the former
single-member `'openrouter'` literal, so alternate providers cross the settings
boundary without unsafe casts.

### F2 — Frontend client abstraction and injectable browser effects

`packages/react/src/client.ts` now exports `IAdminClient`, and
`ModernAdminProvider`, hooks, dashboard query code, and export helpers consume
that structural contract. Applications may inject a REST client, a GraphQL
client, a test double, or another implementation through the existing
`client` prop.

The bundled `AdminClient` implements the interface and accepts `fetchImpl`,
`storage`, `getCurrentUrl`, and `navigate` adapters. Unit tests no longer need
to mutate `globalThis.fetch`; browser-only effects have explicit seams.

### F3 — Provider-specific authentication routes

`AdminClientOptions.authPaths` independently configures email sign-in, social
sign-in, and sign-out endpoints. `authBasePath` and its Better Auth-compatible
defaults remain for backward compatibility. The same option is exposed by
`ModernAdminRuntimeConfig`, so the standalone SPA can use a different auth
provider without rebuilding the bundle.

### F4 — GraphQL and REST are siblings

`@modern-admin/graphql` no longer declares or imports `@modern-admin/nest`.
It uses core's shared `MODERN_ADMIN` token and its own
`ModernAdminGraphqlAuthGuard`, which authenticates through `IAuthProvider`.
The package remains a Nest-hosted GraphQL transport and therefore peers on the
Nest framework itself, but it no longer pulls in the REST transport.

### F5 — Upload transport dependencies are optional

The root `@modern-admin/feature-upload` dependency set is core-only. Nest,
Busboy, RxJS, and reflection packages are optional peers used by the explicit
`@modern-admin/feature-upload/nest` subpath; GraphQL and AWS SDK integrations
follow the same optional-peer pattern. Consumers using only the feature policy
or a custom transport no longer install the bundled Nest upload stack.

### F6 — Telemetry is injected at bootstrap

`ModernAdminModuleOptions.telemetry` is a host-supplied callback. Nest bootstrap
invokes it asynchronously and isolates failures, but no longer imports
`@modern-admin/telemetry` or performs network I/O directly.

`@modern-admin/telemetry` exports `reportModernAdminTelemetry` as the built-in
adapter. The reference Prisma application wires it explicitly, preserving the
existing `MODERN_ADMIN_TELEMETRY=1` opt-in behavior at the composition root.

### F7 — Broker-neutral AI dispatch

`IAiAssistantQueueDispatcher` owns the assistant's enqueue contract. A host can
provide it through `aiAssistant.queue.dispatcher`; in that mode the Nest module
does not register its BullMQ queue or worker. The external adapter is
responsible for delivering `AiAssistantChatJobData` to
`AiAssistantService.runChatJob()`.

BullMQ remains the backwards-compatible default. `forRootAsync` exposes the
matching synchronous `aiAssistantQueue: 'bullmq' | 'external'` selector because
Nest freezes imports/providers before the async options factory resolves, and
bootstrap validation rejects a selector/dispatcher mismatch.

---

## Remaining design constraints

These are deliberate defaults rather than inversion violations:

- `@modern-admin/graphql` and `@modern-admin/feature-upload/nest` are Nest-hosted
  integrations and therefore require Nest when those entry points are used.
- The bundled REST client still implements the Modern Admin REST protocol; an
  alternative protocol is supplied as another `IAdminClient` implementation.
- The default LLM adapter requires an API key. A custom `ILlmProvider` decides
  its own readiness through `isConfigured()` and may ignore the key.
- The default AI queue remains BullMQ to preserve existing deployments; the
  service's dispatch policy no longer depends on BullMQ's API.

---

## Regression checks

Changes to these boundaries should preserve the following checks:

1. `packages/core` must not import ORM, Nest, React, queue, telemetry, or vendor
   SDK modules.
2. `packages/graphql` must not import or depend on `@modern-admin/nest`.
3. React hooks and providers must use `IAdminClient`, not require the concrete
   REST implementation.
4. LLM SDK imports must remain lazy and confined to provider adapters.
5. Nest bootstrap must call only the configured telemetry callback.
6. Selecting an external AI queue must omit BullMQ registration and require a
   dispatcher.
7. Importing the root upload feature must not require Nest/Busboy/RxJS to be
   installed.
