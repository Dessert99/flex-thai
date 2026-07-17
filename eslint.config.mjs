/** TypeScript 소스의 정적 오류와 생성물 제외 경계를 한곳에서 관리한다 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.ts'];

/** 타입 정보를 사용하는 저장소 공통 ESLint 설정 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/cdk.out/**',
      'packages/database/drizzle/**',
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
);
