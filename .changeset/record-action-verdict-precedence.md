---
'@modern-admin/react': patch
---

`isRecordActionAllowed` now prefers the per-record verdict over the resource snapshot instead of requiring both.

`ResourceJSON.actions` is serialized without a record, so a record-dependent
predicate such as
`isAccessible: ({ record }) => record?.params.ownerId === currentAdmin.id`
evaluates false there and the action is dropped for the whole resource. AND-ing
that with `RecordJSON.recordActions` blanked out row menus (show/edit/delete)
and raised a forbidden page on the edit route for records the server would have
happily acted on.

`recordActions` is computed by `invoke()` from the principal gates (api-key
allowlist, role matrix) _and_ `isVisible`/`isAccessible` resolved against that
record, so it already covers everything the resource-level list covers. It is
now authoritative when present; the resource snapshot remains the fallback for
records that never went through `invoke()` and carry no verdict.
