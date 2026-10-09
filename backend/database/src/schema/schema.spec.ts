/** 기초 ERD에서 보안·중복 방지 column이 사라지지 않게 고정한다 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { authChallenges, users } from './identity.schema.js';

describe('기초 데이터베이스 schema', () => {
  it('사용자 신원은 변경 불가능한 cognitoSub를 가진다', () => {
    expect(Object.keys(getTableColumns(users))).toContain('cognitoSub');
  });

  it('사용자는 관리자 TOTP 등록 완료 시각을 가진다', () => {
    expect(Object.keys(getTableColumns(users))).toContain('mfaEnrolledAt');
  });

  it('인증 challenge는 코드·링크 HMAC과 소비 예약 상태만 저장한다', () => {
    const columns = Object.keys(getTableColumns(authChallenges));

    expect(columns).toEqual(
      expect.arrayContaining([
        'email',
        'codeHmac',
        'linkHmac',
        'resendAt',
        'reservedAt',
        'consumedAt',
        'deliveryStatus',
        'expiresAt',
      ]),
    );
    expect(columns).not.toEqual(
      expect.arrayContaining([
        'password',
        'emailHash',
        'cognitoSessionCiphertext',
      ]),
    );
  });

  it('사용자는 stable 최신순 조회 index를 가진다', () => {
    expect(
      getTableConfig(users).indexes.map(({ config }) => config.name),
    ).toContain('users_updated_at_id_idx');
  });
});
