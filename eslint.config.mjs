/** TypeScript 소스의 정적 오류와 생성물 제외 경계를 한곳에서 관리한다 */
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { semanticTailwindTokensRule } from './scripts/eslint-rules/semantic-tailwind-tokens.mjs';

const typescriptFiles = ['**/*.{ts,tsx}'];
const frontendFiles = ['frontend/web/src/**/*.{ts,tsx}'];
const generatedFrontendFiles = [
  'frontend/web/src/routeTree.gen.ts',
  'frontend/web/src/shared/ui/*.{ts,tsx}',
];

/** 타입 정보를 사용하는 저장소 공통 ESLint 설정 */
export default tseslint.config(
  {
    ignores: [
      '.superpowers/**',
      '.worktrees/**',
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/cdk.out/**',
      'backend/database/drizzle/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs}'],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: frontendFiles,
    ignores: generatedFrontendFiles,
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: frontendFiles,
    ignores: generatedFrontendFiles,
  },
  {
    files: frontendFiles,
    ignores: generatedFrontendFiles,
    plugins: {
      local: {
        rules: {
          'semantic-tailwind-tokens': semanticTailwindTokensRule,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      complexity: ['error', 10],
      'local/semantic-tailwind-tokens': 'error',
      'max-depth': ['error', 3],
      'max-lines': [
        'error',
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-lines-per-function': [
        'error',
        {
          IIFEs: true,
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'no-nested-ternary': 'error',
      'no-restricted-syntax': [
        'error',
        {
          message: '프로젝트 작성 프론트엔드 소스는 named export를 사용하세요.',
          selector: 'ExportDefaultDeclaration',
        },
        {
          message: 'enum 대신 const object와 union type을 사용하세요.',
          selector: 'TSEnumDeclaration',
        },
      ],
      'no-useless-catch': 'error',
    },
  },
);
