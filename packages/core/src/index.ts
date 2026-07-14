import '@electrum/common'

export { Application, createApp } from './application'

export { DIContainer } from './di/container'
export { ModuleScanner } from './module/scanner'
export type { ScannedModule } from './module/scanner'

export { IpcBridge } from './bridge/ipc-bridge'
export { EventBridge } from './bridge/event-bridge'
export { MiddlewarePipeline } from './middleware/pipeline'
export type { PipelineExecutionContext } from './middleware/pipeline'

export { LifecycleManager } from './lifecycle/manager'
export { WindowManager } from './window/manager'
export { TypeGenerator } from './type-generator/generator'
export type { Plugin } from './plugin/plugin.interface'

// Re-export common APIs for convenience (Nest-like: prefer @electrum/common for app code)
export {
  METADATA_READY,
  META,
  readMetadata,
  getClassMetadata,
  Module,
  Injectable,
  Controller,
  IpcHandle,
  IpcOn,
  AppEvent,
  Inject,
  Optional,
  WindowRef,
  WindowDeclaration,
  UseGuards,
  UsePipes,
  UseInterceptors,
  UseFilters,
  ElectronException,
  NotFoundException,
  ForbiddenException,
  ValidationException,
  Logger,
} from '@electrum/common'

export type {
  ModuleMetadata,
  Provider,
  ValueProvider,
  ClassProvider,
  FactoryProvider,
  InjectableOptions,
  Scope,
  IpcHandlerEntry,
  AppEventEntry,
  InjectionPoint,
  WindowOptions,
  MethodMiddlewareEntry,
  OnModuleInit,
  OnAppReady,
  OnModuleDestroy,
  CanActivate,
  IpcContext,
  NestInterceptor,
  PipeTransform,
  ExceptionFilter,
  IpcErrorResponse,
  LogLevel,
} from '@electrum/common'
