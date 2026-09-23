---
'@modern-admin/core': patch
'@modern-admin/react': patch
---

Render action controls according to the current principal's permissions.

The role matrix and the API-key allowlist were only enforced inside
`invoke()`, so `ResourceJSON.actions` and `RecordJSON.recordActions` still
advertised actions the principal could not run — a read-only role saw New /
Edit / Delete buttons that answered 403 on click.

`ModernAdmin.toJSON(currentAdmin)` and the per-record annotation now run the
same gates the pipeline does, and `annotateRecordActions` reports an empty
array (instead of omitting the field) when every action is denied, so the
client cannot fail open on it. On the client, list, show, edit and wizard
pages consult the resulting verdict through the new `isRecordActionAllowed`
helper: denied controls are not rendered, and a row whose record may be
neither edited nor viewed is inert rather than navigating into a dead end.
