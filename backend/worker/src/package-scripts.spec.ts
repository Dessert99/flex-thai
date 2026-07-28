/** worker package의 표준 검증 명령이 repository Vitest 설정을 가리키는지 검증한다 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  scripts?: Record<string, string>;
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

  it('Wave 5 content·TTS·relay·GC entrypoint를 Lambda bundle에 포함한다', () => {
    const buildConfig = readFileSync(
      new URL('../esbuild.config.mjs', import.meta.url),
      'utf8',
    );

    expect(buildConfig).toContain("'content-production-task'");
    expect(buildConfig).toContain("'tts-task'");
    expect(buildConfig).toContain("'async-dispatch-relay-task'");
    expect(buildConfig).toContain("'tts-audio-gc-task'");
  });
});
