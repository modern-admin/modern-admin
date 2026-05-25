# Anti-patterns, verification, reference index

## 15. Anti-patterns — do NOT

- Do not modify files under `node_modules/@modern-admin/*` — vendor it
  properly or open an issue.
- Do not hardcode user-visible text in components.
- Do not call `prisma.client.$transaction` from inside an action
  handler unless you also call `BaseRecord.errors` accounting — the
  framework's error mapper expects flat `params` with dotted paths.
- Do not store an arbitrary file on local disk in production — use
  `S3UploadProvider` (signed URLs supported via `signed: true`).
- Do not run `prisma migrate dev` against a shared production
  database from a developer laptop. Migrations run from CI only.
- Do not set `isVisible: false` and assume the data is hidden — it is
  only hidden from the UI. Use `isAccessible: false` for actual
  redaction.
- Do not use `crypto.randomUUID()`. UUID v7 only.
- Do not introduce `npm`/`yarn`/`pnpm` scripts. bun only.
- **Do not add a second Prisma `generator` to a host project's
  `schema.prisma`** just to produce an ESM client for admin-service.
  See deployment.md — one schema, one client, ESM/CJS interop is bun's job.
- **Do not write body-less resource classes** (`export class FooResource {}`).
  Always `extends AdminController<Row>`, even if you have no hooks
  today — you will tomorrow.
- **Do not skip the source registry** by calling
  `prismaSource('Model')` directly from a resource decorator. Always
  go through `adminSource('logical-id')` registered in
  `admin-sources.ts`. Without the registry, FK→reference resolution
  breaks and the resource cannot be reused under another adapter.
- **Do not forget `relatedResources`.** Every reverse relation
  (`Foo[]` or `Foo?` on the parent side) is a candidate for a tab on
  the show page; skip only after a deliberate decision.
- **Do not confuse `guard:` with a permission name.** `guard` is the
  i18n key of a confirm-dialog string (`'confirmDeleteApp'`), not a
  capability id. Permission gating is `isAccessible:` (or the role
  matrix). See permissions.md §6c.
- **Do not write code-pinned `isAccessible` that just checks
  `currentAdmin?.role`.** That is exactly what the `MaRole`
  permissions matrix exists for — see permissions.md §6a. Code-pinned
  `isAccessible` is for invariants no role may bypass.
- **Do not inline the action context type.** Always import
  `ActionContext` (or `AdminActionContext<Row>`) from
  `@modern-admin/core` / `@modern-admin/nest`. An inline
  `({ currentAdmin }: { currentAdmin?: { role?: string } })` strips
  `record`/`records`/`cache`/`admin` from autocomplete and rots
  on every API change.
- **Do not use the `actions:` key inside `@AdminResource({...})`.** The
  NestJS decorator type is `Omit<ResourceOptions, 'actions'>` —
  TypeScript will reject it (`TS2353: ... 'actions' does not exist in
  type 'AdminResourceMeta'`). All action config in NestJS style goes
  through `@Action(...)`, `@Before(...)`, `@After(...)` method
  decorators, or — for role gating — through `MaRole.permissions`.
  See permissions.md §6b–§6d.
- **Do not ship a transactional resource without any custom
  `@Action`.** If the domain spec contains verbs like *approve*,
  *publish*, *regenerate*, *retry*, *discard*, *send*, *archive*,
  every one of them is a `@Action({ actionType: 'record' | 'bulk' |
  'resource' })` method on the controller.
- **Do not repeat `isVisible: { list: true }` etc.** `true` is the
  default for every flag — overriding it just adds noise. Only
  override when flipping to `false`.
- **Do not stuff long text columns into `listProperties`.** A
  `text`/`textarea`/`richtext` column in the list view destroys the
  table layout. Either omit it from `listProperties` (show only on
  `show`/`edit`) or render a truncated `components.list` cell.
- **Do not override a base-class method with a mismatched
  signature.** `delete() {}` (`() => void`) is NOT assignable to
  `AdminController<TRow>.delete: (ctx) => Promise<RecordActionResponse>`
  and emits `TS2416`. Either return `Promise<never>` (for stubs that
  always throw) or use `override async delete(ctx: DeleteContext<Row>):
  Promise<RecordActionResponse> { return super.delete(ctx) }`
  (to wrap the default with `guard:`/`isVisible:`). See permissions.md §6d.
- **Do not use `as never` to silence `BetterAuthProvider` typing
  noise.** With a direct `import { auth } from './auth.js'`,
  `new BetterAuthProvider({ auth })` typechecks without any cast.
  Only the indirect `globalThis.__betterAuth` lookup needs a cast,
  and the right cast is the structural
  `auth as BetterAuthProviderOptions['auth']` — `as never` discards
  the contract. See auth-and-infra.md §11a.
- **Do not pass `url` to `RedisCacheProvider`.** `RedisCacheOptions`
  takes `client` (a Redis-like object), not a connection string.
  Construct ioredis yourself: `new Redis(process.env.REDIS_URL)`.
  See auth-and-infra.md §11b.
- **Do not skip `ModernAdminStaticUiModule`.** Mounting only the REST
  API leaves `/admin` (and every SPA deep link refresh) returning
  `404 Not Found`. Always import
  `ModernAdminStaticUiModule.forRoot({ path: '/admin', … })` next to
  `AdminModule`. See auth-and-infra.md §11c.
- **Do not use bare `toNodeHandler(auth)` at the `/admin/api/auth`
  prefix.** `toNodeHandler` is greedy — it returns its own 404 for any
  path it doesn't own, shadowing `AuthController`'s `/login`, `/me`,
  and `/ui-props` before NestJS can handle them. Always wrap it with
  `createBetterAuthMiddleware(toNodeHandler(auth))` from
  `@modern-admin/nest`. See auth-and-infra.md §11d.
- **Do not hardcode `/api/auth/...` in the SPA mount.** The default
  `authBasePath` in `runtimeConfig` is `/admin/api/auth` and matches the
  canonical scaffold's
  `app.use('/admin/api/auth', createBetterAuthMiddleware(toNodeHandler(auth)))`.
  If `main.ts` mounts Better Auth at one path and the SPA's
  `authBasePath` resolves to a different one, login posts to a
  non-existent endpoint and the browser shows
  `POST /api/auth/sign-in/email 404`. Keep `main.ts`, `auth.ts`'s
  `basePath`, and `runtimeConfig.authBasePath` in lockstep. See
  auth-and-infra.md §11d.
- **Do not patch `BigInt.prototype.toJSON` globally** to "fix"
  `TypeError: JSON.stringify cannot serialize BigInt`. The framework
  normalises `BigInt` columns to decimal strings inside
  `BaseRecord.toJSON()` — every list/show response is already
  JSON-safe. See auth-and-infra.md §11f.
- **Do not omit `admin()` plugin** from Better Auth when you use
  `rolesResourceId` or any `currentAdmin?.role` predicate. The plugin
  is what attaches `role` to the session; without it
  `currentAdmin.role` is always `undefined` (even when `ma_user.role`
  is `'admin'` in the database) and every role-gated action returns
  **403 Forbidden**. Add `admin({ defaultRole: '…' })` from
  `better-auth/plugins` alongside `apiKey({...})`. See
  auth-and-infra.md §11e.
- **Do not cherry-pick the `Ma*` schema fragment.** `setupPrismaSystem`
  resolves all 14 delegates eagerly on boot and throws
  `[modern-admin/system-prisma] missing delegate "prisma.maWebhook"`
  (or `maAiTask`, `maWebhookDelivery`, `maAiTaskEvent`) the moment the
  module loads. Typecheck stays green because the lookup is dynamic
  (`prisma[name]`) — only a real start exposes the gap. Always copy
  ALL fourteen `Ma*` models from
  `packages/system-prisma/prisma/modern-admin.prisma`: `MaUser`,
  `MaSession`, `MaAccount`, `MaVerification`, `MaApiKey`, `MaRole`,
  `MaLog`, `MaWebhook`, `MaWebhookDelivery`, `MaConfig`, `MaHistory`,
  `MaAiTask`, `MaAiTaskEvent`, `MaCache`. See deployment.md for the
  verification `grep` command.

## 16. Verification checklist before "done"

After integrating Modern Admin into a host project, confirm:

- [ ] `bun run dev` (or `scripts/dev.sh start api-prisma web`) starts
      cleanly; logs in `.dev-logs/` show no errors.
- [ ] The seed admin can log in at `/admin` and see every registered
      resource in the sidebar.
- [ ] Every sensitive column (`password`, `apiKey`, …) is absent from
      both the JSON response and the rendered UI.
- [ ] Every destructive action (`delete`, `bulkDelete`, custom
      "archive") has a `guard:` confirmation and an `isAccessible`
      role check.
- [ ] Every new visible string exists in all 9 locale files.
- [ ] `bun run typecheck` is green for the whole workspace.
- [ ] Tests added for every custom hook, custom action handler, and
      custom UI component (`bun test`).
- [ ] Mobile viewport (375px) renders the new resource's list, show,
      and edit pages without horizontal page scroll.

## 17. Reference index — where to look

- **Canonical resource controller** —
  `apps/_shared/src/admin/posts/posts.controller.ts` (hooks + record
  + bulk actions) and
  `apps/_shared/src/admin/customers/customers.controller.ts`
  (`passwordsFeature` + `aiFillFeature` + custom action).
  Read these BEFORE writing a new resource.
- **Canonical source registry** — `apps/_shared/src/admin/source-registry.ts`.
- **Canonical Prisma source factory** —
  `apps/api-prisma/src/admin-sources.ts` (logical-id mapping +
  relation field rewriting).
- **Canonical admin module wiring** — `apps/api-prisma/src/admin.module.ts`.
- Resource options schema — `packages/core/src/decorators/resource-options.ts`.
- Property options schema — `packages/core/src/decorators/property-options.ts`.
- Action options schema — `packages/core/src/decorators/action-options.ts`
  (especially: `guard` is a confirm-dialog i18n key, not a permission).
- `ActionContext` / `CurrentAdmin` types —
  `packages/core/src/actions/action.ts` and
  `packages/core/src/ports/current-admin.ts`. Use these in every
  `isAccessible`/`isVisible` callback.
- NestJS decorators (including `AdminController`, `@Before`, `@After`,
  `@Action`) — `packages/nest/src/admin/decorators.ts`.
- Built-in action handlers — `packages/core/src/actions/*.ts`.
- Permissions logic — `packages/core/src/modern-admin.ts` (`getRolePermissions`, `invoke`).
- Upload providers — `packages/feature-upload/src/providers/`.
- UI primitives — `packages/ui/src/components/`.
- Full architectural overview — `apps/docs/content/en/docs/architecture.md`.

When in doubt, read the source — every public export has a JSDoc
block explaining its contract.
