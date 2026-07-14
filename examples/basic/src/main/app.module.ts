import { Module } from 'electron-mvc'
import { WindowModule } from './window/window.module'
import { FileModule } from './file/file.module'
import { AppController } from './app.controller'
import { ConfigService } from './config.service'

@Module({
  imports: [WindowModule, FileModule],
  controllers: [AppController],
  providers: [
    ConfigService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Demo',
        version: '0.1.0',
      }),
    },
  ],
  exports: [ConfigService],
})
export class AppModule {}
