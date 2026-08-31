import { Module } from '@electrum/common'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { AllowAllGuard, TrimStringsPipe } from './user.middleware'

@Module({
  controllers: [UserController],
  providers: [UserService, AllowAllGuard, TrimStringsPipe],
})
export class UserModule {}
