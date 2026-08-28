---
'@modern-admin/core': minor
'@modern-admin/nest': minor
'@modern-admin/api-stock': patch
---

Support media generation without a public webhook in local development. When
`webhookBaseUrl` is not configured and `NODE_ENV` is not `production`, the
server submits the provider request without a webhook and polls `getStatus`
until the task finishes, instead of failing with a `412` Precondition Failed.
In production the webhook remains mandatory: a missing `webhookBaseUrl` is
rejected up front, before any task is created. `MediaGenerationCreateInput.webhookUrl`
is now optional. The poll loop re-checks the task status before applying a
provider result, so cancelling ("stop waiting") while a `getStatus` request is
in flight can no longer resurrect the task into `succeeded`. On startup the
service re-arms polling for any webhook-less task still `running`, so a process
restart (frequent in local `--watch` dev) no longer freezes it forever.
