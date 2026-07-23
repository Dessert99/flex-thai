/** Job API가 선택한 repository와 queue adapter를 NestJS에 조립한다 */
import { DynamicModule, Module } from '@nestjs/common';
import type {
  CreateJobService,
  JobRepository,
  UploadRepository,
} from '@flex-thia/domain';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

/** 환경별 adapter를 Job API에 주입하기 위한 module 옵션 */
export interface JobsModuleOptions {
  uploads: UploadRepository;
  createJobService: CreateJobService;
  jobs: JobRepository;
}

/** local fake와 AWS adapter를 같은 API에 연결하는 dynamic module */
@Module({})
export class JobsModule {
  /** 실행 환경이 선택한 adapter로 Job API를 구성한다 */
  static register(options: JobsModuleOptions): DynamicModule {
    return {
      module: JobsModule,
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: new JobsService(
            options.uploads,
            options.createJobService,
            options.jobs,
          ),
        },
      ],
      exports: [JobsService],
    };
  }
}
