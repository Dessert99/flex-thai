/** 환경별 upload repository와 S3 provider를 API Controller에 조립한다 */
import { DynamicModule, Module } from '@nestjs/common';
import { UploadPolicyService } from '@flex-thia/domain';
import { UploadsController } from './uploads.controller.js';

/** local fake와 production S3가 공유하는 upload module 옵션 */
export interface UploadsModuleOptions {
  uploads: UploadPolicyService;
}

/** upload policy와 완료 검증 use case를 HTTP에 연결한다 */
@Module({})
export class UploadsModule {
  /** 실행 환경에서 만든 upload service를 Controller에 주입한다 */
  static register(options: UploadsModuleOptions): DynamicModule {
    return {
      module: UploadsModule,
      controllers: [UploadsController],
      providers: [
        {
          provide: UploadPolicyService,
          useValue: options.uploads,
        },
      ],
    };
  }
}
