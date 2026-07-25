/** 파괴적인 로컬 DB 재구성이 명시적으로 허용된 대상에서만 실행되는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { assertLocalResetAllowed } from './reset-seed-local.js';

describe('로컬 DB 재구성 보호', () => {
  it('명시적인 reset 승인이 없으면 실행을 거부한다', () => {
    expect(() =>
      assertLocalResetAllowed({
        databaseUrl:
          'postgres://flex_thia:local_only_password@postgres:5432/flex_thia',
      }),
    ).toThrow('LOCAL_DATABASE_RESET=true가 필요합니다');
  });

  it('로컬 Compose 대상이 아닌 DB 주소는 reset을 거부한다', () => {
    expect(() =>
      assertLocalResetAllowed({
        confirmation: 'true',
        databaseUrl:
          'postgres://flex_thia:password@production.example.com:5432/flex_thia',
      }),
    ).toThrow('로컬 flex_thia DB만 reset할 수 있습니다');
  });
});
