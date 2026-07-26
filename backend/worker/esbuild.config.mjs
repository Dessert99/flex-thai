/** worker Lambda entrypoint를 Node.js 22 ESM bundle로 만든다 */
import { build } from 'esbuild';

/** SQS starter와 콘텐츠 제작 task Lambda bundle을 함께 생성하는 설정 */
export default await build({
  entryPoints: {
    'job-starter': 'src/job-starter.ts',
    'content-production-task': 'src/content-production-task.ts',
    'content-production-failure-marker':
      'src/content-production-failure-marker.ts',
  },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  external: ['@aws-sdk/*'],
});
