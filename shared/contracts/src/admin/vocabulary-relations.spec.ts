/** 관리자 관계 CRUD와 stale-safe 병합 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  adminVocabularyMergeExecuteRequestSchema,
  adminVocabularyMergePreviewRequestSchema,
  adminVocabularyMergePreviewResponseSchema,
  adminVocabularyRelationCreateRequestSchema,
  adminVocabularyRelationUpdateRequestSchema,
} from './vocabulary-relations.js';

const sourceVocabularyId = '00000000-0000-4000-8000-000000000001';
const representativeVocabularyId = '00000000-0000-4000-8000-000000000002';

describe('관리자 어휘 관계 계약', () => {
  it('관계 생성은 두 뜻·종류·방향만 받고 상태를 받지 않는다', () => {
    expect(
      adminVocabularyRelationCreateRequestSchema.safeParse({
        sourceMeaningId: sourceVocabularyId,
        targetMeaningId: representativeVocabularyId,
        type: 'SYNONYM',
        direction: 'BIDIRECTIONAL',
        status: 'PASSED',
      }).success,
    ).toBe(false);
  });

  it('관계 수정은 검토 상태 또는 관계 메타데이터를 하나 이상 요구한다', () => {
    expect(
      adminVocabularyRelationUpdateRequestSchema.safeParse({}).success,
    ).toBe(false);
    expect(
      adminVocabularyRelationUpdateRequestSchema.parse({ status: 'PASSED' }),
    ).toEqual({ status: 'PASSED' });
  });
});

describe('관리자 어휘 병합 계약', () => {
  it('preview는 대표 ID만 받고 비교 graph·사용처 수·opaque token을 반환한다', () => {
    const request = adminVocabularyMergePreviewRequestSchema.parse({
      representativeVocabularyId,
    });
    expect(request).toEqual({ representativeVocabularyId });
    expect(
      adminVocabularyMergePreviewResponseSchema.parse({
        source: {
          id: sourceVocabularyId,
          thai: 'สวัสดี',
          normalizedThai: 'สวัสดี',
          kind: 'WORD',
          status: 'DRAFT',
          meaningCount: 1,
          pronunciationCount: 1,
          usage: {
            tokenOccurrences: 0,
            expressionOccurrences: 0,
            savedMemberships: 0,
            wordbookMemberships: 0,
            practiceQuestions: 0,
          },
        },
        representative: {
          id: representativeVocabularyId,
          thai: 'สวัสดิ์',
          normalizedThai: 'สวัสดิ์',
          kind: 'WORD',
          status: 'PUBLISHED',
          meaningCount: 1,
          pronunciationCount: 1,
          usage: {
            tokenOccurrences: 0,
            expressionOccurrences: 0,
            savedMemberships: 0,
            wordbookMemberships: 0,
            practiceQuestions: 0,
          },
        },
        comparison: {
          normalizedEqual: false,
          codePointDistance: 1,
        },
        mergeToken: 'a'.repeat(43),
      }),
    ).toMatchObject({ mergeToken: 'a'.repeat(43) });
  });

  it('실행은 같은 대표 ID와 preview token을 요구한다', () => {
    expect(
      adminVocabularyMergeExecuteRequestSchema.parse({
        representativeVocabularyId,
        mergeToken: 'a'.repeat(43),
      }),
    ).toEqual({
      representativeVocabularyId,
      mergeToken: 'a'.repeat(43),
    });
  });
});
