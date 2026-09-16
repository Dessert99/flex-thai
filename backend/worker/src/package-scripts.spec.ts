/** worker package의 표준 검증 명령이 repository Vitest 설정을 가리키는지 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('worker package 스크립트', () => {
  it('package 디렉터리에서 표준 test 명령을 실행할 수 있다', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest;

    expect(manifest.scripts?.test).toBe(
      'vitest run --root ../.. backend/worker/src',
    );
  });

  it('compose local worker가 실행하는 tsx를 worker package가 직접 선언한다', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest;
    const compose = readFileSync(
      new URL('../../../compose.yaml', import.meta.url),
      'utf8',
    );

    expect(manifest.devDependencies?.tsx).toBe('^4.20.0');
    expect(compose).toMatch(
      /--filter\s*\n\s*- '@flex-thia\/worker'\s*\n\s*- exec\s*\n\s*- tsx\s*\n\s*- src\/local-worker\.ts/u,
    );
  });
});
