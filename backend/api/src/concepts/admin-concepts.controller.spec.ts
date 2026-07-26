/** 관리자 개념 controller의 역할·TOTP 경계를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminConceptsController } from './admin-concepts.controller.js';

describe('AdminConceptsController', () => {
  it('인증·ADMIN 역할·TOTP guard를 모두 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminConceptsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminConceptsController),
    ).toBe('ADMIN');
  });

  it('관리자 9개 operation의 route와 status를 고정한다', () => {
    const metadata = (method: keyof AdminConceptsController) => {
      const handler = Object.getOwnPropertyDescriptor(
        AdminConceptsController.prototype,
        method,
      )?.value as object;
      return {
        code: Reflect.getMetadata(HTTP_CODE_METADATA, handler),
        method: Reflect.getMetadata(METHOD_METADATA, handler),
        path: Reflect.getMetadata(PATH_METADATA, handler),
      };
    };
    expect(metadata('list')).toMatchObject({
      method: RequestMethod.GET,
      path: 'concepts',
    });
    expect(metadata('create')).toMatchObject({
      code: 201,
      method: RequestMethod.POST,
      path: 'concepts',
    });
    expect(metadata('detail').path).toBe('concepts/:conceptId');
    expect(metadata('nextDraft').code).toBe(201);
    expect(metadata('replace').method).toBe(RequestMethod.PUT);
    expect(metadata('validate').path).toBe(
      'concept-versions/:versionId/validate',
    );
    expect(metadata('publish').code).toBe(204);
    expect(metadata('hide').code).toBe(204);
    expect(metadata('restore').code).toBe(204);
  });

  it('strict path와 body를 service command로 전달한다', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({}),
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AdminConceptsController(service as never);
    const user = {
      userId: '11111111-1111-4111-8111-111111111111',
      sub: 'admin-sub',
      email: 'admin@example.com',
      role: 'ADMIN',
      mfaEnrolledAt: new Date(),
    } as const;
    await controller.create(user, 'request-1', {
      category: 'GRAMMAR',
      position: 0,
      title: '제목',
      summary: '요약',
      blocks: [
        {
          kind: 'EXPLANATION',
          position: 0,
          heading: '설명',
          paragraphs: ['본문'],
        },
      ],
    });
    await controller.publish(user, 'request-1', {
      versionId: '22222222-2222-4222-8222-222222222222',
    });

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '제목' }),
      expect.objectContaining({ requestId: 'request-1' }),
    );
    expect(() =>
      controller.publish(user, 'request-1', { versionId: 'invalid' }),
    ).toThrow();
  });
});
