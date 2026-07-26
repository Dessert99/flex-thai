/** 단어 연습 Controller의 보호 metadata와 strict path·body 경계를 검증한다 */
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { LearnerVocabularyPracticeController } from './learner-vocabulary-practice.controller.js';

const ids = {
  session: '00000000-0000-4000-8000-000000000801',
  question: '00000000-0000-4000-8000-000000000802',
  client: '00000000-0000-4000-8000-000000000803',
  option: '00000000-0000-4000-8000-000000000804',
  vocabulary: '00000000-0000-4000-8000-000000000805',
} as const;
const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'learner@example.com',
  role: 'LEARNER',
  mfaEnrolledAt: null,
} as const;

const service = () => ({
  create: vi.fn().mockResolvedValue({}),
  get: vi.fn().mockResolvedValue({}),
  answer: vi.fn().mockResolvedValue({}),
});

const metadata = (method: keyof LearnerVocabularyPracticeController) => {
  const handler = Object.getOwnPropertyDescriptor(
    LearnerVocabularyPracticeController.prototype,
    method,
  )?.value as object;
  return {
    method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string,
  };
};

describe('LearnerVocabularyPracticeController 보호와 route', () => {
  it('Bearer guard 두 개와 LEARNER 역할을 class 전체에 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearnerVocabularyPracticeController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
    expect(
      Reflect.getMetadata(
        REQUIRED_ROLE_KEY,
        LearnerVocabularyPracticeController,
      ),
    ).toBe('LEARNER');
  });

  it('세션 생성·조회·답안 route를 분리한다', () => {
    expect(metadata('create')).toEqual({
      method: RequestMethod.POST,
      path: 'me/vocabulary-practice/sessions',
    });
    expect(metadata('get').path).toBe(
      'me/vocabulary-practice/sessions/:sessionId',
    );
    expect(metadata('answer').path).toBe(
      'me/vocabulary-practice/sessions/:sessionId/questions/:questionId/answers',
    );
  });
});

describe('LearnerVocabularyPracticeController strict 입력', () => {
  it('생성·답안 요청을 parse해 현재 userId로 전달한다', async () => {
    const fake = service();
    const controller = new LearnerVocabularyPracticeController(fake as never);

    await controller.create(user, {
      source: {
        type: 'SEARCH_SELECTION',
        vocabularyIds: [ids.vocabulary],
      },
      modes: ['THAI_TO_MEANING'],
      questionCount: 10,
      order: 'SOURCE',
    });
    await controller.answer(
      user,
      { sessionId: ids.session, questionId: ids.question },
      { clientAnswerId: ids.client, selectedOptionId: ids.option },
    );

    expect(fake.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ questionCount: 10 }),
    );
    expect(fake.answer).toHaveBeenCalledWith(
      'user-1',
      ids.session,
      ids.question,
      { clientAnswerId: ids.client, selectedOptionId: ids.option },
    );
  });

  it('잘못된 UUID와 알 수 없는 body key를 service 전에 거부한다', async () => {
    const fake = service();
    const controller = new LearnerVocabularyPracticeController(fake as never);

    expect(() => controller.get(user, { sessionId: 'invalid' })).toThrow();
    expect(() =>
      controller.create(user, {
        source: { type: 'WORDBOOK', wordbookId: ids.session },
        modes: ['THAI_TO_MEANING'],
        questionCount: 10,
        order: 'SOURCE',
        mastery: true,
      }),
    ).toThrow();
    expect(fake.get).not.toHaveBeenCalled();
    expect(fake.create).not.toHaveBeenCalled();
  });
});
