/** 로컬 콘텐츠 파일 업로드 경계를 조립한다 */
import { LocalFileUploadProvider } from '@flex-thia/providers';
import { Module, type DynamicModule } from '@nestjs/common';
import { LocalUploadController } from './local-upload.controller.js';
@Module({})
export class LocalUploadsModule {
  static register(storage?: LocalFileUploadProvider): DynamicModule {
    return {
      module: LocalUploadsModule,
      controllers: storage ? [LocalUploadController] : [],
      providers: storage
        ? [{ provide: LocalFileUploadProvider, useValue: storage }]
        : [],
    };
  }
}
