import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { ExtractionTemplatesController } from './extraction-templates.controller.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  sub: 'admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;
const record = {
  id: '00000000-0000-4000-8000-000000000002',
  description: '설명',
  body: '첫 줄\n둘째 줄',
  createdAt: new Date('2026-09-18T00:00:00Z'),
};
const setup = () => {
  const repository = {
    list: vi.fn().mockResolvedValue([record]),
    create: vi.fn().mockResolvedValue(record),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    repository,
    controller: new ExtractionTemplatesController(repository),
  };
};
describe('단어 추출 템플릿 API', () => {
  it('관리자와 MFA 보호를 적용한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ExtractionTemplatesController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, ExtractionTemplatesController),
    ).toBe('ADMIN');
  });
  it('목록을 직렬화하고 여러 줄 지시문을 그대로 저장한다', async () => {
    const { controller, repository } = setup();
    expect(await controller.list()).toEqual({
      items: [{ ...record, createdAt: record.createdAt.toISOString() }],
    });
    await controller.create(
      { description: ' 설명 ', body: record.body },
      actor,
    );
    expect(repository.create).toHaveBeenCalledWith(
      { description: '설명', body: record.body },
      actor,
    );
  });
  it.each([
    { description: ' ', body: '지시문' },
    { description: '설명\n다음 줄', body: '지시문' },
    { description: '설명', body: '' },
    { description: '설명', body: '가'.repeat(20001) },
  ])('잘못된 입력을 저장하지 않는다: %j', async (input) => {
    const { controller, repository } = setup();
    await expect(controller.create(input, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('삭제 ID를 검사하고 작업자를 전달한다', async () => {
    const { controller, repository } = setup();
    await expect(controller.delete('invalid', actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
    await controller.delete(record.id, actor);
    expect(repository.delete).toHaveBeenCalledWith(record.id, actor);
  });
});
