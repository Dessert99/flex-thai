/** 학습자 개념 controller의 공개 경계를 검증한다 */
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
import { LearnerConceptsController } from './learner-concepts.controller.js';

describe('LearnerConceptsController', () => {
  it('학습자 guard와 두 GET route를 고정한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearnerConceptsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, LearnerConceptsController),
    ).toBe('LEARNER');
    const list = Object.getOwnPropertyDescriptor(
      LearnerConceptsController.prototype,
      'list',
    )?.value as object;
    const detail = Object.getOwnPropertyDescriptor(
      LearnerConceptsController.prototype,
      'detail',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, list)).toBe('concepts');
    expect(Reflect.getMetadata(PATH_METADATA, detail)).toBe(
      'concepts/:conceptId',
    );
  });

  it('category 계약을 parse해 목록 service에 전달한다', async () => {
    const concepts = {
      listPublished: vi.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new LearnerConceptsController(concepts as never);

    await expect(controller.list({ category: 'GRAMMAR' })).resolves.toEqual({
      items: [],
    });
    expect(concepts.listPublished).toHaveBeenCalledWith('GRAMMAR');
  });
});
