import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { toNodeHandler } from 'better-auth/node'
import { auth, migrateAuth } from './auth.js'
import { AppModule } from './app.module.js'

// Expose the configured auth instance to the admin module before Nest
// instantiates anything — `BetterAuthProvider` reads it from globalThis.
;(globalThis as { __betterAuth?: unknown }).__betterAuth = auth

async function bootstrap(): Promise<void> {
  await migrateAuth()
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Express 5 defaults to the `simple` query parser, which leaves
  // `filters[role]=admin` as the flat key `filters[role]` instead of
  // expanding it into a nested object. Switch to qs-backed `extended`
  // parsing so the admin client's bracket notation reaches the action
  // layer as `{ filters: { role: 'admin' } }`.
  app.set('query parser', 'extended')
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  })

  // Mount Better Auth's Express handler at /api/auth/*. Has to come before
  // body parsers — Nest's default JSON parser would otherwise consume the
  // request stream Better Auth needs raw access to.
  app.use('/api/auth', toNodeHandler(auth))

  const port = Number(process.env.API_PORT ?? 3001)
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`[modern-admin/api] listening on http://localhost:${port}`)
  // eslint-disable-next-line no-console
  console.log(`[modern-admin/api] auth endpoints under /api/auth`)
}

void bootstrap()
