# Conventions — i18n, UUID v7, cache & realtime

## 12. i18n — translation boundary

When you add **any** new visible string:

1. Add the key to `packages/i18n/src/locales/en.ts` (source of truth).
2. Mirror it to all other locales: `de`, `es`, `fr`, `it`, `ja`, `pl`,
   `pt-BR`, `ru`.
3. Add a `labels` prop (or single named prop) on the UI component
   with English fallback defaults.
4. Wire `t('namespace:key')` in the `packages/react` call site and
   pass through `labels`.

Templates use `{placeholder}` syntax and are replaced at the component
level: `l.uploadingFile.replace('{name}', uploadingName)`.

`packages/ui` components must remain i18n-unaware. If you find
yourself importing `useI18n` inside `packages/ui` you have it wrong.

## 13. Database identity — UUID v7

```ts
import { uuidv7 } from '@modern-admin/core'

await prisma.maUser.create({
  data: { id: uuidv7(), email, name, /* … */ },
})
```

Do not rely on Prisma `@default(uuid(7))` — different Prisma versions
generate v4 even with `uuid(7)` specified in older clients. Always
generate in app code.

UUID v7 is time-ordered, so list pagination by `id` (or by
`createdAt`) returns newest-first cheaply. Use the id as the cursor
when paginating large lists.

## 14. Cache and realtime

- Default `NoopCacheProvider` is fine for single-replica deployments.
- For multi-replica: pass `cache: new RedisCacheProvider(redis)` AND
  `realtime: new RedisRealtimeBus(redis)` so cache-invalidation
  events propagate across pods.
- The admin frontend subscribes to the realtime channel and live-
  refreshes list/show pages on remote edits — no code from the agent
  required, just wire the bus.
