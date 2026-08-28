# @modern-admin/api-stock

## 0.9.0

### Minor Changes

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

### Patch Changes

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Allow importing finalized media from the API Stock `aitohumanize.com` CDN.
  Generated files are served from `fileN.aitohumanize.com`, which the download
  host allowlist previously rejected — so applying a generated image failed with
  `502 Generated file host is not allowed` before it could be stored through the
  upload adapter. Hosts can still widen the allowlist via `allowedDownloadHosts`.

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Support media generation without a public webhook in local development. When
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
- Updated dependencies [[`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126), [`42d36b0`](https://github.com/modern-admin/modern-admin/commit/42d36b09166f23ad8ac644c4aead2341c13f25b2), [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126)]:
  - @modern-admin/core@0.9.0
