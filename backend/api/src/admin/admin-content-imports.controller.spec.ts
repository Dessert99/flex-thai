/** 관리자 가져오기 Controller의 guard·status·strict 요청 전달을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminContentImportsController } from './admin-content-imports.controller.js';

const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;
const importId = '00000000-0000-4000-8000-000000000001';
const idempotencyKey = '00000000-0000-4000-8000-000000000002';
const importDetail = {
  id: importId,
  status: 'COMPLETED',
  vocabularyCount: 1,
  questionCount: 0,
  importedCount: 1,
  rejectedCount: 0,
  createdAt: '2026-07-24T00:00:00.000Z',
  completedAt: '2026-07-24T00:00:00.000Z',
  items: [
    {
      kind: 'VOCABULARY',
      sourceIndex: 0,
      status: 'IMPORTED',
      targetId: '00000000-0000-4000-8000-000000000003',
      errors: [],
    },
  ],
} as const;

const readHttpCode = (method: keyof AdminContentImportsController) => {
  const handler = Object.getOwnPropertyDescriptor(
    AdminContentImportsController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

describe('AdminContentImportsController 보호 경계', () => {
  it('Bearer·ADMIN·MFA guard를 class 전체에 요구하고 생성은 201이다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminContentImportsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminContentImportsController),
    ).toBe('ADMIN');
    expect(readHttpCode('createContentImport')).toBe(201);
  });
});

describe('AdminContentImportsController 공개 계약', () => {
  it('UUID header와 canonical body를 parse해 actor 문맥과 함께 전달한다', async () => {
    const service = {
      createContentImport: vi.fn().mockResolvedValue(importDetail),
    };
    const controller = new AdminContentImportsController(service as never);
    const body = {
      schemaVersion: 1,
      vocabularies: [
        {
          clientRef: 'vocabulary',
          thai: 'ก',
          kind: 'WORD',
          meanings: [
            {
              clientRef: 'meaning',
              meaningKo: '닭',
              partOfSpeech: '명사',
            },
          ],
          pronunciations: [
            {
              clientRef: 'pronunciation',
              pronunciationKo: '꺼',
              toneMarks: 'L',
              mediaAssetId: '00000000-0000-4000-8000-000000000004',
            },
          ],
        },
      ],
      questions: [],
    } as const;

    await expect(
      controller.createContentImport(user, 'request-1', idempotencyKey, body),
    ).resolves.toEqual(importDetail);
    expect(service.createContentImport).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        sub: 'subject-1',
        requestId: 'request-1',
      },
      idempotencyKey,
      body,
    );

    await expect(
      controller.createContentImport(user, 'request-1', 'invalid', {}),
    ).rejects.toThrow();
  });

  it('목록 query와 상세 path를 contracts schema로 parse한다', async () => {
    const service = {
      listContentImports: vi.fn().mockResolvedValue({
        items: [
          {
            id: importDetail.id,
            status: importDetail.status,
            vocabularyCount: importDetail.vocabularyCount,
            questionCount: importDetail.questionCount,
            importedCount: importDetail.importedCount,
            rejectedCount: importDetail.rejectedCount,
            createdAt: importDetail.createdAt,
            completedAt: importDetail.completedAt,
          },
        ],
        page: {
          page: 2,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1,
        },
      }),
      getContentImport: vi.fn().mockResolvedValue(importDetail),
    };
    const controller = new AdminContentImportsController(service as never);

    await controller.listContentImports({ page: '2', pageSize: '50' });
    await controller.getContentImport({ importId });

    expect(service.listContentImports).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
    });
    expect(service.getContentImport).toHaveBeenCalledWith(importId);
  });
});
