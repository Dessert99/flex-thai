/** 프론트엔드 개발 서버와 production bundle의 Vite 구성을 정의한다 */
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { defineConfig } from 'vite';

/** React·Tailwind plugin과 프론트엔드 source alias를 연결한다 */
export default defineConfig({
  plugins: [
    tanstackRouter({
      generatedRouteTree: './src/routeTree.gen.ts',
      routesDirectory: './src/app/routes',
      target: 'react',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        changeOrigin: true,
        // 브라우저 bundle에 개발 신원을 넣지 않고 로컬 API Gateway claim만 흉내 낸다.
        headers: { 'X-Dev-User-Sub': 'local-admin-sub' },
        target: 'http://localhost:3000',
      },
    },
  },
});
