/** 관리자 사용자 목록·상태 변경·beta 안내 추적 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
  userManagementListResponseSchema,
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
            createdAt: '2026-07-26T00:00:00.000Z',
            updatedAt: '2026-07-26T00:00:00.000Z',
          },
        ],
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
