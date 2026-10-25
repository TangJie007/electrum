import { Module } from '@electrum/common'
import { ConfigModule } from './config.module'
import { WindowModule } from './window/window.module'
import { FileModule } from './file/file.module'
import { UserModule } from './user/user.module'
import { AppController } from './app.controller'

@Module({
  imports: [ConfigModule, WindowModule, FileModule, UserModule],
  controllers: [AppController],
})
export class AppModule {}
