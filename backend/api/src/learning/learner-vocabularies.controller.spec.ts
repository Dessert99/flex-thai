/** 어휘 Controller의 인증 metadata·Zod 경계·현재 사용자 전달을 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { LearnerPublicResponseError } from './learner-content.service.js';
import { LearnerVocabulariesController } from './learner-vocabularies.controller.js';

const vocabularyId = '00000000-0000-4000-8000-000000000021';
const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'learner@example.com',
  role: 'LEARNER',
  mfaEnrolledAt: null,
} as const;
const emptyPage = {
  items: [],
  page: {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  },
} as const;
const detail = {
  id: vocabularyId,
  thai: 'สวัสดี',
  kind: 'WORD',
  meanings: [],
  pronunciations: [],
  saved: false,
  meaningPronunciations: [],
  exampleSentences: [],
} as const;

const service = () => ({
  listVocabularies: vi.fn().mockResolvedValue(emptyPage),
  getVocabularyDetail: vi.fn().mockResolvedValue(detail),
  listRelatedQuestions: vi.fn().mockResolvedValue(emptyPage),
});

describe('LearnerVocabulariesController 보호 경계', () => {
  it('Bearer guard 두 개와 LEARNER 역할을 class 전체에 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearnerVocabulariesController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, LearnerVocabulariesController),
    ).toBe('LEARNER');
  });
});

describe('LearnerVocabulariesController 공개 계약', () => {
  it('검색·관련 문제 query를 parse하고 현재 userId를 전달한다', async () => {
    const fake = service();
    const controller = new LearnerVocabulariesController(fake as never);

    await controller.listVocabularies(user, {
      query: ' สวัสดี ',
      difficulty: '2',
    });
    await controller.listRelatedQuestions(
      user,
      { vocabularyId },
      { page: '2' },
    );
    expect(fake.listVocabularies).toHaveBeenCalledWith('user-1', {
      query: 'สวัสดี',
      difficulty: 2,
      page: 1,
      pageSize: 20,
    });
    expect(fake.listRelatedQuestions).toHaveBeenCalledWith(
      'user-1',
      vocabularyId,
      { page: 2, pageSize: 20 },
    );
  });

  it('상세 path를 strict UUID로 검증한다', async () => {
    const fake = service();
    const controller = new LearnerVocabulariesController(fake as never);

    await expect(
      controller.getVocabularyDetail(user, { vocabularyId: 'invalid' }),
    ).rejects.toThrow();
  });

  it('어휘 상세 path를 검증하고 현재 userId로 조회한다', async () => {
    const fake = service();
    const controller = new LearnerVocabulariesController(fake as never);

    await expect(
      controller.getVocabularyDetail(user, { vocabularyId }),
    ).resolves.toEqual(detail);
    expect(fake.getVocabularyDetail).toHaveBeenCalledWith(
      'user-1',
      vocabularyId,
    );
  });

  it('세 공개 응답 method의 계약 실패를 모두 generic response 오류로 바꾼다', async () => {
    const extra = { storageKey: 'private/leak.mp3' };

    const listFake = service();
    listFake.listVocabularies.mockResolvedValueOnce({
      ...emptyPage,
      ...extra,
    });
    await expect(
      new LearnerVocabulariesController(listFake as never).listVocabularies(
        user,
        {},
      ),
    ).rejects.toBeInstanceOf(LearnerPublicResponseError);

    const detailFake = service();
    detailFake.getVocabularyDetail.mockResolvedValueOnce({
      ...detail,
      ...extra,
    });
    await expect(
      new LearnerVocabulariesController(
        detailFake as never,
      ).getVocabularyDetail(user, { vocabularyId }),
    ).rejects.toBeInstanceOf(LearnerPublicResponseError);

    const relatedFake = service();
    relatedFake.listRelatedQuestions.mockResolvedValueOnce({
      ...emptyPage,
      ...extra,
    });
    await expect(
      new LearnerVocabulariesController(
        relatedFake as never,
      ).listRelatedQuestions(user, { vocabularyId }, {}),
    ).rejects.toBeInstanceOf(LearnerPublicResponseError);
  });
});
