/** ESLint가 로컬 도구 산출물을 저장소 소스로 분석하지 않는지 검증한다 */
import { describe, expect, it } from 'vitest';
import eslintConfig from '../eslint.config.mjs';

describe('ESLint 제외 경계', () => {
  it('worktree와 리뷰 도구 산출물을 전체 lint에서 제외한다', () => {
    const ignoredPatterns = eslintConfig.flatMap((config) =>
      'ignores' in config && Array.isArray(config.ignores)
        ? config.ignores
        : [],
    );

    expect(ignoredPatterns).toEqual(
      expect.arrayContaining(['.superpowers/**', '.worktrees/**']),
    );
  });
});
