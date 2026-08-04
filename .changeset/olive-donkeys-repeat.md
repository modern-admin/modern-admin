---
'@modern-admin/react': patch
'@modern-admin/adapter-prisma': patch
---

Build the filter panel from the filter view instead of the list columns.

`ResourceListPage` fed `FilterControl` the same property set it fed the table,
so everything the server computed for the `filter` view was discarded by the
SPA. `filterProperties` and `isVisible: { filter: … }` read as working config —
documented, typed, Zod-validated, merged with replace semantics — while having
no effect at all, and a property hidden from the table was silently
unfilterable. The panel (and the per-column header filters) now render
`propertyOrder.filter`, which the API has been serialising all along.

Two consequences of the old behaviour are fixed with it:

- **Filtering by id works when you ask for it.** The filter view drops id
  columns by default; listing one in `filterProperties` (or setting
  `isVisible: { filter: true }`) now actually surfaces it, so a record can be
  looked up by an id pasted from a log or a support ticket.
- **A field excluded from filtering can no longer reach the adapter.** Virtual
  properties marked `isVisible: { filter: false }` used to stay in the panel and
  emit a `where` clause against a column that doesn't exist.

Two adjacent defects surfaced while verifying the above, both of which made the
id filter useless even once it rendered:

- Adapters return no distinct values for non-string columns, and the string
  filter field read an *empty* distinct list as "low cardinality" — switching to
  a checkbox picker with nothing to check, so the value could not be typed.
- `@modern-admin/adapter-prisma` gated `contains`/`startsWith`/`endsWith` on the
  core property *type*, so on a `String @id` (surfaced as `uuid`) the clause was
  dropped and the unfiltered list came back. The gate now asks the underlying
  DMMF field. `eq`/`neq` deliberately stay exact on those columns — the
  case-insensitive branch costs the btree index, and id/FK equality is the hot
  path.
