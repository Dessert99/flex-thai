/** worker Lambda entrypoint를 Node.js 22 ESM bundle로 만든다 */
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

/** async job·콘텐츠 제작·relay Lambda bundle을 함께 생성하는 설정 */
export default await build({
  entryPoints: {
    'job-starter': 'src/job-starter.ts',
    'content-production-task': 'src/content-production-task.ts',
    'content-production-failure-marker':
      'src/content-production-failure-marker.ts',
    'async-dispatch-relay-task': 'src/dispatch/async-dispatch-relay-task.ts',
  },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  external: ['@aws-sdk/*'],
});
