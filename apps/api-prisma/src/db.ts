// Single PrismaClient instance shared across the app.
//
// The client is lazy: importing this file does not open a connection
// (Prisma 7 connects on first query). Tests / scripts can replace the
// export with a stub via Bun's module mocking if needed.
import { PrismaPg } from '@prisma/adapter-pg'
import internals from '@prisma/internals'
import { PrismaClient } from './generated/prisma/client'
import { getMergedSchemaContent } from './utils/mergeSchema'
import type { DMMF } from '@prisma/client/runtime/client'


const getDMMF = internals.getDMMF
const schema = await getMergedSchemaContent()
export const dmmf: DMMF.Document = await getDMMF({ datamodel: schema })

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

export const prisma = new PrismaClient({
  adapter,
  log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})

export type AppPrismaClient = typeof prisma
