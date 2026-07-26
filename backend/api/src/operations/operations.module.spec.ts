/** OperationsModule의 Controller와 service 조립을 검증한다 */
import type { ValueProvider } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuditLogService } from '@flex-thia/domain';
import { AdminAuditLogsController } from './admin-audit-logs.controller.js';
import { OperationsModule } from './operations.module.js';

describe('OperationsModule', () => {
  it('감사 Controller와 전달받은 read service를 등록한다', () => {
    const auditLogs = {} as AuditLogService;
    const module = OperationsModule.register({ auditLogs });
    const providers = module.providers as ValueProvider[];

    expect(module.controllers).toEqual([AdminAuditLogsController]);
    expect(providers).toContainEqual({
      provide: AuditLogService,
      useValue: auditLogs,
    });
  });
});
