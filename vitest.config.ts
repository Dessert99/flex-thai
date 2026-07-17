/** Node 기반 단위 테스트의 수집 범위와 실행 환경을 통일한다 */
import { defineConfig } from 'vitest/config';

/** 브라우저·API 통합 E2E를 제외한 저장소 공통 Vitest 설정 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/**/src/**/*.spec.ts',
      'packages/**/src/**/*.spec.ts',
      'infra/test/**/*.spec.ts',
    ],
  },
});
