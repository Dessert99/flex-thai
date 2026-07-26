/** 단어 연습 Controller의 보호 metadata와 strict path·body 경계를 검증한다 */
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { Module, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { createOpenApiDocument } from '../openapi/openapi.js';
import { LearnerVocabularyPracticeService } from './learner-vocabulary-practice.service.js';
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

@Module({
  controllers: [LearnerVocabularyPracticeController],
  providers: [
    { provide: LearnerVocabularyPracticeService, useValue: service() },
    {
      provide: IDENTITY_USER_REPOSITORY,
      useValue: {},
    },
    {
      provide: AUTHORIZER_GUARD_OPTIONS,
      useValue: { userPoolId: 'pool', clientId: 'client' },
    },
    CognitoAuthorizerGuard,
    ApplicationRoleGuard,
  ],
})
class VocabularyPracticeSwaggerTestModule {}

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
    expect(metadata('get').method).toBe(RequestMethod.GET);
    expect(metadata('answer').path).toBe(
      'me/vocabulary-practice/sessions/:sessionId/questions/:questionId/answers',
    );
    expect(metadata('answer').method).toBe(RequestMethod.POST);
  });

  it('세 route의 Swagger 보안·입력·응답·문제 metadata를 생성한다', async () => {
    const app = await NestFactory.create(VocabularyPracticeSwaggerTestModule, {
      abortOnError: false,
      logger: false,
    });
    try {
      const document = createOpenApiDocument(app);
      const createOperation =
        document.paths['/me/vocabulary-practice/sessions']?.post;
      const getOperation =
        document.paths['/me/vocabulary-practice/sessions/{sessionId}']?.get;
      const answerOperation =
        document.paths[
          '/me/vocabulary-practice/sessions/{sessionId}/questions/{questionId}/answers'
        ]?.post;

      for (const operation of [
        createOperation,
        getOperation,
        answerOperation,
      ]) {
        expect(operation?.security).toEqual([{ accessToken: [] }]);
        expect(Object.keys(operation?.responses ?? {})).toEqual(
          expect.arrayContaining(['400', '401', '403', '404', '409', '500']),
        );
        for (const status of ['400', '401', '404', '409']) {
          expect(operation?.responses[status]).toEqual(
            expect.objectContaining({
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetailsDto' },
                },
              },
            }),
          );
        }
      }

      expect(createOperation).toEqual(
        expect.objectContaining({
          summary: '단어 연습 세션을 생성한다',
          requestBody: expect.any(Object),
          responses: expect.objectContaining({
            '201': expect.objectContaining({
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        $ref: '#/components/schemas/ActiveVocabularyPracticeSessionResponseDto',
                      },
                      {
                        $ref: '#/components/schemas/CompletedVocabularyPracticeSessionResponseDto',
                      },
                    ],
                  },
                },
              },
            }),
          }),
        }),
      );
      expect(getOperation?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          }),
        ]),
      );
      expect(answerOperation?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'sessionId', in: 'path' }),
          expect.objectContaining({ name: 'questionId', in: 'path' }),
        ]),
      );
      expect(answerOperation?.requestBody).toEqual(expect.any(Object));
      expect(answerOperation?.responses['200']).toEqual(
        expect.objectContaining({
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/VocabularyPracticeAnswerResponseDto',
              },
            },
          },
        }),
      );
      expect(document.components?.schemas).toEqual(
        expect.objectContaining({
          ActiveVocabularyPracticeSessionResponseDto: expect.objectContaining({
            properties: expect.objectContaining({
              status: expect.any(Object),
            }),
          }),
          CompletedVocabularyPracticeSessionResponseDto:
            expect.objectContaining({
              properties: expect.objectContaining({
                result: expect.any(Object),
              }),
            }),
        }),
      );
    } finally {
      await app.close();
    }
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
