# @modern-admin/react

## 0.1.3

### Patch Changes

- [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add custom base path support for SPA mounting. The router now accepts a basePath configuration (e.g., /admin) to mount the admin UI at any URL prefix. Navigation primitives (Link, useNavigate) automatically prepend the basepath. Added better-auth middleware, 'values' action support, and new E2E tests for GraphQL mutations and custom actions API.

- [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix(react): exclude built-in `values` action from list toolbar dropdown

  The `values` built-in action (server-only RPC used by column-filter popovers
  to fetch distinct values) was leaking into the list page's "Actions" toolbar
  because its name was missing from the built-in whitelist in `list-page.tsx`.
  Clicking it issued a no-op request (`field` empty → handler returns `[]`).
  Added `'values'` to `builtInActionNames` so it is filtered out alongside
  `'search'`.

## 0.1.2

### Patch Changes

- [`5685e32`](https://github.com/modern-admin/modern-admin/commit/5685e328b29e6305a2ab1fea60cafe10bfd1e311) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix(core,cache-redis,react,web,nest): handle BigInt fields and add configurable authBasePath

- Updated dependencies [[`5685e32`](https://github.com/modern-admin/modern-admin/commit/5685e328b29e6305a2ab1fea60cafe10bfd1e311)]:
  - @modern-admin/core@0.1.2
