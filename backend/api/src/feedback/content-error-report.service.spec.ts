/** 콘텐츠 오류 신고 HTTP facade의 공개 응답과 workflow 위임을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { ContentErrorReportDomainError } from '@flex-thia/domain';
import { buildErrorResponse } from '../common/errors/domain-exception.filter.js';
import { ContentErrorReportHttpService } from './content-error-report.service.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const report = {
  id: '00000000-0000-4000-8000-000000000001',
  reporterUserId: '00000000-0000-4000-8000-000000000002',
  targetKind: 'VOCABULARY' as const,
  category: 'OTHER' as const,
  status: 'OPEN' as const,
  assigneeUserId: null,
  description: null,
  canonicalReference: {
    kind: 'VOCABULARY' as const,
    contentId: '00000000-0000-4000-8000-000000000003',
    contentVersionId: null,
    questionVersionId: null,
    sentenceVersionId: null,
    mediaAssetId: null,
    locationId: null,
  },
  snapshot: {
    title: 'เข้าใจ',
    primaryText: '이해하다',
    secondaryText: null,
    versionLabel: null,
    locationLabel: '어휘 상세',
    audioAssetId: null,
  },
  createdAt: now,
  updatedAt: now,
};

describe('ContentErrorReportHttpService', () => {
  it('현재 사용자로 신고하고 OPEN 공개 응답을 반환한다', async () => {
    const reports = { create: vi.fn().mockResolvedValue(report) };
    const service = new ContentErrorReportHttpService(
      reports as never,
      {} as never,
    );
    await expect(
      service.create(report.reporterUserId, {
        origin: {
          kind: 'VOCABULARY',
          vocabularyId: report.canonicalReference.contentId,
          meaningId: null,
          pronunciationId: null,
        },
        category: 'OTHER',
      }),
    ).resolves.toEqual({
      id: report.id,
      status: 'OPEN',
      createdAt: now.toISOString(),
    });
  });

  it('pagination과 모든 filter를 query에 전달한다', async () => {
    const query = {
      list: vi.fn().mockResolvedValue({ items: [], totalItems: 41 }),
    };
    const service = new ContentErrorReportHttpService(
      {} as never,
      query as never,
    );
    await expect(
      service.list({
        page: 2,
        pageSize: 20,
        status: 'OPEN',
        targetKind: 'VOCABULARY',
        category: 'OTHER',
        assigneeUserId: '00000000-0000-4000-8000-000000000004',
      }),
    ).resolves.toMatchObject({
      page: { page: 2, pageSize: 20, totalItems: 41, totalPages: 3 },
    });
    expect(query.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      status: 'OPEN',
      targetKind: 'VOCABULARY',
      category: 'OTHER',
      assigneeUserId: '00000000-0000-4000-8000-000000000004',
    });
  });

  it('상세 이력은 공개 필드와 actor만 명시적으로 매핑한다', async () => {
    const query = {
      findById: vi.fn().mockResolvedValue({
        report,
        reporter: { id: report.reporterUserId, email: 'learner@example.com' },
        assignee: null,
        history: [
          {
            id: '00000000-0000-4000-8000-000000000005',
            action: 'SUBMITTED',
            actorUserId: report.reporterUserId,
            actorEmail: 'learner@example.com',
            fromStatus: null,
            toStatus: null,
            fromAssigneeUserId: null,
            toAssigneeUserId: null,
            createdAt: now,
            internalSecret: '노출 금지',
          },
        ],
      }),
    };
    const service = new ContentErrorReportHttpService(
      {} as never,
      query as never,
    );
    const result = await service.detail(report.id);
    expect(result.history[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000005',
      action: 'SUBMITTED',
      actor: { id: report.reporterUserId, email: 'learner@example.com' },
      fromStatus: null,
      toStatus: null,
      fromAssigneeUserId: null,
      toAssigneeUserId: null,
      createdAt: now.toISOString(),
    });
  });

  it('없는 신고는 domain not-found로 거부한다', async () => {
    const query = { findById: vi.fn().mockResolvedValue(null) };
    const service = new ContentErrorReportHttpService(
      {} as never,
      query as never,
    );
    await expect(service.detail(report.id)).rejects.toMatchObject({
      status: 404,
      response: { code: 'CONTENT_ERROR_REPORT_NOT_FOUND' },
    });
  });

  it.each([
    ['CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE', 404],
    ['CONTENT_ERROR_REPORT_NOT_FOUND', 404],
    ['CONTENT_ERROR_REPORT_INVALID_TRANSITION', 409],
    ['CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE', 409],
    ['CONTENT_ERROR_REPORT_CONCURRENT_UPDATE', 409],
    ['CONTENT_ERROR_REPORT_DESCRIPTION_INVALID', 400],
  ] as const)(
    'domain 오류 %s를 feedback HTTP 상태 %i로 제한한다',
    async (code, status) => {
      const reports = {
        create: vi
          .fn()
          .mockRejectedValue(new ContentErrorReportDomainError(code)),
      };
      const service = new ContentErrorReportHttpService(
        reports as never,
        {} as never,
      );

      await expect(
        service.create(report.reporterUserId, {
          origin: {
            kind: 'VOCABULARY',
            vocabularyId: report.canonicalReference.contentId,
            meaningId: null,
            pronunciationId: null,
          },
          category: 'OTHER',
        }),
      ).rejects.toMatchObject({
        status,
        response: { code },
      });
    },
  );

  it('feedback facade 예외 code를 global filter Problem Details까지 보존한다', async () => {
    const reports = {
      create: vi
        .fn()
        .mockRejectedValue(
          new ContentErrorReportDomainError(
            'CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE',
          ),
        ),
    };
    const service = new ContentErrorReportHttpService(
      reports as never,
      {} as never,
    );
    let caught: unknown;
    try {
      await service.create(report.reporterUserId, {
        origin: {
          kind: 'VOCABULARY',
          vocabularyId: report.canonicalReference.contentId,
          meaningId: null,
          pronunciationId: null,
        },
        category: 'OTHER',
      });
    } catch (error) {
      caught = error;
    }

    expect(buildErrorResponse(caught, 'request-feedback')).toMatchObject({
      status: 404,
      body: {
        status: 404,
        code: 'CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE',
        requestId: 'request-feedback',
      },
    });
  });

  it('mutation 뒤 최신 상세를 다시 조회한다', async () => {
    const detail = {
      report,
      reporter: { id: report.reporterUserId, email: 'learner@example.com' },
      assignee: null,
      history: [],
    };
    const reports = { changeStatus: vi.fn().mockResolvedValue(report) };
    const query = { findById: vi.fn().mockResolvedValue(detail) };
    const service = new ContentErrorReportHttpService(
      reports as never,
      query as never,
    );
    await service.changeStatus(
      {
        userId: 'admin-id',
        actorSub: 'admin-sub',
        requestId: 'request-id',
      },
      report.id,
      'IN_PROGRESS',
    );
    expect(reports.changeStatus).toHaveBeenCalledOnce();
    expect(query.findById).toHaveBeenCalledTimes(2);
  });
});
