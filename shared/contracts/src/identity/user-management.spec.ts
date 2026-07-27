/** 관리자 사용자 목록·상태 변경·beta 안내 추적 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
  userManagementListQuerySchema,
  userManagementListResponseSchema,
  userRoleUpdateRequestSchema,
  userStatusPathSchema,
  userStatusUpdateRequestSchema,
} from './user-management.js';

const userId = '00000000-0000-4000-8000-000000000001';

describe('관리자 사용자 관리 계약', () => {
  it('상태와 공개 사용자 목록을 strict JSON으로 검증한다', () => {
    expect(
      userManagementListResponseSchema.parse({
        items: [
          {
            id: userId,
            email: 'learner@hufs.ac.kr',
            role: 'LEARNER',
            status: 'ACTIVE',
            mfaEnrolled: false,
            mfaEnrolledAt: null,
            createdAt: '2026-07-26T00:00:00.000Z',
            updatedAt: '2026-07-26T00:00:00.000Z',
          },
        ],
        page: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }),
    ).toMatchObject({ items: [{ status: 'ACTIVE' }] });
    expect(userStatusPathSchema.parse({ userId })).toEqual({ userId });
    expect(userStatusUpdateRequestSchema.parse({ status: 'DISABLED' })).toEqual(
      { status: 'DISABLED' },
    );
    expect(() =>
      userStatusUpdateRequestSchema.parse({
        status: 'ACTIVE',
        password: 'forbidden',
      }),
    ).toThrow();
  });

  it('검색·역할·상태·TOTP 등록 여부와 페이지 query를 정규화한다', () => {
    expect(
      userManagementListQuerySchema.parse({
        query: ' Admin@HUFS.ac.kr ',
        role: 'ADMIN',
        status: 'ACTIVE',
        mfaEnrolled: 'true',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      query: 'admin@hufs.ac.kr',
      role: 'ADMIN',
      status: 'ACTIVE',
      mfaEnrolled: true,
      page: 2,
      pageSize: 50,
    });
    expect(userManagementListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(() => userManagementListQuerySchema.parse({ page: '0' })).toThrow();
    expect(() =>
      userManagementListQuerySchema.parse({ pageSize: '101' }),
    ).toThrow();
    expect(() =>
      userManagementListQuerySchema.parse({ mfaEnrolled: '1' }),
    ).toThrow();
  });

  it('역할 변경 요청은 두 역할 외의 값을 거부한다', () => {
    expect(userRoleUpdateRequestSchema.parse({ role: 'ADMIN' })).toEqual({
      role: 'ADMIN',
    });
    expect(() =>
      userRoleUpdateRequestSchema.parse({ role: 'OWNER' }),
    ).toThrow();
    expect(() =>
      userRoleUpdateRequestSchema.parse({ role: 'ADMIN', force: true }),
    ).toThrow();
  });

  it('학교 이메일 beta 안내를 가입 권한 없이 발송 기록으로만 표현한다', () => {
    expect(
      betaInvitationRequestSchema.parse({ email: ' New@HUFS.ac.kr ' }),
    ).toEqual({ email: 'new@hufs.ac.kr' });
    expect(
      betaInvitationResponseSchema.parse({
        id: '00000000-0000-4000-8000-000000000002',
        email: 'new@hufs.ac.kr',
        invitedByUserId: userId,
        sentAt: '2026-07-26T00:00:00.000Z',
      }),
    ).toMatchObject({ email: 'new@hufs.ac.kr' });
    expect(() =>
      betaInvitationRequestSchema.parse({ email: 'new@example.com' }),
    ).toThrow();
  });
});
