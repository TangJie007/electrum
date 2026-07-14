/**
 * 用法 Demo：用本示例的迷你 DI 写一段「像 core 一样」的业务代码。
 *
 * 跑：pnpm demo（在 examples/di 目录）
 *
 * 对应正式项目：createApp(AppModule) → ModuleScanner 批量 register → resolve
 * 这里手写 register，只展示「声明依赖 → 容器接线 → 拿实例用」。
 */
import './01-polyfill'
import { Injectable } from './03-injectable'
import { Inject } from './04-inject'
import { DIContainer } from './05-container'

// ── 1. 声明可注入的服务 ──────────────────────────────────────────

@Injectable()
class Logger {
  log(msg: string) {
    console.log(`[log] ${msg}`)
  }
}

@Injectable()
class ConfigService {
  readonly appName = 'electrum-di-demo'
}

@Injectable()
class UserService {
  @Inject(Logger)
  logger!: Logger

  @Inject(ConfigService)
  config!: ConfigService

  greet(name: string) {
    this.logger.log(`${this.config.appName}: hello, ${name}`)
    return `hi, ${name}`
  }
}

// ── 2. 登记 Provider（正式项目里由 @Module + Scanner 完成）────────

const container = new DIContainer()

container.register(Logger, { useClass: Logger })
container.register(ConfigService, { useClass: ConfigService })
container.register(UserService, { useClass: UserService })

// string token + 工厂：和 core 的 useFactory 一样
container.register('BANNER', {
  useFactory: (config: ConfigService) => `=== ${config.appName} ===`,
  inject: [ConfigService],
})

// ── 3. resolve：容器 new + 属性注入，你只管用 ─────────────────────

const users = container.resolve(UserService)
const banner = container.resolve<string>('BANNER')

console.log(banner)
console.log(users.greet('Ada'))

// singleton：多次 resolve 是同一实例
console.log('same UserService?', users === container.resolve(UserService))
console.log('same Logger?', users.logger === container.resolve(Logger))
