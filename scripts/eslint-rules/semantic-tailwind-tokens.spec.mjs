/** semantic Tailwind 토큰 ESLint 규칙의 허용·금지 경계를 검증한다 */
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { semanticTailwindTokensRule } from './semantic-tailwind-tokens.mjs';

const linter = new Linter({ configType: 'flat' });

function verify(source) {
  return linter.verify(source, {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      local: {
        rules: {
          'semantic-tailwind-tokens': semanticTailwindTokensRule,
        },
      },
    },
    rules: {
      'local/semantic-tailwind-tokens': 'error',
    },
  });
}

describe('semantic Tailwind 토큰 규칙', () => {
  it.each([
    'bg-red-500',
    'text-[#fff]',
    'p-4',
    'text-sm',
    'rounded-md',
    'size-4',
    'shadow-lg',
    'duration-200',
  ])('%s 비시맨틱 값을 거부한다', (className) => {
    expect(verify(`const className = '${className}';`)).toHaveLength(1);
  });

  it('정의된 시맨틱 값을 허용한다', () => {
    const source =
      "const className = 'bg-surface text-primary p-page text-body rounded-control size-icon shadow-overlay duration-feedback';";

    expect(verify(source)).toHaveLength(0);
  });

  it('구조와 키워드 크기 클래스를 허용한다', () => {
    const source =
      "const className = 'grid md:grid-cols-2 overflow-auto sticky w-full min-h-screen';";

    expect(verify(source)).toHaveLength(0);
  });

  it('숫자 시각 척도를 계속 거부한다', () => {
    const source = "const className = 'gap-4 w-12 h-10';";

    expect(verify(source)).toHaveLength(3);
  });

  it('템플릿 리터럴의 비시맨틱 값을 거부한다', () => {
    const source =
      "const className = `grid ${active ? 'bg-surface' : ''} p-4`;";

    expect(verify(source)).toHaveLength(1);
  });
});
