import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { toNodeHandler } from 'better-auth/node'
import { AppModule } from './app.module.js'
import { auth } from './auth.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  const origins = process.env.WEB_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)
  app.enableCors({
    origin: origins && origins.length > 0 ? origins : true,
    credentials: true,
  })

  // Mount Better Auth's HTTP handler BEFORE any body parser — Nest's
  // default JSON parser would otherwise consume the raw request body
  // that Better Auth needs to parse itself.
  app.use('/admin/api/auth', toNodeHandler(auth))

  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen(port, host)
  // eslint-disable-next-line no-console
  console.log(`[{{name}}] admin panel live → http://localhost:${port}/admin`)
}

void bootstrap()
