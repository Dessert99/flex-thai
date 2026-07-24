/** 관리자 내부 결과를 strict 공개 계약과 감사 문맥으로 조립하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AdminContentService,
  AdminPublicResponseError,
} from './admin-content.service.js';

const ids = {
  import: '00000000-0000-4000-8000-000000000001',
  media: '00000000-0000-4000-8000-000000000002',
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
  media: {
    requestAudioUpload: vi.fn().mockResolvedValue({
      mediaAssetId: ids.media,
      status: 'READY',
      uploadRequired: false,
      reused: true,
    }),
    completeAudioUpload: vi.fn().mockResolvedValue({
      id: ids.media,
      storageKey: `audio/${ids.media}`,
      status: 'READY',
      readyAt: occurredAt,
    }),
  },
  mediaQuery: {
    findById: vi.fn().mockResolvedValue({
      id: ids.media,
      kind: 'AUDIO',
      declaredMimeType: 'audio/mpeg',
      declaredSizeBytes: 10,
      declaredSha256: 'a'.repeat(64),
      status: 'UPLOADING',
      mimeType: null,
      sizeBytes: null,
      sha256: null,
      readyAt: null,
      createdAt: occurredAt,
      usage: {
        pronunciations: { count: 0, ids: [] },
        sentences: { count: 0, ids: [] },
      },
    }),
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
  },
  vocabularyQuery: { list: vi.fn(), findById: vi.fn() },
  now: () => occurredAt,
});

describe('AdminContentService 감사 문맥', () => {
  it('가져오기와 media 변경에 actor·requestId·occurredAt을 전달한다', async () => {
    const fakes = dependencies();
    const service = new AdminContentService(fakes as never);

    await service.createContentImport(
      actor,
      '00000000-0000-4000-8000-000000000099',
      {
        schemaVersion: 1,
        vocabularies: [],
        questions: [{ clientRef: 'question' }] as never,
      },
    );
    await service.requestAudioUpload(actor, {
      filename: 'voice.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    });

    expect(fakes.contentImports.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: 'user-1',
        context: {
          actorSub: 'subject-1',
          actorUserId: 'user-1',
          requestId: 'request-1',
          occurredAt,
        },
      }),
    );
    expect(fakes.media.requestAudioUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          actorSub: 'subject-1',
          actorUserId: 'user-1',
          requestId: 'request-1',
        },
      }),
    );
  });

  it('FAILED 검증 보고서를 HTTP 성공용 공개 응답으로 반환한다', async () => {
    const fakes = dependencies();
    const service = new AdminContentService(fakes as never);

    await expect(
      service.validateQuestionVersion(actor, ids.version),
    ).resolves.toEqual({
      status: 'FAILED',
      issues: [{ path: 'x', code: 'THAI_CONTENT_INVALID' }],
    });
  });

  it('Date를 ISO 문자열로 바꾸고 media storageKey를 공개하지 않는다', async () => {
    const service = new AdminContentService(dependencies() as never);

    await expect(service.getContentImport(ids.import)).resolves.toMatchObject({
      createdAt: occurredAt.toISOString(),
      completedAt: occurredAt.toISOString(),
    });
    await expect(service.completeMediaAsset(actor, ids.media)).resolves.toEqual(
      {
        mediaAssetId: ids.media,
        status: 'READY',
        readyAt: occurredAt.toISOString(),
      },
    );
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
