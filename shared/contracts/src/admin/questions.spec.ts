/** 관리자 문제 조회·교체·검증 공개 계약을 검증한다 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AdminQuestionIdPath,
  AdminQuestionVersionIdPath,
  AdminQuestionVersionResponse,
} from './questions.js';
import {
  adminQuestionDetailResponseSchema,
  adminQuestionIdPathSchema,
  adminQuestionListQuerySchema,
  adminQuestionListResponseSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionIdPathSchema,
  adminQuestionVersionPayloadSchema,
  adminQuestionVersionResponseSchema,
} from './questions.js';

const ids = {
  question: '00000000-0000-4000-8000-000000000001',
  version: '00000000-0000-4000-8000-000000000002',
  type: '00000000-0000-4000-8000-000000000003',
  media: '00000000-0000-4000-8000-000000000004',
  vocabulary: '00000000-0000-4000-8000-000000000005',
  meaning: '00000000-0000-4000-8000-000000000006',
  pronunciation: '00000000-0000-4000-8000-000000000007',
  sentence: '00000000-0000-4000-8000-000000000008',
  block: '00000000-0000-4000-8000-000000000009',
  option: '00000000-0000-4000-8000-000000000010',
} as const;

const sentenceInput = {
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  mediaAssetId: ids.media,
  tokens: [
    {
      surface: 'สวัสดี',
      startOffset: 0,
      endOffset: 6,
      vocabulary: { id: ids.vocabulary },
      meaning: { id: ids.meaning },
      pronunciation: { id: ids.pronunciation },
      contextMeaningKo: '안녕하세요',
      role: 'TARGET',
    },
  ],
  expressions: [],
} as const;

const payload = {
  questionTypeSlug: 'reading-standard-choice',
  questionTypeVersion: 1,
  difficulty: 2,
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      sentences: [{ speaker: null, sentence: sentenceInput }],
    },
  ],
  options: [
    { clientRef: 'option.correct', position: 0, sentence: sentenceInput },
    { clientRef: 'option.wrong', position: 1, sentence: sentenceInput },
  ],
  correctOptionRef: 'option.correct',
} as const;

describe('관리자 문제 path·query·교체 payload 계약', () => {
  it('모든 상태 필터와 페이지 query를 안전하게 변환한다', () => {
    expect(
      adminQuestionListQuerySchema.parse({
        status: 'DRAFT',
        versionStatus: 'INVALIDATED',
        validationStatus: 'FAILED',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      status: 'DRAFT',
      versionStatus: 'INVALIDATED',
      validationStatus: 'FAILED',
      page: 2,
      pageSize: 50,
    });
    expect(() =>
      adminQuestionListQuerySchema.parse({ status: 'ACTIVE' }),
    ).toThrow();
  });

  it('question과 version UUID path를 strict하게 검증한다', () => {
    const questionPath = adminQuestionIdPathSchema.parse({
      questionId: ids.question,
    });
    const versionPath = adminQuestionVersionIdPathSchema.parse({
      versionId: ids.version,
    });

    expect(questionPath).toEqual({ questionId: ids.question });
    expect(versionPath).toEqual({ versionId: ids.version });
    expectTypeOf(questionPath).toEqualTypeOf<AdminQuestionIdPath>();
    expectTypeOf(versionPath).toEqualTypeOf<AdminQuestionVersionIdPath>();
    expect(() =>
      adminQuestionVersionIdPathSchema.parse({
        versionId: ids.version,
        questionId: ids.question,
      }),
    ).toThrow();
  });

  it('초안 전체 교체는 import와 같은 canonical 문제 payload를 사용한다', () => {
    expect(adminQuestionVersionPayloadSchema.parse(payload)).toEqual(payload);
    expect(() =>
      adminQuestionVersionPayloadSchema.parse({
        ...payload,
        options: [{ ...payload.options[0], isCorrect: true }],
      }),
    ).toThrow();
  });
});

describe('관리자 문제 공개 응답 계약', () => {
  it('모든 상태 목록과 페이지 metadata를 검증한다', () => {
    const response = {
      items: [
        {
          questionId: ids.question,
          status: 'DRAFT',
          currentPublishedVersionId: null,
          latestVersion: 1,
          latestVersionId: ids.version,
          latestVersionStatus: 'DRAFT',
          validationStatus: 'PENDING',
          questionTypeSlug: 'reading-standard-choice',
          difficulty: 2,
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    } as const;

    expect(adminQuestionListResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      adminQuestionListResponseSchema.parse({
        ...response,
        items: [{ ...response.items[0], requestHash: 'private' }],
      }),
    ).toThrow();
  });

  it('문제 상세는 버전·검증·정답 option ID를 공개하고 isCorrect를 거부한다', () => {
    const detail = {
      questionId: ids.question,
      status: 'DRAFT',
      currentPublishedVersionId: null,
      versions: [
        {
          id: ids.version,
          version: 1,
          status: 'DRAFT',
          validation: {
            status: 'FAILED',
            issues: [{ path: 'options', code: 'OPTION_COUNT_INVALID' }],
            validatedAt: '2026-07-24T00:00:00.000Z',
          },
          questionType: {
            id: ids.type,
            slug: 'reading-standard-choice',
            version: 1,
            skill: 'READING',
            template: 'STANDARD_CHOICE',
          },
          difficulty: 2,
          blocks: [
            {
              id: ids.block,
              kind: 'QUESTION',
              displayMode: 'TEXT',
              position: 0,
              sentences: [
                {
                  position: 0,
                  speaker: null,
                  sentenceVersionId: ids.sentence,
                },
              ],
            },
          ],
          options: [
            {
              id: ids.option,
              position: 0,
              sentenceVersionId: ids.sentence,
            },
          ],
          correctOptionId: ids.option,
          createdAt: '2026-07-24T00:00:00.000Z',
          publishedAt: null,
        },
      ],
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    } as const;

    expect(adminQuestionDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...detail,
        versions: [
          {
            ...detail.versions[0],
            options: [{ ...detail.versions[0].options[0], isCorrect: true }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...detail,
        versions: [
          {
            ...detail.versions[0],
            correctOptionId: ids.block,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...detail,
        versions: [
          {
            ...detail.versions[0],
            options: [
              detail.versions[0].options[0],
              detail.versions[0].options[0],
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...detail,
        storageKey: 'audio/private',
      }),
    ).toThrow();
  });

  it('버전 validation 상태와 issue·검증 시각 조합을 일관되게 검증한다', () => {
    const base = {
      questionId: ids.question,
      status: 'DRAFT',
      currentPublishedVersionId: null,
      versions: [
        {
          id: ids.version,
          version: 1,
          status: 'DRAFT',
          validation: {
            status: 'PENDING',
            issues: [],
            validatedAt: null,
          },
          questionType: {
            id: ids.type,
            slug: 'reading-standard-choice',
            version: 1,
            skill: 'READING',
            template: 'STANDARD_CHOICE',
          },
          difficulty: 2,
          blocks: [],
          options: [
            {
              id: ids.option,
              position: 0,
              sentenceVersionId: ids.sentence,
            },
          ],
          correctOptionId: ids.option,
          createdAt: '2026-07-24T00:00:00.000Z',
          publishedAt: null,
        },
      ],
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    } as const;
    const issue = { path: 'options', code: 'OPTION_COUNT_INVALID' } as const;
    const validatedAt = '2026-07-24T00:00:00.000Z';

    expect(adminQuestionDetailResponseSchema.parse(base)).toEqual(base);
    expect(
      adminQuestionDetailResponseSchema.parse({
        ...base,
        versions: [
          {
            ...base.versions[0],
            validation: {
              status: 'PASSED',
              issues: [],
              validatedAt,
            },
          },
        ],
      }).versions[0]!.validation.status,
    ).toBe('PASSED');
    expect(
      adminQuestionDetailResponseSchema.parse({
        ...base,
        versions: [
          {
            ...base.versions[0],
            validation: {
              status: 'FAILED',
              issues: [issue],
              validatedAt,
            },
          },
        ],
      }).versions[0]!.validation.status,
    ).toBe('FAILED');
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...base,
        versions: [
          {
            ...base.versions[0],
            validation: {
              status: 'PENDING',
              issues: [issue],
              validatedAt,
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...base,
        versions: [
          {
            ...base.versions[0],
            validation: {
              status: 'PASSED',
              issues: [],
              validatedAt: null,
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminQuestionDetailResponseSchema.parse({
        ...base,
        versions: [
          {
            ...base.versions[0],
            validation: {
              status: 'FAILED',
              issues: [],
              validatedAt,
            },
          },
        ],
      }),
    ).toThrow();
  });

  it('검증 실패는 안정적인 path와 code의 200 보고서로 표현한다', () => {
    const report = {
      status: 'FAILED',
      issues: [{ path: 'options', code: 'OPTION_COUNT_INVALID' }],
    } as const;
    expect(adminQuestionValidationReportSchema.parse(report)).toEqual(report);
    expect(() =>
      adminQuestionValidationReportSchema.parse({
        ...report,
        issues: [{ ...report.issues[0], dbRow: { id: ids.version } }],
      }),
    ).toThrow();
  });

  it('생성·교체한 문제 버전 요약은 DRAFT·PENDING 상태만 허용한다', () => {
    const draft = {
      questionId: ids.question,
      versionId: ids.version,
      version: 1,
      status: 'DRAFT',
      validationStatus: 'PENDING',
    } as const;
    const response = adminQuestionVersionResponseSchema.parse(draft);

    expectTypeOf(response).toEqualTypeOf<AdminQuestionVersionResponse>();
    expect(response.version).toBe(1);
    for (const status of ['PUBLISHED', 'RETIRED', 'INVALIDATED'] as const) {
      expect(() =>
        adminQuestionVersionResponseSchema.parse({ ...draft, status }),
      ).toThrow();
    }
    for (const validationStatus of ['PASSED', 'FAILED'] as const) {
      expect(() =>
        adminQuestionVersionResponseSchema.parse({
          ...draft,
          validationStatus,
        }),
      ).toThrow();
    }
  });
});
