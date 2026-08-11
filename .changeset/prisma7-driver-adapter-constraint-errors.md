---
'@modern-admin/adapter-prisma': patch
---

fix: map Prisma 7 driver-adapter constraint errors to 400 instead of 500

`toValidationError` only understood the legacy Rust engine's `meta.target`
(P2002) and `meta.field_name` (P2003). With a driver adapter (`@prisma/adapter-pg`
and friends) Prisma 7 reports constraints under
`meta.driverAdapterError.cause.constraint` instead, so both branches missed and
every unique/foreign-key conflict surfaced as an internal server error. All
three constraint shapes (`{ fields }`, `{ index }`, `{ foreignKey }`) are now
resolved to Prisma field names — honouring `@map` and composite indexes — with a
record-level 400 when the constraint carries no usable detail.

`delete()` also no longer bypasses the mapper: delete-restrict raises P2003 and
now yields a 400 explaining the record is still referenced, rather than a 500.
