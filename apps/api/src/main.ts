import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  })
  const port = Number(process.env.API_PORT ?? 3001)
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`[modern-admin/api] listening on http://localhost:${port}`)
}

void bootstrap()
