---
'@modern-admin/core': minor
---

Remove the periodic cache metrics log from `CacheRuntime`. The 10-minute
interval called `stats(true)`, which silently reset the counters served by
`GET /cache` and the admin cache page, and duplicated data that endpoint
already exposes. The `metricsLogIntervalMs` option is gone; drop it from
`ModernAdmin({ cacheRuntime })`.
