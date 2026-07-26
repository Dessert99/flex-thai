/** 콘텐츠 오류 신고 생성과 관리자 workflow use case를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentErrorReport,
  ContentErrorReportAssigneeResolver,
  ContentErrorReportRepository,
  ContentErrorReportTargetResolver,
} from './content-error-report.repository.js';
import { ContentErrorReportService } from './content-error-report.service.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const target = {
  reference: {
    kind: 'VOCABULARY' as const,
    contentId: 'vocabulary-id',
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
};
const report: ContentErrorReport = {
  id: 'report-id',
  reporterUserId: 'learner-id',
  targetKind: 'VOCABULARY',
  category: 'MEANING_TRANSLATION',
  status: 'OPEN',
  assigneeUserId: null,
  description: null,
  canonicalReference: target.reference,
  snapshot: target.snapshot,
  createdAt: now,
  updatedAt: now,
};

const createService = () => {
  const repository: ContentErrorReportRepository = {
    create: vi.fn().mockResolvedValue(report),
    changeStatus: vi.fn().mockResolvedValue({ ...report, status: 'RESOLVED' }),
    changeAssignee: vi
      .fn()
      .mockResolvedValue({ ...report, assigneeUserId: 'admin-id' }),
  };
  const targetResolver: ContentErrorReportTargetResolver = {
    resolve: vi.fn().mockResolvedValue(target),
  };
  const assigneeResolver: ContentErrorReportAssigneeResolver = {
    isAssignable: vi.fn().mockResolvedValue(true),
  };
  return {
    repository,
    targetResolver,
    assigneeResolver,
    service: new ContentErrorReportService(
      repository,
      targetResolver,
      assigneeResolver,
      () => now,
    ),
  };
};

describe('ContentErrorReportService', () => {
  it('서버가 해석한 대상과 OPEN 상태로 중복 신고를 각각 저장한다', async () => {
    const { repository, service } = createService();
    const input = {
      origin: {
        kind: 'VOCABULARY' as const,
        vocabularyId: 'vocabulary-id',
        meaningId: null,
        pronunciationId: null,
      },
      category: 'MEANING_TRANSLATION' as const,
      description: '  뜻이 달라요 ',
    };
    await service.create('learner-id', input);
    await service.create('learner-id', input);
    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(repository.create).toHaveBeenCalledWith({
      reporterUserId: 'learner-id',
      category: 'MEANING_TRANSLATION',
      description: '뜻이 달라요',
      target,
      createdAt: now,
    });
  });

  it('담당자를 검증하고 배정하거나 해제한다', async () => {
    const { repository, service } = createService();
    const actor = { userId: 'admin-id', subject: 'sub', requestId: 'request' };
    await service.assign(actor, report, 'admin-id');
    await service.unassign(actor, { ...report, assigneeUserId: 'admin-id' });
    expect(repository.changeAssignee).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fromAssigneeUserId: null,
        toAssigneeUserId: 'admin-id',
      }),
    );
    expect(repository.changeAssignee).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fromAssigneeUserId: 'admin-id',
        toAssigneeUserId: null,
      }),
    );
  });

  it('허용된 상태 전이와 동시성 기준을 repository에 전달한다', async () => {
    const { repository, service } = createService();
    await service.changeStatus(
      { userId: 'admin-id', subject: 'sub', requestId: 'request' },
      report,
      'RESOLVED',
    );
    expect(repository.changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'OPEN',
        toStatus: 'RESOLVED',
        expectedUpdatedAt: now,
      }),
    );
  });
});
