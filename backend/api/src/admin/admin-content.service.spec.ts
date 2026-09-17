/** 관리자 내부 결과를 strict 공개 계약과 감사 문맥으로 조립하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AdminContentService,
  AdminPublicResponseError,
} from './admin-content.service.js';

const ids = {
  import: '00000000-0000-4000-8000-000000000001',
  question: '00000000-0000-4000-8000-000000000003',
  version: '00000000-0000-4000-8000-000000000004',
  vocabulary: '00000000-0000-4000-8000-000000000005',
} as const;
const occurredAt = new Date('2026-07-24T00:00:00.000Z');
const actor = {
  userId: 'user-1',
  sub: 'subject-1',
  requestId: 'request-1',
} as const;
const page = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
} as const;
const importDetail = {
  id: ids.import,
  status: 'COMPLETED',
  vocabularyCount: 1,
  questionCount: 0,
  importedCount: 1,
  rejectedCount: 0,
  createdAt: occurredAt,
  completedAt: occurredAt,
  items: [
    {
      kind: 'VOCABULARY',
      sourceIndex: 0,
      status: 'IMPORTED',
      targetId: ids.vocabulary,
      errors: [],
    },
  ],
} as const;

const dependencies = () => ({
  contentImports: { execute: vi.fn().mockResolvedValue(importDetail) },
  contentImportQuery: {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          id: importDetail.id,
          status: importDetail.status,
          vocabularyCount: importDetail.vocabularyCount,
          questionCount: importDetail.questionCount,
          importedCount: importDetail.importedCount,
          rejectedCount: importDetail.rejectedCount,
          createdAt: importDetail.createdAt,
          completedAt: importDetail.completedAt,
        },
      ],
      page,
    }),
    findById: vi.fn().mockResolvedValue(importDetail),
  },
  questions: {
    cloneVersion: vi.fn().mockResolvedValue({
      questionId: ids.question,
      versionId: ids.version,
      version: 2,
      status: 'DRAFT',
      validationStatus: 'PENDING',
    }),
    replaceVersion: vi.fn(),
  },
  questionPublication: {
    validateVersion: vi.fn().mockResolvedValue({
      status: 'FAILED',
      issues: [{ path: 'x', code: 'THAI_CONTENT_INVALID' }],
    }),
    publishVersion: vi.fn(),
    invalidateVersion: vi.fn(),
    hideQuestion: vi.fn(),
    restoreQuestion: vi.fn(),
  },
  questionQuery: { list: vi.fn(), findById: vi.fn() },
  vocabularies: {
    replace: vi.fn(),
    publish: vi.fn(),
    hide: vi.fn(),
    restore: vi.fn(),
    createRelation: vi.fn().mockResolvedValue({
      id: ids.version,
      sourceMeaningId: ids.question,
      targetMeaningId: ids.vocabulary,
      type: 'RELATED',
      direction: 'DIRECTED',
      status: 'PENDING',
      createdAt: occurredAt,
      updatedAt: occurredAt,
    }),
    updateRelation: vi.fn(),
    deleteRelation: vi.fn(),
    previewMerge: vi.fn(),
    merge: vi.fn(),
  },
  vocabularyQuery: { list: vi.fn(), findById: vi.fn() },
  now: () => occurredAt,
});

describe('AdminContentService 감사 문맥', () => {
  it('문제 상태와 어휘 중요도 command에 감사 문맥을 보존한다', async () => {
    const fakes = {
      ...dependencies(),
      questions: { changeStatus: vi.fn() },
      vocabularies: { ...dependencies().vocabularies, setImportance: vi.fn() },
    };
    const service = new AdminContentService(fakes as never);
    await service.changeQuestionStatus(actor, ids.question, {
      status: 'PUBLISHED',
      expectedUpdatedAt: occurredAt.toISOString(),
    });
    await service.setVocabularyImportance(actor, ids.vocabulary, 7);
    expect(fakes.questions.changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: ids.question,
        actorSub: actor.sub,
        expectedUpdatedAt: occurredAt,
      }),
    );
    expect(fakes.vocabularies.setImportance).toHaveBeenCalledWith(
      expect.objectContaining({
        vocabularyId: ids.vocabulary,
        importanceWeight: 7,
        actorSub: actor.sub,
      }),
    );
  });

  it('저장소 relation shape를 internal vocabularyId 없이 strict 공개 응답으로 변환한다', async () => {
    const service = new AdminContentService(dependencies() as never);

    await expect(
      service.createVocabularyRelation(actor, ids.vocabulary, {
        sourceMeaningId: ids.question,
        targetMeaningId: ids.vocabulary,
        type: 'RELATED',
        direction: 'DIRECTED',
      }),
    ).resolves.toEqual({
      id: ids.version,
      sourceMeaningId: ids.question,
      targetMeaningId: ids.vocabulary,
      type: 'RELATED',
      direction: 'DIRECTED',
      status: 'PENDING',
      createdAt: occurredAt.toISOString(),
      updatedAt: occurredAt.toISOString(),
    });
  });

  it.each(['storageKey', 'requestHash', 'referenceMap', 'isCorrect'] as const)(
    '내부 필드 %s가 섞이면 generic 공개 응답 오류를 던진다',
    async (privateField) => {
      const fakes = dependencies();
      fakes.contentImportQuery.findById.mockResolvedValueOnce({
        ...importDetail,
        [privateField]: 'private',
      });

      await expect(
        new AdminContentService(fakes as never).getContentImport(ids.import),
      ).rejects.toBeInstanceOf(AdminPublicResponseError);
    },
  );
});
