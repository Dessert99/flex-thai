/** API Lambda 배포 번들의 ESM 파일 형식을 고정한다 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('API Lambda 배포 번들', () => {
  it('ESM handler를 .mjs로 만들고 모호한 .js handler를 남기지 않는다', () => {
    expect(existsSync(new URL('../dist/lambda.mjs', import.meta.url))).toBe(
      true,
    );
    expect(existsSync(new URL('../dist/lambda.js', import.meta.url))).toBe(
      false,
    );
  });
});
