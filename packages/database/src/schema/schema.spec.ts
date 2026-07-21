/** 기초 ERD에서 보안·중복 방지 column이 사라지지 않게 고정한다 */
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { authChallenges, jobs, users } from './index.js';

describe('기초 데이터베이스 schema', () => {
  it('사용자 신원은 변경 불가능한 cognitoSub를 가진다', () => {
    expect(Object.keys(getTableColumns(users))).toContain('cognitoSub');
  });

  it('인증 challenge는 이메일·목적·코드 HMAC만 저장하고 비밀번호와 session은 저장하지 않는다', () => {
    const columns = Object.keys(getTableColumns(authChallenges));

    expect(columns).toEqual(
      expect.arrayContaining(['email', 'purpose', 'codeHmac', 'expiresAt']),
    );
    expect(columns).not.toEqual(
      expect.arrayContaining([
        'password',
        'emailHash',
        'linkHmac',
        'cognitoSessionCiphertext',
      ]),
    );
  });

  it('Job은 clientRequestId와 queue 전달 시각을 저장한다', () => {
    expect(Object.keys(getTableColumns(jobs))).toEqual(
      expect.arrayContaining(['clientRequestId', 'enqueuedAt']),
    );
  });
});
