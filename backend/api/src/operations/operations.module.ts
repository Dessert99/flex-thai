/** 환경별 감사 기록 read use case와 HTTP Controller를 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { AuditLogService } from '@flex-thia/domain';
import { AdminAuditLogsController } from './admin-audit-logs.controller.js';

/** Operations HTTP 경계의 실행 환경 의존성 */
export interface OperationsModuleOptions {
  auditLogs: AuditLogService;
}

/** 관리자 감사 기록 endpoint를 제공한다 */
@Module({})
export class OperationsModule {
  /** 선택된 감사 read use case를 NestJS 경계에 연결한다 */
  static register(options: OperationsModuleOptions): DynamicModule {
    return {
      module: OperationsModule,
      controllers: [AdminAuditLogsController],
      providers: [{ provide: AuditLogService, useValue: options.auditLogs }],
    };
  }
}
