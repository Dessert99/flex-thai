/** 단어장 Controller의 인증·strict Zod·HTTP operation 경계를 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { LearnerWordbooksController } from './learner-wordbooks.controller.js';

const ids = {
  wordbook: '00000000-0000-4000-8000-000000000101',
  target: '00000000-0000-4000-8000-000000000102',
  vocabulary: '00000000-0000-4000-8000-000000000103',
} as const;
const user = {
  userId: 'user-id',
  sub: 'subject-id',
  email: 'learner@example.com',
  role: 'LEARNER',
  mfaEnrolledAt: null,
} as const;

const service = () => ({
  listWordbooks: vi.fn().mockResolvedValue({ items: [] }),
  create: vi.fn().mockResolvedValue({}),
  rename: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue(undefined),
  listItems: vi.fn().mockResolvedValue({}),
  addVocabulary: vi.fn().mockResolvedValue(undefined),
  removeVocabulary: vi.fn().mockResolvedValue(undefined),
  copyVocabularies: vi.fn().mockResolvedValue(undefined),
  moveVocabularies: vi.fn().mockResolvedValue(undefined),
  removeVocabularies: vi.fn().mockResolvedValue(undefined),
  listMemberships: vi.fn().mockResolvedValue({ wordbookIds: [] }),
});

const metadata = (method: keyof LearnerWordbooksController) => {
  const handler = Object.getOwnPropertyDescriptor(
    LearnerWordbooksController.prototype,
    method,
  )?.value as object;
  return {
    code: Reflect.getMetadata(HTTP_CODE_METADATA, handler) as
      | number
      | undefined,
    method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string,
  };
};

describe('LearnerWordbooksController 보호와 HTTP metadata', () => {
  it('Bearer guard 두 개와 LEARNER 역할을 class 전체에 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearnerWordbooksController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, LearnerWordbooksController),
    ).toBe('LEARNER');
  });

  it('생성은 201이고 삭제·항목 변경·bulk는 204로 선언한다', () => {
    expect(metadata('create')).toMatchObject({
      method: RequestMethod.POST,
      path: 'me/wordbooks',
    });
    for (const method of [
      'delete',
      'addVocabulary',
      'removeVocabulary',
      'copyVocabularies',
      'moveVocabularies',
      'removeVocabularies',
    ] as const) {
      expect(metadata(method).code).toBe(204);
    }
  });

  it('목록·상세·membership GET 경로를 분리한다', () => {
    expect(metadata('listWordbooks')).toMatchObject({
      method: RequestMethod.GET,
      path: 'me/wordbooks',
    });
    expect(metadata('listItems').path).toBe(
      'me/wordbooks/:wordbookId/items',
    );
    expect(metadata('listMemberships').path).toBe(
      'me/vocabularies/:vocabularyId/wordbook-memberships',
    );
  });
});

describe('LearnerWordbooksController strict 공개 입력', () => {
  it('이름과 목록 query를 parse해 현재 userId로 전달한다', async () => {
    const fake = service();
    const controller = new LearnerWordbooksController(fake as never);

    await controller.create(user, { name: ' FLEX ' });
    await controller.rename(
      user,
      { wordbookId: ids.wordbook },
      { name: ' 듣기 ' },
    );
    await controller.listItems(
      user,
      { wordbookId: ids.wordbook },
      { query: ' สวัสดี ', page: '2', difficulty: '3' },
    );

    expect(fake.create).toHaveBeenCalledWith('user-id', { name: 'FLEX' });
    expect(fake.rename).toHaveBeenCalledWith('user-id', ids.wordbook, {
      name: '듣기',
    });
    expect(fake.listItems).toHaveBeenCalledWith('user-id', ids.wordbook, {
      query: 'สวัสดี',
      difficulty: 3,
      page: 2,
      pageSize: 20,
    });
  });

  it('항목 path와 bulk body를 strict 검증해 정확히 위임한다', async () => {
    const fake = service();
    const controller = new LearnerWordbooksController(fake as never);

    await controller.addVocabulary(user, {
      wordbookId: ids.wordbook,
      vocabularyId: ids.vocabulary,
    });
    await controller.copyVocabularies(
      user,
      { wordbookId: ids.wordbook },
      {
        targetWordbookId: ids.target,
        vocabularyIds: [ids.vocabulary],
      },
    );
    await controller.removeVocabularies(
      user,
      { wordbookId: ids.wordbook },
      { vocabularyIds: [ids.vocabulary] },
    );

    expect(fake.addVocabulary).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      ids.vocabulary,
    );
    expect(fake.copyVocabularies).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      {
        targetWordbookId: ids.target,
        vocabularyIds: [ids.vocabulary],
      },
    );
    expect(fake.removeVocabularies).toHaveBeenCalledWith(
      'user-id',
      ids.wordbook,
      { vocabularyIds: [ids.vocabulary] },
    );
  });

  it('알 수 없는 key와 잘못된 UUID·중복 bulk를 service 전에 거부한다', async () => {
    const fake = service();
    const controller = new LearnerWordbooksController(fake as never);

    expect(() =>
      controller.create(user, { name: 'FLEX', extra: true }),
    ).toThrow();
    await expect(
      controller.delete(user, { wordbookId: 'invalid' }),
    ).rejects.toThrow();
    await expect(
      controller.moveVocabularies(
        user,
        { wordbookId: ids.wordbook },
        {
          targetWordbookId: ids.target,
          vocabularyIds: [ids.vocabulary, ids.vocabulary],
        },
      ),
    ).rejects.toThrow();
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
    expect(fake.moveVocabularies).not.toHaveBeenCalled();
  });

  it('membership path를 검증해 현재 userId를 전달한다', async () => {
    const fake = service();
    const controller = new LearnerWordbooksController(fake as never);

    await controller.listMemberships(user, {
      vocabularyId: ids.vocabulary,
    });

    expect(fake.listMemberships).toHaveBeenCalledWith(
      'user-id',
      ids.vocabulary,
    );
  });
});
