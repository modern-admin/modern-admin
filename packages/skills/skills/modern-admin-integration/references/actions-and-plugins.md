# Built-in actions, plugins, hooks vs. actions

## Built-in actions and when to override

| Action       | Override `handler` when …                                |
|--------------|----------------------------------------------------------|
| `list`       | You need cross-table joins / search not expressible as filters. Prefer adding `filterProperties` first. |
| `show`       | Almost never — use `relatedResources` for sibling lists. |
| `new`        | You need server-computed fields, side effects (send email), or a multi-step flow. Use `Before('new')` hook for derived columns instead when possible. |
| `edit`       | Same as `new`. Prefer `Before('edit')` for `updatedAt`-style writes. |
| `delete`     | You need soft-delete. Override handler and call `resource.update()` to set `deletedAt`. Combine with `filterProperties` to hide deleted rows by default. |
| `bulkDelete` | Same as `delete`. |
| `search`     | Reference autocomplete uses this — extend when the searchable column is not the auto-detected one. |

For business-specific operations, **add a custom action** instead of
overriding a built-in. Custom action types:

- `resource` — toolbar button on the list page.
- `record` — per-row button in the row-actions menu.
- `bulk` — toolbar button when rows are selected.

## Plugins / features — selection guide

Modern Admin has two plugin scopes:

- **Local features** (`FeatureFn`, attached per resource via
  `options.features: []`) — run first, transform a single resource.
- **Global plugins** (`GlobalPlugin`, attached to `ModernAdmin.forRoot`
  via `plugins: []`) — run on every resource, may filter via
  `include`/`exclude`.

Built-in catalog:

| Package                          | Scope          | Use when …                                |
|----------------------------------|----------------|-------------------------------------------|
| `@modern-admin/feature-upload`   | local          | Resource has file/image columns. Pick `LocalUploadProvider` for dev, `S3UploadProvider` for prod. |
| `@modern-admin/feature-m2m`      | local          | Tags-style join table between two resources. |
| `@modern-admin/feature-password` | local          | Login-credential resource where the DB stores a hash. |
| `@modern-admin/feature-history`  | local + global | Need per-row revisions and a "history" tab on show. Use **global** if every resource should be tracked. |
| `@modern-admin-pro/feature-logging` (Pro) | local + global | Audit log of every action (who-did-what-when). Almost always wire globally with `actionLoggingPlugin`. |
| `@modern-admin-pro/feature-webhooks` (Pro) | global         | Outbound webhooks on create/edit/delete events. |
| `@modern-admin-pro/feature-ai-fill` (Pro)  | per-resource   | Add an AI "fill from photo / URL / text" button to the new/edit form. Configure model in env. |
| `@modern-admin/feature-json-by-key` | local       | Single JSON column whose schema branches on a sibling field's value (e.g. `type === 'image' ⇒ {url,alt}`). |

Auto-installed by the scaffold: `feature-upload`, `feature-history`.
The Pro tier (`@modern-admin-pro/feature-logging|webhooks|ai-fill`)
ships separately under a commercial license — see
[modernadminpro.com](https://modernadminpro.com).

Decision tree for "should I write a feature?": **don't**, unless the
transform applies to ≥3 resources. For one-off needs, hooks +
properties.custom are enough.

## Hooks vs. custom actions vs. handlers

| Need                                       | Use                          |
|--------------------------------------------|------------------------------|
| Add `updatedBy` on every edit              | `Before('edit')` hook        |
| Send welcome email after signup            | `After('new')` hook          |
| Validate cross-field invariant pre-save    | `Before('edit')` + throw `ValidationError` |
| Add a button "Send invoice" per row        | Custom `record` action       |
| Replace built-in delete with soft delete   | Override `actions.delete.handler` |
| Background job (slow, retryable)           | Enqueue via `@modern-admin/queue`, return immediately |
| Cross-table aggregation                    | Custom resource action, not a hook |

Hooks must be **idempotent** — they may run on retries.
