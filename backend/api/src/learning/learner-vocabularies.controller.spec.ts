/** 어휘 Controller의 인증 metadata·Zod 경계·현재 사용자 전달을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
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

const readHttpCode = (
  method: keyof LearnerVocabulariesController,
): number | undefined => {
  const handler = Object.getOwnPropertyDescriptor(
    LearnerVocabulariesController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

const service = () => ({
  listVocabularies: vi.fn().mockResolvedValue(emptyPage),
  getVocabularyDetail: vi.fn(),
  listRelatedQuestions: vi.fn().mockResolvedValue(emptyPage),
  listSavedVocabularies: vi.fn().mockResolvedValue(emptyPage),
  saveVocabulary: vi.fn().mockResolvedValue(undefined),
  removeVocabulary: vi.fn().mockResolvedValue(undefined),
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

  it('저장 PUT과 DELETE는 body 없는 204로 선언한다', () => {
    expect(readHttpCode('saveVocabulary')).toBe(204);
    expect(readHttpCode('removeVocabulary')).toBe(204);
  });
});

describe('LearnerVocabulariesController 공개 계약', () => {
  it('검색·관련·저장 목록 query를 parse하고 현재 userId를 전달한다', async () => {
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
    await controller.listSavedVocabularies(user, { pageSize: '50' });

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
    expect(fake.listSavedVocabularies).toHaveBeenCalledWith('user-1', {
      page: 1,
      pageSize: 50,
    });
  });

  it('상세·저장 path를 strict UUID로 검증하고 저장 변경만 위임한다', async () => {
    const fake = service();
    const controller = new LearnerVocabulariesController(fake as never);

    await controller.saveVocabulary(user, { vocabularyId });
    await controller.removeVocabulary(user, { vocabularyId });

    expect(fake.saveVocabulary).toHaveBeenCalledWith('user-1', vocabularyId);
    expect(fake.removeVocabulary).toHaveBeenCalledWith('user-1', vocabularyId);
    await expect(
      controller.getVocabularyDetail(user, { vocabularyId: 'invalid' }),
    ).rejects.toThrow();
  });

  it('service 응답도 strict 공개 schema로 다시 검증한다', async () => {
    const fake = service();
    fake.listVocabularies.mockResolvedValueOnce({
      ...emptyPage,
      storageKey: 'private/leak',
    });
    const controller = new LearnerVocabulariesController(fake as never);

    await expect(controller.listVocabularies(user, {})).rejects.toThrow();
  });
});
