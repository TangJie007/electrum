import { createApp, type Plugin } from '@electrum/core'
import { AppModule } from './app.module'
import { LoggingInterceptor } from './interceptors/logging.interceptor'
import { GlobalExceptionFilter } from './filters/global-exception.filter'

/** Minimal plugin demo: install → ready → destroy lifecycle. */
const demoPlugin: Plugin = {
  name: 'demo-logger',
  install() {
    console.log('[plugin:demo-logger] install')
  },
  async ready() {
    console.log('[plugin:demo-logger] ready')
  },
  async destroy() {
    console.log('[plugin:demo-logger] destroy')
  },
}

async function bootstrap() {
  const app = createApp(AppModule)

  app.use(demoPlugin)
  app.useGlobalInterceptors(LoggingInterceptor)
  app.useGlobalFilters(GlobalExceptionFilter)

  await app.start()
}

bootstrap().catch((err) => {
  console.error('[bootstrap] failed:', err)
  process.exit(1)
})
