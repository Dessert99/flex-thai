/** 운영 migration이 현재 package의 runtime command를 사용하는지 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface DatabasePackageJson {
  scripts: Record<string, string>;
}

describe('운영 Data API migration command', () => {
  it('Drizzle Kit CLI 대신 package의 runtime command를 실행한다', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as DatabasePackageJson;

    expect(packageJson.scripts['db:migrate:data-api']).toBe(
      'tsx src/commands/migrate-data-api.ts',
    );
  });
});
