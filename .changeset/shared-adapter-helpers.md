---
"@modern-admin/core": patch
"@modern-admin/adapter-prisma": patch
"@modern-admin/adapter-drizzle": patch
"@modern-admin/system-prisma": patch
"@modern-admin/system-drizzle": patch
---

Deduplicate adapter and system-store internals into shared `@modern-admin/core`
helpers. The Prisma and Drizzle adapters no longer keep byte-identical copies of
the filter-value coercion (`coerceScalar`, `isRangeValue`, `between` parsing) or
the time-series utilities (`isoDate`, `toNumber`, `stringifyKey`, `toDate`,
`sumValues`, `buildDisplaySql`, row cap) — these now live in
`core/src/adapters/filter-coerce.ts` and `core/src/adapters/time-series.ts`.
Likewise the six ORM-backed system stores share one set of row → domain mappers
in `core/src/system/row-mappers.ts` instead of maintaining duplicates in
`system-prisma` and `system-drizzle`. Behaviour is unchanged; adapter-specific
pieces (Prisma `where` objects, Drizzle SQL builders, top-N/`__other__`
bucketing, the config scope-id sentinel) stay in their adapters.
