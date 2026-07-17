/** worker Lambda entrypoint를 Node.js 22 ESM bundle로 만든다 */
import { build } from 'esbuild';

/** SQS starter, task, Cognito trigger bundle을 함께 생성하는 설정 */
export default await build({
  entryPoints: {
    'job-starter': 'src/job-starter.ts',
    'foundation-task': 'src/foundation-task.ts',
    'define-auth-challenge': 'src/auth/define-auth-challenge.ts',
    'create-auth-challenge': 'src/auth/create-auth-challenge.ts',
    'verify-auth-challenge': 'src/auth/verify-auth-challenge.ts',
  },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  external: ['@aws-sdk/*'],
});
