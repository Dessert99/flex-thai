/** 웹 단위·컴포넌트 테스트의 브라우저 환경과 공통 설정을 정의한다 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/** 웹 소스 alias와 jsdom 테스트 경계를 제공하는 Vitest 설정 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/shared/test/setupTests.ts'],
    coverage: {
      // 선언형 file-route 접착부는 routeReachability에서 typed 경로 조립으로 검증한다
      exclude: [
        'src/app/routes/_authenticated*.tsx',
        'src/app/routes/forbidden.tsx',
        'src/app/routes/index.tsx',
        'src/app/routes/login*.tsx',
      ],
      provider: 'v8',
      reporter: ['text'],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
