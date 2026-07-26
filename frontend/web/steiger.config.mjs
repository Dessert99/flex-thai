/** TypeScript 7과 호환되는 ESM으로 웹 FSD 경계를 정의한다 */
import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

/** 권장 FSD 규칙과 slice 내부 import locality를 적용한다 */
export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      'fsd/import-locality': 'error',
    },
  },
  {
    files: ['src/app/providers/**'],
    rules: {
      'fsd/segments-by-purpose': 'off',
    },
  },
  {
    files: [
      'src/features/change-question-state/**',
      'src/features/change-vocabulary-state/**',
      'src/features/explore-thai-content/**',
      'src/features/submit-answer/**',
      'src/features/toggle-saved-question/**',
      'src/features/toggle-saved-vocabulary/**',
      'src/features/upload-audio/**',
      'src/features/manage-wordbook/**',
      'src/features/manage-wordbook-items/**',
      'src/features/save-vocabulary-to-wordbooks/**',
    ],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
  {
    files: ['src/pages/wordbook-detail/**', 'src/pages/wordbook-list/**'],
    rules: {
      // 통합 Task 15에서 old saved-vocabularies page 제거와 함께 삭제한다.
      'fsd/excessive-slicing': 'off',
    },
  },
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'src/routeTree.gen.ts',
      'src/shared/ui/*.{ts,tsx}',
    ],
  },
]);
