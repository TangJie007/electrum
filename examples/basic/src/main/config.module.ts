import { Global, Module } from '@electrum/common'
import { ConfigService } from './config.service'

/**
 * 全局配置模块：`@Global()` 让 ConfigService / 'APP_CONFIG' 无需被 imports
 * 就能被任意模块注入（等价 Nest 的 @Global()）。
 */
@Global()
@Module({
  providers: [
    ConfigService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Admin',
        version: '0.1.0',
      }),
    },
  ],
  exports: [ConfigService, 'APP_CONFIG'],
})
export class ConfigModule {}
