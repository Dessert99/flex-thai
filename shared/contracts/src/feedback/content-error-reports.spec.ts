/** 콘텐츠 오류 신고 공개 계약의 strict 입력과 workflow 응답을 고정한다 */
import { describe, expect, it } from 'vitest';
import {
  adminContentErrorReportDetailResponseSchema,
  adminContentErrorReportListQuerySchema,
  contentErrorReportOriginSchema,
  createContentErrorReportRequestSchema,
} from './content-error-reports.js';

const id = '00000000-0000-4000-8000-000000000001';

describe('콘텐츠 오류 신고 계약', () => {
  it.each([
    {
      kind: 'QUESTION',
      questionId: id,
      questionVersionId: id,
      blockId: null,
      sentenceVersionId: null,
    },
    {
      kind: 'VOCABULARY',
      vocabularyId: id,
      meaningId: null,
      pronunciationId: null,
    },
    { kind: 'SENTENCE', sentenceVersionId: id, tokenPosition: null },
    { kind: 'AUDIO', source: { kind: 'SENTENCE', sentenceVersionId: id } },
    { kind: 'CONCEPT', conceptId: id, conceptVersionId: id, blockId: null },
  ])('$kind origin을 허용한다', (origin) => {
    expect(contentErrorReportOriginSchema.parse(origin)).toEqual(origin);
  });

  it('설명을 trim하고 1000자까지만 허용한다', () => {
    expect(
      createContentErrorReportRequestSchema.parse({
        origin: { kind: 'SENTENCE', sentenceVersionId: id, tokenPosition: 0 },
        category: 'TOKENIZATION',
        description: ` ${'가'.repeat(998)} `,
      }).description,
    ).toHaveLength(998);
    expect(() =>
      createContentErrorReportRequestSchema.parse({
        origin: {
          kind: 'SENTENCE',
          sentenceVersionId: id,
          tokenPosition: null,
        },
        category: 'OTHER',
        description: '가'.repeat(1001),
      }),
    ).toThrow();
  });

  it('알 수 없는 입력 필드를 거부하고 목록 기본값을 적용한다', () => {
    expect(() =>
      createContentErrorReportRequestSchema.parse({
        origin: {
          kind: 'SENTENCE',
          sentenceVersionId: id,
          tokenPosition: null,
        },
        category: 'OTHER',
        reporterUserId: id,
      }),
    ).toThrow();
    expect(adminContentErrorReportListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('관리자 상세에 immutable 대상과 처리 이력을 보존한다', () => {
    const detail = {
      id,
      reporter: { id, email: 'learner@hufs.ac.kr' },
      targetKind: 'VOCABULARY',
      category: 'MEANING_TRANSLATION',
      status: 'OPEN',
      assignee: null,
      description: null,
      canonicalReference: {
        kind: 'VOCABULARY',
        contentId: id,
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
      history: [],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    expect(adminContentErrorReportDetailResponseSchema.parse(detail)).toEqual(
      detail,
    );
  });
});
