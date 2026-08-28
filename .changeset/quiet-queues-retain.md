---
'@modern-admin/core': minor
'@modern-admin/feature-history': minor
'@modern-admin/queue': minor
'@modern-admin/system-drizzle': minor
'@modern-admin/system-prisma': minor
---

Move persistent history pruning out of action hooks and into a BullMQ-backed
retention cron task. Add equivalent `keepDays`/global `keepLast` retention for
action logs, including memory, Prisma, and Drizzle store implementations.
