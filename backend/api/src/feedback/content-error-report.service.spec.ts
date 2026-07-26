/** 콘텐츠 오류 신고 HTTP facade의 공개 응답과 workflow 위임을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
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
});
