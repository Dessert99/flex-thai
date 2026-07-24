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
        meanings: [],
        pronunciations: [],
        meaningPronunciations: [],
        usage: { sentenceVersionIds: [], questionVersionIds: [] },
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
      }),
      replaceVocabulary: vi.fn(),
      publishVocabulary: vi.fn(),
      hideVocabulary: vi.fn(),
      restoreVocabulary: vi.fn(),
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
});
