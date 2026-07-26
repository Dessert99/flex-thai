/** 콘텐츠 오류 신고 DynamicModule의 독립 조립 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { AdminContentErrorReportsController } from './admin-content-error-reports.controller.js';
import { ContentErrorReportHttpService } from './content-error-report.service.js';
import { ContentErrorReportsModule } from './content-error-reports.module.js';
import { LearnerContentErrorReportsController } from './learner-content-error-reports.controller.js';

describe('ContentErrorReportsModule', () => {
  it('두 controller와 facade 및 인증 의존성을 조립한다', () => {
    const options = {
      reports: { create: vi.fn() },
      query: { list: vi.fn(), findById: vi.fn() },
      users: { findById: vi.fn() },
      authorizer: { issuer: 'issuer', audience: 'audience' },
    } as never;
    const module = ContentErrorReportsModule.register(options);
    expect(module.controllers).toEqual([
      LearnerContentErrorReportsController,
      AdminContentErrorReportsController,
    ]);
    const provider = module.providers?.find(
      (item) =>
        typeof item === 'object' &&
        'provide' in item &&
        item.provide === ContentErrorReportHttpService,
    );
    expect(provider).toMatchObject({ provide: ContentErrorReportHttpService });
    expect(
      typeof provider === 'object' && 'useValue' in provider
        ? provider.useValue
        : null,
    ).toBeInstanceOf(ContentErrorReportHttpService);
    expect(module.exports).toEqual([ContentErrorReportHttpService]);
  });
});
