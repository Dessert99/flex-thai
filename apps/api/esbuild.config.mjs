/** API Lambda entrypoint를 Node.js 22 ESM bundle로 만든다 */
import { build } from 'esbuild';

/** NestJS Lambda handler bundle을 dist/lambda.js에 생성한다 */
export default await build({
  entryPoints: ['src/lambda.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/lambda.js',
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
