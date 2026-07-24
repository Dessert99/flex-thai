/** 문제 Controller의 인증 metadata·Zod 경계·현재 사용자 전달을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { LearnerQuestionsController } from './learner-questions.controller.js';

const ids = {
  question: '00000000-0000-4000-8000-000000000001',
  version: '00000000-0000-4000-8000-000000000002',
  option: '00000000-0000-4000-8000-000000000003',
  clientAttempt: '00000000-0000-4000-8000-000000000004',
  attempt: '00000000-0000-4000-8000-000000000005',
} as const;

const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'learner@example.com',
  role: 'LEARNER',
  mfaEnrolledAt: null,
} as const;

const page = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
} as const;

const readHttpCode = (
  method: keyof LearnerQuestionsController,
): number | undefined => {
  const handler = Object.getOwnPropertyDescriptor(
    LearnerQuestionsController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

const service = () => ({
  listQuestions: vi.fn().mockResolvedValue({ items: [], page }),
  getQuestionDetail: vi.fn(),
  submitQuestionAttempt: vi.fn().mockResolvedValue({
    attempt: {
      id: ids.attempt,
      attemptNo: 1,
      isFirst: true,
      isCorrect: false,
      selectedOptionId: ids.option,
      submittedAt: '2026-07-24T00:00:00.000Z',
    },
    feedback: {
      correctOptionId: ids.option,
      explanationBlocks: [],
    },
  }),
  listAttempts: vi.fn().mockResolvedValue({ items: [], page }),
  saveQuestion: vi.fn().mockResolvedValue(undefined),
  removeQuestion: vi.fn().mockResolvedValue(undefined),
});

describe('LearnerQuestionsController 보호 경계', () => {
  it('Bearer guard 두 개와 LEARNER 역할을 class 전체에 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearnerQuestionsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, LearnerQuestionsController),
    ).toBe('LEARNER');
  });

  it('답안은 201, 저장 PUT과 DELETE는 body 없는 204로 선언한다', () => {
    expect(readHttpCode('submitQuestionAttempt')).toBe(201);
    expect(readHttpCode('saveQuestion')).toBe(204);
    expect(readHttpCode('removeQuestion')).toBe(204);
  });
});

describe('LearnerQuestionsController 공개 계약', () => {
  it('query를 parse하고 현재 userId로 목록과 풀이 기록을 조회한다', async () => {
    const fake = service();
    const controller = new LearnerQuestionsController(fake as never);

    await controller.listQuestions(user, { page: '2', saved: 'false' });
    await controller.listAttempts(user, { pageSize: '50' });

    expect(fake.listQuestions).toHaveBeenCalledWith('user-1', {
      page: 2,
      pageSize: 20,
      saved: false,
    });
    expect(fake.listAttempts).toHaveBeenCalledWith('user-1', {
      page: 1,
      pageSize: 50,
    });
  });

  it('path와 답안 body를 strict UUID 계약으로 parse해 제출한다', async () => {
    const fake = service();
    const controller = new LearnerQuestionsController(fake as never);
    const body = {
      questionVersionId: ids.version,
      selectedOptionId: ids.option,
      clientAttemptId: ids.clientAttempt,
      durationMs: 1_000,
    };

    await controller.submitQuestionAttempt(
      user,
      { questionId: ids.question },
      body,
    );

    expect(fake.submitQuestionAttempt).toHaveBeenCalledWith(
      'user-1',
      ids.question,
      body,
    );
    await expect(
      controller.submitQuestionAttempt(user, { questionId: 'invalid' }, body),
    ).rejects.toThrow();
    await expect(
      controller.submitQuestionAttempt(
        user,
        { questionId: ids.question },
        { ...body, internal: true },
      ),
    ).rejects.toThrow();
  });

  it('저장 PUT과 DELETE는 userId·path만 전달하고 undefined를 반환한다', async () => {
    const fake = service();
    const controller = new LearnerQuestionsController(fake as never);

    await expect(
      controller.saveQuestion(user, { questionId: ids.question }),
    ).resolves.toBeUndefined();
    await expect(
      controller.removeQuestion(user, { questionId: ids.question }),
    ).resolves.toBeUndefined();
    expect(fake.saveQuestion).toHaveBeenCalledWith('user-1', ids.question);
    expect(fake.removeQuestion).toHaveBeenCalledWith('user-1', ids.question);
  });

  it('service 응답도 strict 공개 schema로 다시 검증한다', async () => {
    const fake = service();
    fake.listQuestions.mockResolvedValueOnce({
      items: [],
      page,
      storageKey: 'private/leak',
    });
    const controller = new LearnerQuestionsController(fake as never);

    await expect(controller.listQuestions(user, {})).rejects.toThrow();
  });
});
