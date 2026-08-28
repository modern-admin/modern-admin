# @modern-admin/api-stock

## 0.9.0

### Minor Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

### Patch Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Allow importing finalized media from the API Stock `aitohumanize.com` CDN.
  Generated files are served from `fileN.aitohumanize.com`, which the download
  host allowlist previously rejected — so applying a generated image failed with
  `502 Generated file host is not allowed` before it could be stored through the
  upload adapter. Hosts can still widen the allowlist via `allowedDownloadHosts`.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Support media generation without a public webhook in local development. When
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
- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/core@0.9.0
