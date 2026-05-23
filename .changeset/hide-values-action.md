---
"@modern-admin/react": patch
---

fix(react): exclude built-in `values` action from list toolbar dropdown

The `values` built-in action (server-only RPC used by column-filter popovers
to fetch distinct values) was leaking into the list page's "Actions" toolbar
because its name was missing from the built-in whitelist in `list-page.tsx`.
Clicking it issued a no-op request (`field` empty → handler returns `[]`).
Added `'values'` to `builtInActionNames` so it is filtered out alongside
`'search'`.
