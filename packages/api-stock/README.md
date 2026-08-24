# @modern-admin/api-stock

Server-side API Stock adapter for the Modern Admin media-generation port.

The adapter loads the live model catalog, creates asynchronous image/video
tasks with a webhook URL, and performs an authoritative one-shot status read
when the host receives that webhook. It never exposes the API key to a browser.

```ts
import { ApiStockMediaGenerationProvider } from '@modern-admin/api-stock'

const provider = new ApiStockMediaGenerationProvider()
```

Configure the provider through `ModernAdminModule`'s `mediaGeneration` option.

```ts
ModernAdminModule.forRoot({
  // configStore and aiTaskStore must use persistent implementations in production.
  configStore,
  aiTaskStore,
  mediaGeneration: {
    provider,
    apiKey: process.env.API_STOCK_KEY,
    webhookBaseUrl: process.env.MEDIA_GENERATION_WEBHOOK_BASE_URL,
    webhookSecret: process.env.MEDIA_GENERATION_WEBHOOK_SECRET,
    allowedMediaTypes: ['image', 'video'],
    monthlyBudgetUsdPerUser: 100,
    generateRoles: ['admin'],
    manageRoles: ['admin'],
  },
})
```

`webhookBaseUrl` must be a public HTTPS origin. `webhookSecret` must contain at
least 32 characters. The callback is treated as a signal: Modern Admin checks
the per-task HMAC URL token, verifies the external task id, and performs one
authoritative status request before updating the local task. The server does
not poll API Stock. The React client combines private WebSocket invalidation
with bounded REST polling while a generation is active.

Finalized files are imported only from the provider's HTTPS host allowlist
(`storage.api-stock.com` for this adapter), and every redirect is checked before
it is followed. Custom providers must expose `allowedFileHosts` or the host must
set `allowedDownloadHosts` explicitly.

Users can create an API key at [api-stock.com](https://api-stock.com). The same
link is available in Modern Admin's media generation settings. The credential
is resolved on the server and is never included in browser responses, tasks,
events, or logs.
