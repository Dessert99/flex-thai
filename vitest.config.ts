/** Node 기반 단위 테스트의 수집 범위와 실행 환경을 통일한다 */
import { defineConfig } from 'vitest/config';

/** 브라우저·API 통합 E2E를 제외한 저장소 공통 Vitest 설정 */
export default defineConfig({
  test: {
    environment: 'node',
    // CDK 테스트의 동시 Lambda 번들링이 5초 제한을 넘기지 않게 파일을 직렬 실행
    fileParallelism: false,
    include: [
      'backend/**/src/**/*.spec.ts',
      'frontend/**/src/**/*.spec.ts',
      'shared/**/src/**/*.spec.ts',
      'infra/test/**/*.spec.ts',
    ],
  },
});
