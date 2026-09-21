/** 어휘 Controller의 인증 metadata·Zod 경계·현재 사용자 전달을 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';

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
  saved: false,
  exampleSentences: [],
  relations: [],
} as const;

const service = () => ({
  listVocabularies: vi.fn().mockResolvedValue(emptyPage),
  getVocabularyDetail: vi.fn().mockResolvedValue(detail),
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
});
