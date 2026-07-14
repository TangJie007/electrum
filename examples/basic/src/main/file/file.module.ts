import { Module } from 'electron-mvc'
import { FileController } from './file.controller'
import { FileService } from './file.service'

@Module({
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
