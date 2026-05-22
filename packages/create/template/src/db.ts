/**
 * Prisma 7 client + DMMF for {{name}}.
 *
 * The same client backs:
 *   - Modern Admin's resource adapter (`@modern-admin/adapter-prisma`)
 *   - Better Auth's storage (`@modern-admin/auth-better-auth`)
 *   - The system-table stores (`@modern-admin/system-prisma`)
 *
 * Reuse this module — don't create a second PrismaClient elsewhere or
 * you'll multiply connection pools.
 *
 * Prisma 7 specifics:
 *   - The generated client lives at `./generated/prisma/client` (set
 *     via `output` in `prisma/schema.prisma`).
 *   - Postgres connectivity goes through the `@prisma/adapter-pg`
 *     driver adapter — `DATABASE_URL` is read here, not in the schema.
 *   - DMMF is no longer re-exported from the client. We compute it at
 *     boot by feeding the raw schema text through `getDMMF` from
 *     `@prisma/internals`. `@modern-admin/adapter-prisma` then reads
 *     model definitions, fields, and relations off the result.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import internals from '@prisma/internals'
import type { DMMF } from '@prisma/client/runtime/client'
import { PrismaClient } from './generated/prisma/client.js'

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(here, '..', 'prisma', 'schema.prisma')
const schema = readFileSync(schemaPath, 'utf8')

export const dmmf: DMMF.Document = await internals.getDMMF({ datamodel: schema })

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

export const prisma = new PrismaClient({
  adapter,
  log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})

export type AppPrismaClient = typeof prisma
