/** API Lambda entrypoint를 Node.js 22 ESM bundle로 만든다 */
import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

// 같은 handler 이름의 오래된 .js가 Lambda에서 먼저 선택되지 않게 산출물을 비운다.
await rm('dist', { recursive: true, force: true });

/** NestJS Lambda handler bundle을 dist/lambda.mjs에 생성한다 */
export default await build({
  entryPoints: ['src/lambda.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/lambda.mjs',
  sourcemap: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  external: [
    '@aws-sdk/*',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    'class-transformer',
    'class-validator',
  ],
});
