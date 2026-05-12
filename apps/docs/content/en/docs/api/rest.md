---
title: REST API
description: Complete reference for the automatically generated REST API exposed by @modern-admin/nest.
---

# REST API

`@modern-admin/nest` automatically generates a full HTTP API from your registered
resources. No schema files, no annotations on models — the API is derived entirely
from the same `ModernAdmin` instance that drives the frontend.

Both REST and [GraphQL](./graphql) share **exactly the same** access checks, hooks,
cache invalidation, and realtime events because both call `ModernAdmin.invoke()`.

---

## Authentication

Every protected endpoint requires either:

- **Session cookie** — `better-auth.session_token` set by Better Auth after login.
- **API key header** — `x-api-key: <token>` for machine-to-machine access.

A few endpoints are intentionally **public** (no auth required):

| Endpoint | Reason |
|---|---|
| `GET /admin/api/config` | Bootstrap config read by the SPA before login |
| `GET /admin/api/auth/ui-props` | Login-screen UI metadata (providers list) |

All other endpoints return `401 Unauthorized` when unauthenticated.

---

## GET /admin/api/config

Bootstrap config snapshot used by the SPA. Returns the serialised `ModernAdmin`
state: registered resources with their properties and actions, branding, and auth
UI hints.

**No auth required.**

```http
GET /admin/api/config
```

```json
{
  "rootPath": "/admin",
  "branding": { "companyName": "Acme Corp" },
  "auth": { "emailAndPassword": true, "providers": ["github"] },
  "resources": [
    {
      "id": "users",
      "titleProperty": "email",
      "properties": [ { "path": "id", "type": "uuid" } ],
      "actions": { "list": {}, "show": {} }
    }
  ]
}
```

---

## Auth endpoints

### GET /admin/api/auth/me

Returns the current user and their effective role permissions.
Returns `401` when unauthenticated — the frontend uses this as its
"show login screen" signal.

```http
GET /admin/api/auth/me
Cookie: better-auth.session_token=…
```

```json
{
  "user": {
    "id": "01956d2e-…",
    "email": "admin@example.com",
    "name": "Demo Admin",
    "role": "admin"
  },
  "permissions": {
    "*": ["*"]
  }
}
```

`permissions` is `null` when no `rolesResourceId` is configured, or when the role
has no permission row. The value is a UI hint — server-side enforcement always
runs in `invoke()`.

### GET /admin/api/auth/ui-props

Public metadata for the login screen: which auth providers are enabled,
whether email/password login is active, etc.

```http
GET /admin/api/auth/ui-props
```

```json
{
  "emailAndPassword": true,
  "providers": ["github"]
}
```

---

## Resource endpoints

All resource endpoints are under `/admin/api/resources/:resourceId/`.
They require authentication and pass through `ModernAdmin.invoke()`,
so all access checks, hooks, and cache invalidation apply automatically.

### GET …/actions/list

Paginated, filtered, sorted list of records.

```http
GET /admin/api/resources/users/actions/list
  ?page=1
  &perPage=25
  &sortBy=createdAt
  &direction=desc
  &filters[role]=admin
  &filters[email]=alice
```

| Query param | Default | Description |
|---|---|---|
| `page` | `1` | 1-based page number |
| `perPage` | `10` | Records per page |
| `sortBy` | — | Property path to sort by |
| `direction` | `asc` | `asc` or `desc` |
| `filters[<path>]` | — | Filter per property; multiple allowed |

```json
{
  "records": [
    { "id": "01956d2e-…", "params": { "id": "…", "email": "…" }, "title": "alice@…" }
  ],
  "meta": { "total": 142, "page": 1, "perPage": 25, "sortBy": "createdAt", "direction": "desc" }
}
```

Response is cached server-side (Redis, 30 s) and client-side (TanStack Query).

### GET …/records/:recordId/actions/show

Single record detail.

```http
GET /admin/api/resources/users/records/01956d2e-…/actions/show
```

```json
{
  "record": {
    "id": "01956d2e-…",
    "params": { "id": "…", "email": "…", "role": "admin" },
    "title": "alice@example.com",
    "populated": {},
    "errors": {},
    "baseError": null
  }
}
```

### POST …/actions/new

Create a new record.

```http
POST /admin/api/resources/users/actions/new
Content-Type: application/json

{
  "record": { "email": "bob@example.com", "role": "viewer" }
}
```

Returns the same `{ record }` shape as `show`. On validation failure returns
`422 Unprocessable Entity` with `{ propertyErrors, baseError }`.

### PATCH …/records/:recordId/actions/edit

Update a record. Only supplied fields are changed.

```http
PATCH /admin/api/resources/users/records/01956d2e-…/actions/edit
Content-Type: application/json

{
  "record": { "role": "editor" }
}
```

Returns the updated `{ record }`.

### DELETE …/records/:recordId/actions/delete

Delete a single record.

```http
DELETE /admin/api/resources/users/records/01956d2e-…/actions/delete
```

```json
{ "record": { "id": "01956d2e-…" } }
```

### POST …/actions/bulkDelete

Delete multiple records in one request.

```http
POST /admin/api/resources/users/actions/bulkDelete
Content-Type: application/json

{ "recordIds": ["01956d2e-…", "01956d2f-…"] }
```

```json
{ "records": [ ... ] }
```

### GET …/actions/search

Autocomplete search — used by reference comboboxes in the frontend.

```http
GET /admin/api/resources/users/actions/search?q=alice
```

```json
{
  "records": [
    { "id": "01956d2e-…", "title": "alice@example.com" }
  ]
}
```

### POST …/records/:recordId/actions/:action

Invoke a **custom record-scoped** action.

```http
POST /admin/api/resources/orders/records/01956d2e-…/actions/approve
Content-Type: application/json

{ "note": "Approved by finance" }
```

The body is passed as `request.payload`. Response shape is whatever the action
handler returns.

### POST …/actions/:action

Invoke a **custom resource-scoped** or **bulk** action.

```http
POST /admin/api/resources/orders/actions/exportCsv
```

For bulk actions include `recordIds` in the body:

```http
POST /admin/api/resources/orders/actions/sendReminder
Content-Type: application/json

{ "recordIds": ["01956d2e-…", "01956d2f-…"] }
```

---

## POST /admin/api/timeseries

Powers every chart on the dashboard. Also used for KPI tiles (`step: "all"`).
Requires auth. The raw SQL string is returned only when the caller's role is
in `timeseriesSqlRoles` (default `['admin']`).

```http
POST /admin/api/timeseries
Content-Type: application/json

{
  "resource": "orders",
  "dateField": "createdAt",
  "from": "2024-01-01T00:00:00Z",
  "to":   "2024-12-31T23:59:59Z",
  "step": "month",
  "metric": "sum",
  "field": "amount",
  "groupBy": "status",
  "topN": 5,
  "comparePrevious": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `resource` | string | yes | Resource id |
| `dateField` | string | yes | Property path of the date/datetime column |
| `from` | ISO datetime | yes | Range start |
| `to` | ISO datetime | yes | Range end |
| `step` | `day\|week\|month\|year\|all` | yes | Bucket size. `'all'` = single KPI value |
| `metric` | `count\|sum\|avg\|min\|max` | yes | Aggregation function |
| `field` | string | for sum/avg/min/max | Numeric field to aggregate |
| `groupBy` | string | no | Series breakdown column |
| `topN` | number (1–50) | no | Cap on series count (default 10) |
| `filters` | `Record<string, string>` | no | Pre-filter before aggregation |
| `comparePrevious` | boolean | no | Add prior-period data for delta calculations |

```json
{
  "supported": true,
  "series": [
    {
      "key": "completed",
      "points": [
        { "date": "2024-01-01", "value": 1240.50 },
        { "date": "2024-02-01", "value": 1890.00 }
      ]
    }
  ],
  "sql": "SELECT DATE_TRUNC('month', created_at) ..."
}
```

When the adapter does not support time-series, `supported` is `false` and `series` is `[]`.

---

## GET /admin/api/audit-log

Paginated action log. Requires auth and a role in `auditLogRoles` (default `['admin']`).
Returns `501` when no `logStore` is configured.

```http
GET /admin/api/audit-log
  ?resourceId=orders
  &actions=edit,delete
  &from=2024-01-01T00:00:00Z
  &limit=50
  &offset=0
```

| Query param | Description |
|---|---|
| `resourceId` | Filter by resource |
| `recordId` | Filter by record id |
| `userId` | Filter by actor id |
| `actions` | Comma-separated action names |
| `from` / `to` | ISO datetime range |
| `limit` | Max results (1–200, default 50) |
| `offset` | Pagination offset |

```json
{
  "events": [
    {
      "id": "01956d2e-…",
      "resourceId": "orders",
      "recordId": "01956d2f-…",
      "action": "edit",
      "userId": "01956d30-…",
      "payload": { "status": "shipped" },
      "createdAt": "2024-06-15T12:30:00.000Z"
    }
  ]
}
```

---

## API key endpoints

Requires **session** auth. API keys cannot manage other keys.

### GET /admin/api/api-keys

List the current user's API keys (secrets are never returned).

```json
{
  "keys": [
    {
      "id": "01956d2e-…",
      "name": "CI deploy key",
      "start": "sk_…",
      "enabled": true,
      "permissions": { "deployments": ["create"], "*": ["list"] },
      "expiresAt": "2025-03-01T00:00:00.000Z",
      "createdAt": "2024-12-01T00:00:00.000Z"
    }
  ]
}
```

### POST /admin/api/api-keys

Create a key. The plaintext `key` is returned **only** in the create response.

```http
POST /admin/api/api-keys
Content-Type: application/json

{
  "name": "CI deploy key",
  "expiresInDays": 90,
  "permissions": { "deployments": ["create"], "*": ["list"] }
}
```

```json
{
  "key": "sk_live_…",
  "record": { "id": "…", "name": "CI deploy key" }
}
```

### PATCH /admin/api/api-keys/:id

Update name, permissions, or expiry. All fields are optional.
Pass `"expiresInDays": null` to clear the expiry.

### DELETE /admin/api/api-keys/:id

```json
{ "success": true }
```

---

## History endpoints

Requires auth and a role in `historyRoles` (default `['admin']`).
Returns `501` when no `historyStore` is configured.

### GET …/resources/:resourceId/records/:recordId/history

```http
GET /admin/api/resources/orders/records/01956d2e-…/history?limit=20&offset=0
```

```json
{
  "revisions": [
    {
      "id": "01956d2e-…",
      "resourceId": "orders",
      "recordId": "01956d2f-…",
      "action": "edit",
      "actorId": "01956d30-…",
      "snapshot": { "status": "shipped" },
      "snapshotBefore": { "status": "pending" },
      "createdAt": "2024-06-15T12:30:00.000Z"
    }
  ]
}
```

### GET …/history/:revisionId

Single revision by id.

### POST …/history/:revisionId/revert

Reverts a record to the state it was in **before** the revision was applied.
Internally calls `invoke()` with the `edit` action so all hooks and access checks
run normally.

```http
POST /admin/api/resources/orders/records/01956d2e-…/history/01956d31-…/revert
Content-Type: application/json

{ "reason": "Rolled back accidental change" }
```

---

## Webhook endpoints

Requires auth and a role in `webhookRoles` (default `['admin']`).
Returns `501` when no `webhookStore` is configured.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/api/webhooks` | List all webhooks |
| `POST` | `/admin/api/webhooks` | Create a webhook |
| `PATCH` | `/admin/api/webhooks/:id` | Update a webhook |
| `DELETE` | `/admin/api/webhooks/:id` | Delete a webhook |
| `GET` | `/admin/api/webhooks/:id/deliveries` | Delivery history |
| `POST` | `/admin/api/webhooks/:id/test` | Send a `webhook.test` event immediately |

Create / update body:

```json
{
  "url": "https://example.com/hooks/modern-admin",
  "events": ["created", "updated", "deleted"],
  "resources": ["orders", "users"],
  "secret": "whsec_…",
  "enabled": true
}
```

---

## HTTP status codes

| Code | When |
|---|---|
| `200 OK` | Success |
| `400 Bad Request` | Zod validation failure on request body / query params |
| `401 Unauthorized` | Not authenticated |
| `403 Forbidden` | Authenticated but access denied (`isAccessible: false`, role gate) |
| `404 Not Found` | Resource, record, or action not found |
| `422 Unprocessable Entity` | `ValidationError` from the adapter (unique constraint, FK violation) |
| `501 Not Implemented` | Optional subsystem (history, audit log, webhooks) not configured |

`ValidationError` response shape:

```json
{
  "statusCode": 422,
  "message": "Validation failed",
  "propertyErrors": {
    "email": { "message": "is not unique", "type": "unique" }
  },
  "baseError": null
}
```
