/** 관리자 어휘 Controller의 guard·204 command·strict 요청 전달을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminVocabulariesController } from './admin-vocabularies.controller.js';

const vocabularyId = '00000000-0000-4000-8000-000000000001';
const relationId = '00000000-0000-4000-8000-000000000002';
const meaningId = '00000000-0000-4000-8000-000000000003';
const targetMeaningId = '00000000-0000-4000-8000-000000000004';
const representativeVocabularyId = '00000000-0000-4000-8000-000000000005';
const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;

const readHttpCode = (method: keyof AdminVocabulariesController) => {
  const handler = Object.getOwnPropertyDescriptor(
    AdminVocabulariesController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

describe('AdminVocabulariesController 공개 경계', () => {
  it('Bearer·ADMIN·MFA guard와 네 변경 command의 204를 고정한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminVocabulariesController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminVocabulariesController),
    ).toBe('ADMIN');
    expect(readHttpCode('replaceVocabulary')).toBe(204);
    expect(readHttpCode('publishVocabulary')).toBe(204);
    expect(readHttpCode('hideVocabulary')).toBe(204);
    expect(readHttpCode('restoreVocabulary')).toBe(204);
    expect(readHttpCode('deleteRelation')).toBe(204);
  });

  it('query·path·body를 parse하고 actor 문맥을 전달한다', async () => {
    const fake = {
      listVocabularies: vi.fn().mockResolvedValue({
        items: [],
        page: {
          page: 1,
          pageSize: 50,
          totalItems: 0,
          totalPages: 0,
        },
      }),
      getVocabulary: vi.fn().mockResolvedValue({
        id: vocabularyId,
        thai: 'ก',
        kind: 'WORD',
        status: 'DRAFT',
        mergedIntoVocabularyId: null,
        meanings: [],
        pronunciations: [],
        meaningPronunciations: [],
        relations: [],
        usage: { sentenceVersionIds: [], questionVersionIds: [] },
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
      }),
      replaceVocabulary: vi.fn(),
      publishVocabulary: vi.fn(),
      hideVocabulary: vi.fn(),
      restoreVocabulary: vi.fn(),
      createVocabularyRelation: vi.fn().mockResolvedValue({
        id: relationId,
        sourceMeaningId: meaningId,
        targetMeaningId,
        type: 'RELATED',
        direction: 'DIRECTED',
        status: 'PENDING',
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }),
      updateVocabularyRelation: vi.fn(),
      deleteVocabularyRelation: vi.fn(),
      previewVocabularyMerge: vi.fn().mockResolvedValue({
        source: {
          id: vocabularyId,
          thai: 'ก',
          normalizedThai: 'ก',
          kind: 'WORD',
          status: 'DRAFT',
          meaningCount: 1,
          pronunciationCount: 0,
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
          thai: 'ข',
          normalizedThai: 'ข',
          kind: 'WORD',
          status: 'PUBLISHED',
          meaningCount: 1,
          pronunciationCount: 0,
          usage: {
            tokenOccurrences: 0,
            expressionOccurrences: 0,
            savedMemberships: 0,
            wordbookMemberships: 0,
            practiceQuestions: 0,
          },
        },
        comparison: { normalizedEqual: false, codePointDistance: 1 },
        mergeToken: 'a'.repeat(43),
      }),
      mergeVocabulary: vi.fn().mockResolvedValue({
        sourceVocabularyId: vocabularyId,
        representativeVocabularyId,
        movedCounts: {
          meanings: 1,
          pronunciations: 0,
          meaningPronunciations: 0,
          tokenOccurrences: 0,
          expressionOccurrences: 0,
          savedMemberships: 0,
          wordbookMemberships: 0,
          practiceQuestions: 0,
        },
      }),
    };
    const controller = new AdminVocabulariesController(fake as never);

    await controller.listVocabularies({ query: ' ก ', pageSize: '50' });
    await controller.getVocabulary({ vocabularyId });
    await expect(
      controller.replaceVocabulary(
        user,
        'request-1',
        { vocabularyId },
        { thai: 'ก' },
      ),
    ).rejects.toThrow();

    expect(fake.listVocabularies).toHaveBeenCalledWith({
      query: 'ก',
      page: 1,
      pageSize: 50,
    });
    expect(fake.getVocabulary).toHaveBeenCalledWith(vocabularyId);
    expect(fake.replaceVocabulary).not.toHaveBeenCalled();
  });

  it('관계 CRUD와 병합 preview·실행에 actor와 strict 계약을 전달한다', async () => {
    const fake = {
      createVocabularyRelation: vi.fn().mockResolvedValue({
        id: relationId,
        sourceMeaningId: meaningId,
        targetMeaningId,
        type: 'RELATED',
        direction: 'DIRECTED',
        status: 'PENDING',
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }),
      updateVocabularyRelation: vi.fn().mockResolvedValue({
        id: relationId,
        sourceMeaningId: meaningId,
        targetMeaningId,
        type: 'RELATED',
        direction: 'DIRECTED',
        status: 'PASSED',
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }),
      deleteVocabularyRelation: vi.fn(),
      previewVocabularyMerge: vi.fn().mockResolvedValue({
        source: {
          id: vocabularyId,
          thai: 'ก',
          normalizedThai: 'ก',
          kind: 'WORD',
          status: 'DRAFT',
          meaningCount: 1,
          pronunciationCount: 0,
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
          thai: 'ข',
          normalizedThai: 'ข',
          kind: 'WORD',
          status: 'PUBLISHED',
          meaningCount: 1,
          pronunciationCount: 0,
          usage: {
            tokenOccurrences: 0,
            expressionOccurrences: 0,
            savedMemberships: 0,
            wordbookMemberships: 0,
            practiceQuestions: 0,
          },
        },
        comparison: { normalizedEqual: false, codePointDistance: 1 },
        mergeToken: 'a'.repeat(43),
      }),
      mergeVocabulary: vi.fn().mockResolvedValue({
        sourceVocabularyId: vocabularyId,
        representativeVocabularyId,
        movedCounts: {
          meanings: 1,
          pronunciations: 0,
          meaningPronunciations: 0,
          tokenOccurrences: 0,
          expressionOccurrences: 0,
          savedMemberships: 0,
          wordbookMemberships: 0,
          practiceQuestions: 0,
        },
      }),
    };
    const controller = new AdminVocabulariesController(fake as never);

    await controller.createRelation(
      user,
      'request-2',
      { vocabularyId },
      {
        sourceMeaningId: meaningId,
        targetMeaningId,
        type: 'RELATED',
        direction: 'DIRECTED',
      },
    );
    await controller.updateRelation(
      user,
      'request-3',
      { vocabularyId, relationId },
      { status: 'PASSED' },
    );
    await controller.deleteRelation({ vocabularyId, relationId });
    await controller.previewMerge(
      { vocabularyId },
      { representativeVocabularyId },
    );
    await controller.mergeVocabulary(
      user,
      'request-4',
      { vocabularyId },
      {
        representativeVocabularyId,
        mergeToken: 'a'.repeat(43),
      },
    );

    expect(fake.createVocabularyRelation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.userId, requestId: 'request-2' }),
      vocabularyId,
      expect.objectContaining({ sourceMeaningId: meaningId }),
    );
    expect(fake.mergeVocabulary).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-4' }),
      vocabularyId,
      expect.objectContaining({ representativeVocabularyId }),
    );
  });
});
