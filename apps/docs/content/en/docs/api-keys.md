---
title: API Keys
description: Programmatic access to your admin API with fine-grained permissions.
---

# API Keys

API keys provide secure, programmatic access to your Modern Admin API without requiring a user session. They're ideal for integrations, scripts, and automated workflows that need to interact with your admin data.

---

## What are API keys

An API key is a long-lived secret token that authenticates requests to your admin API. Unlike session-based authentication (cookies), API keys:

- **Don't expire with browser sessions** — they work indefinitely until revoked
- **Can be scoped to specific resources and actions** — grant only the permissions needed
- **Are ideal for server-to-server communication** — no browser or user interaction required
- **Support audit trails** — every API key request is logged with the key's identity

**When to use API keys:**

- **External integrations** — Connect third-party services (CRM, analytics, billing)
- **Automated scripts** — Scheduled jobs, data imports/exports, maintenance tasks
- **Webhook handlers** — Process inbound webhooks that need to update your admin data
- **Development tools** — CLI tools, testing scripts, local development environments

**When NOT to use API keys:**

- **Browser-based applications** — Use session authentication instead
- **Mobile apps** — Use proper OAuth flows or session tokens
- **Short-lived operations** — API keys are long-lived by design

---

## How API keys work

### Authentication flow

```
Client request with API key
        ↓
HTTP header: x-api-key: sk-abc123...
        ↓
BetterAuthProvider.verifyApiKey()
        ↓
Attach permissions to CurrentAdmin.apiKey
        ↓
ModernAdmin.invoke() checks apiKeyAllows()
        ↓
Action executes if permissions match
```

### Permission model

API keys use a resource-action permission model:

```ts
{
  "users": ["list", "show", "search"],      // can read users
  "orders": ["list", "show", "new", "edit"], // can manage orders
  "products": ["*"],                         // wildcard: all actions on products
  "*": ["list", "show"]                      // wildcard: these actions on all resources
}
```

**Permission rules:**

- **Resource-level** — Key specifies which resources it can access
- **Action-level** — Within each resource, key specifies which actions are allowed
- **Wildcards** — `'*'` as action means all actions; `'*'` as resource means all resources
- **Deny by default** — If a resource or action isn't listed, access is denied

### Permission checking

When an API key-authenticated request hits `ModernAdmin.invoke()`:

1. The key's permissions are attached to `currentAdmin.apiKey`
2. Before executing any action, `apiKeyAllows()` checks if the permission matches
3. If the permission doesn't match, a `ForbiddenError` is thrown
4. This check runs **before** resource-level `isAccessible` guards

---

## Setup and configuration

### Backend setup

API keys require a Better Auth instance with the `api-key` plugin installed:

```bash
bun add better-auth @better-auth/api-key
```

Configure Better Auth:

```ts
import { betterAuth } from 'better-auth'
import { apiKey } from '@better-auth/api-key'

export const auth = betterAuth({
  database: db,
  emailAndPassword: { enabled: true },
  plugins: [
    apiKey(),  // enables API key functionality
  ],
})
```

Register the API key service in Modern Admin:

```ts
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { MODERN_ADMIN_API_KEY_SERVICE } from '@modern-admin/nest'

@Module({
  imports: [
    ModernAdminModule.forRoot({
      auth: new BetterAuthProvider({ auth }),
      // ... other options
    }),
  ],
  providers: [
    {
      provide: MODERN_ADMIN_API_KEY_SERVICE,
      useFactory: (auth: BetterAuthProvider) => auth.getApiKeyAdmin(),
      inject: [BetterAuthProvider],
    },
  ],
})
export class AdminModule {}
```

### Frontend setup

The API keys UI is automatically included in `@modern-admin/react`'s settings when the backend service is registered. No additional frontend configuration is needed.

---

## Managing API keys

### Creating an API key

**Via the UI:**

1. Navigate to **Settings → API Keys**
2. Click **"Create new API key"**
3. Fill in:
   - **Name** — Descriptive name (e.g., "Stripe webhook handler", "Daily sync script")
   - **Permissions** — Select resources and actions to grant
   - **Expires in (days)** — Optional expiry (leave blank for no expiry)
4. Click **"Create"**
5. **Copy the key immediately** — it's shown only once!

**Via the API:**

```ts
import { AdminClient } from '@modern-admin/react'

const client = new AdminClient({ baseUrl: '/admin/api' })

const result = await client.createApiKey({
  name: 'Stripe webhook handler',
  permissions: {
    orders: ['list', 'show', 'new', 'edit'],
    customers: ['list', 'show'],
  },
  expiresInDays: 365,  // expires in 1 year
})

console.log(result.key)  // "sk-abc123..." — SAVE THIS!
console.log(result.record)  // key metadata (id, prefix, etc.)
```

### Listing API keys

**Via the UI:**

Navigate to **Settings → API Keys** to see all keys belonging to your account.

**Via the API:**

```ts
const { keys } = await client.listApiKeys()
console.log(keys)
// [
//   {
//     id: "key_abc123",
//     name: "Stripe webhook handler",
//     prefix: "sk_abc",
//     enabled: true,
//     permissions: { orders: ["list", "show", "new", "edit"] },
//     expiresAt: "2025-05-11T00:00:00Z",
//     lastRequest: "2024-05-11T10:30:00Z",
//     createdAt: "2024-05-11T00:00:00Z",
//     updatedAt: "2024-05-11T10:30:00Z"
//   }
// ]
```

### Updating an API key

**Via the UI:**

1. Navigate to **Settings → API Keys**
2. Click on a key to edit
3. Modify name, enabled status, permissions, or expiry
4. Click **"Save"**

**Via the API:**

```ts
await client.updateApiKey('key_abc123', {
  name: 'Updated name',
  enabled: false,  // temporarily disable
  permissions: {
    orders: ['list', 'show'],  // reduce permissions
  },
  expiresInDays: null,  // remove expiry
})
```

### Deleting an API key

**Via the UI:**

1. Navigate to **Settings → API Keys**
2. Click **"Delete"** on a key
3. Confirm deletion

**Via the API:**

```ts
await client.deleteApiKey('key_abc123')
```

---

## Using API keys

### Making authenticated requests

Use the `x-api-key` header to authenticate:

```bash
curl -X GET \
  'http://localhost:3000/admin/api/resources/users/actions/list' \
  -H 'x-api-key: sk-abc123...'
```

**Using fetch:**

```ts
const response = await fetch('/admin/api/resources/users/actions/list', {
  headers: {
    'x-api-key': 'sk-abc123...',
  },
})
```

**Using AdminClient:**

```ts
// AdminClient doesn't support API keys directly — use fetch or axios
// for API key authentication. This is by design to keep keys server-side.
```

### Permission examples

**Read-only access to users:**

```ts
{
  permissions: {
    users: ['list', 'show', 'search'],
  }
}
```

**Full access to orders, read-only to products:**

```ts
{
  permissions: {
    orders: ['*'],      // all actions on orders
    products: ['list', 'show'],
  }
}
```

**Wildcard for read-only across all resources:**

```ts
{
  permissions: {
    '*': ['list', 'show', 'search'],
  }
}
```

**Custom action access:**

```ts
{
  permissions: {
    orders: ['list', 'show', 'approve', 'reject'],  // includes custom actions
  }
}
```

---

## Security best practices

### Key storage

**DO:**

- Store API keys in environment variables (`API_KEY=sk-abc...`)
- Use secret management services (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys regularly (e.g., every 90 days)
- Use separate keys for different services/environments

**DON'T:**

- Commit API keys to git
- Log API keys in plaintext
- Share keys via email/chat
- Embed keys in client-side JavaScript

### Key scoping

**Principle of least privilege:**

- Grant only the minimum permissions needed
- Use specific resources instead of wildcards when possible
- Use specific actions instead of `'*'` when possible
- Review and audit permissions regularly

**Example:**

```ts
// ❌ Too broad
{
  permissions: {
    '*': ['*'],  // full access to everything
  }
}

// ✅ Scoped appropriately
{
  permissions: {
    orders: ['list', 'show', 'new'],  // only what's needed
  }
}
```

### Key rotation

**Rotation strategy:**

1. Create a new key with the same permissions
2. Update your application to use the new key
3. Verify the new key works
4. Delete the old key

**Automated rotation example:**

```ts
// 1. Create new key
const newKey = await client.createApiKey({
  name: 'Stripe webhook handler (rotated)',
  permissions: oldKey.permissions,
})

// 2. Update Stripe webhook with new key
await stripe.webhookEndpoints.update('we_abc...', {
  url: `https://your-app.com/webhook?key=${newKey.key}`,
})

// 3. Test the new webhook
// ... (send test request)

// 4. Delete old key
await client.deleteApiKey(oldKey.id)
```

### Monitoring and auditing

**Track key usage:**

- Check `lastRequest` timestamp in key metadata
- Review audit logs for API key activity
- Set up alerts for unusual activity patterns
- Monitor for failed authentication attempts

**Audit log example:**

```ts
// The action log includes apiKey.id when a key was used
{
  action: 'list',
  resourceId: 'users',
  userId: null,  // null for API key requests
  apiKeyId: 'key_abc123',  // which key was used
  at: 1715400000000,
}
```

---

## Security model

### Protection against escalation

API keys cannot manage other API keys:

```ts
// This request will fail with ForbiddenError
curl -X POST \
  'http://localhost:3000/admin/api/api-keys' \
  -H 'x-api-key: sk-abc123...'  // ❌ API keys can't create other keys
```

This prevents compromised keys from escalating their own permissions.

### Session vs API key authentication

The system distinguishes between session-authenticated and API key-authenticated requests:

| Aspect | Session authentication | API key authentication |
|--------|----------------------|------------------------|
| Auth method | Cookie/session | `x-api-key` header |
| Can manage API keys | ✅ Yes | ❌ No |
| Can change own password | ✅ Yes | ❌ No |
| Subject to role gates | ✅ Yes | ✅ Yes |
| Subject to API key gates | N/A | ✅ Yes |
| Audit trail | User ID | API key ID |

### Permission inheritance

API key permissions are checked **before** resource-level `isAccessible` guards:

```
Request with API key
        ↓
apiKeyAllows() check
        ↓ (if allowed)
Resource isAccessible() check
        ↓ (if allowed)
Action executes
```

This means:
- API key gates are the first line of defense
- Resource-level guards can further restrict access
- Both checks must pass for the action to execute

---

## Troubleshooting

### 403 Forbidden errors

**Possible causes:**

1. **Permission mismatch** — The key doesn't have permission for the requested resource/action
2. **Key disabled** — The key's `enabled` flag is `false`
3. **Key expired** — The key's `expiresAt` has passed
4. **Resource/action doesn't exist** — Typo in resource ID or action name

**Debug steps:**

```ts
// Check key permissions
const { keys } = await client.listApiKeys()
console.log(keys[0].permissions)

// Verify the resource and action exist
// (check your ModernAdmin resource registration)
```

### Key not working after creation

**Possible causes:**

1. **Wrong header** — Using `Authorization` instead of `x-api-key`
2. **Typo in key** — Copy-paste error
3. **Backend not configured** — `MODERN_ADMIN_API_KEY_SERVICE` not registered

**Debug steps:**

```bash
# Verify header format
curl -X GET \
  'http://localhost:3000/admin/api/resources/users/actions/list' \
  -H 'x-api-key: sk-abc123...'  # correct header name

# Check backend logs for auth errors
```

### Permission validation errors

**Possible causes:**

1. **Unknown resource** — Referenced a resource that doesn't exist
2. **Unknown action** — Referenced an action that doesn't exist on the resource

**Debug steps:**

```ts
// The controller validates permissions against registered resources
// Check your resource registration:
admin.resources.forEach(r => console.log(r.id))
```

---

## Advanced patterns

### Service-specific keys

Create separate keys for each external service:

```ts
// Stripe integration
const stripeKey = await client.createApiKey({
  name: 'Stripe webhook handler',
  permissions: {
    orders: ['list', 'show', 'new', 'edit'],
    customers: ['list', 'show'],
  },
})

// Analytics integration
const analyticsKey = await client.createApiKey({
  name: 'Analytics data exporter',
  permissions: {
    '*': ['list', 'show'],  // read-only across everything
  },
})
```

### Environment-specific keys

Use different keys for dev/staging/production:

```ts
// Development
const devKey = await client.createApiKey({
  name: 'Dev environment key',
  permissions: { '*': ['*'] },  // full access for development
})

// Production
const prodKey = await client.createApiKey({
  name: 'Production webhook handler',
  permissions: {
    orders: ['list', 'show', 'new'],  // minimal permissions
  },
  expiresInDays: 90,  // rotate frequently
})
```

### Temporary keys with expiry

Create short-lived keys for one-time operations:

```ts
const tempKey = await client.createApiKey({
  name: 'One-time data import',
  permissions: {
    products: ['new', 'edit'],
  },
  expiresInDays: 1,  // expires tomorrow
})

// Use the key for the import, then delete it
await importData(tempKey.key)
await client.deleteApiKey(tempKey.id)
```

---

## Technical details

For implementation details, see:

- **Backend controller** — `@modern-admin/nest/src/api-keys.controller.ts`
- **Auth provider integration** — `@modern-admin/auth-better-auth/src/index.ts`
- **Permission checking** — `@modern-admin/core/src/modern-admin.ts` (invoke pipeline)
- **Frontend client** — `@modern-admin/react/src/client.ts` (AdminClient methods)
