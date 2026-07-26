/** 로컬 seed가 passwordless 사용자와 단어장 cutover 이후 graph를 만드는지 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seedSql = readFileSync(
  new URL('../../seed/local.sql', import.meta.url),
  'utf8',
);

describe('로컬 seed SQL', () => {
  it('학교 이메일 사용자와 관리자 MFA 상태를 password 없이 만든다', () => {
    expect(seedSql).toContain("'admin@hufs.ac.kr'");
    expect(seedSql).toContain("'learner@hufs.ac.kr'");
    expect(seedSql).toContain('mfa_enrolled_at');
    expect(seedSql).not.toMatch(/password(?:_hash)?/iu);
  });

  it('학습자 저장 어휘를 legacy table 대신 단어장 membership으로 만든다', () => {
    expect(seedSql).toMatch(/insert into wordbooks/iu);
    expect(seedSql).toMatch(/insert into wordbook_items/iu);
    expect(seedSql).not.toMatch(/insert into saved_vocabularies/iu);
    expect(seedSql).toContain("'저장한 어휘'");
  });
});
