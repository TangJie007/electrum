import {
  Controller,
  IpcHandle,
  IpcOn,
  Inject,
  WindowRef,
  UseInterceptors,
} from '@electrum/common'
import type { BrowserWindow, IpcMainEvent } from 'electron'
import { FileService } from './file.service'
import { LoggingInterceptor } from '../interceptors/logging.interceptor'

@Controller('file')
@UseInterceptors(LoggingInterceptor)
export class FileController {
  @Inject(FileService)
  fileService!: FileService

  @WindowRef('main')
  mainWindow!: BrowserWindow

  @IpcHandle('read')
  async read(filePath: string): Promise<string> {
    return this.fileService.read(filePath)
  }

  @IpcHandle('write')
  async write(data: { path: string; content: string }): Promise<{ ok: true; path: string }> {
    await this.fileService.write(data.path, data.content)
    this.mainWindow.webContents.send('file:saved', data.path)
    return { ok: true, path: data.path }
  }

  @IpcOn('watch')
  onWatch(event: IpcMainEvent, filePath: string): void {
    this.fileService.watch(filePath, (change) => {
      event.reply('file:changed', { path: filePath, ...change })
    })
  }
}
