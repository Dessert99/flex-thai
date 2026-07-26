/** 관리자 오류 신고 Controller의 ADMIN MFA 경계를 검증한다 */
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { AdminContentErrorReportsController } from './admin-content-error-reports.controller.js';

describe('AdminContentErrorReportsController', () => {
  it('Cognito와 ADMIN 역할 및 MFA guard를 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminContentErrorReportsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
  });

  it('다섯 endpoint의 method·path·응답·body·query·param 문서를 연결한다', () => {
    const cases = [
      ['list', RequestMethod.GET, '/', false, true, false],
      ['detail', RequestMethod.GET, ':reportId', false, false, true],
      [
        'changeStatus',
        RequestMethod.PUT,
        ':reportId/status',
        true,
        false,
        true,
      ],
      ['assign', RequestMethod.PUT, ':reportId/assignee', true, false, true],
      [
        'unassign',
        RequestMethod.DELETE,
        ':reportId/assignee',
        false,
        false,
        true,
      ],
    ] as const;
    for (const [name, method, path, body, query, param] of cases) {
      const handler = Object.getOwnPropertyDescriptor(
        AdminContentErrorReportsController.prototype,
        name,
      )?.value as object;
      const parameters = Reflect.getMetadata(
        'swagger/apiParameters',
        handler,
      ) as Array<{ in: string }> | undefined;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata('swagger/apiOperation', handler)).toBeTruthy();
      expect(Reflect.getMetadata('swagger/apiResponse', handler)).toBeTruthy();
      expect(parameters?.some((item) => item.in === 'body') ?? false).toBe(
        body,
      );
      expect(parameters?.some((item) => item.in === 'query') ?? false).toBe(
        query,
      );
      expect(parameters?.some((item) => item.in === 'path') ?? false).toBe(
        param,
      );
    }
  });
});
