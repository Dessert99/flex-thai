/** 최초 관리자 지정 입력을 exact Cognito sub 하나로 제한한다 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { AdminBootstrapRepository } from '@flex-thia/domain';
import {
  createDataApiDatabase,
  createLocalDatabase,
  DrizzleAdminBootstrapRepository,
} from '@flex-thia/database';

/** 이메일·+tag·복수 인자를 거부하고 --sub 값만 추출한다 */
export const parseBootstrapAdminArgs = (
  args: string[],
): { subject: string } => {
  if (
    args.length !== 1 ||
    !args[0]?.startsWith('--sub=') ||
    args[0].slice('--sub='.length).length === 0
  ) {
    throw new Error('bootstrap-admin은 --sub 하나만 받습니다');
  }

  return { subject: args[0].slice('--sub='.length) };
};

/** exact sub의 role 변경과 SYSTEM_BOOTSTRAP audit을 repository에 위임한다 */
export const bootstrapAdmin = (
  args: string[],
  repository: AdminBootstrapRepository,
  requestId: string,
): Promise<void> => {
  const { subject } = parseBootstrapAdminArgs(args);
  return repository.bootstrapAdmin(subject, requestId);
};

const requireEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} 환경 변수가 필요합니다`);
  }

  return value;
};

const main = async (): Promise<void> => {
  const database =
    process.env.DATABASE_MODE === 'data-api'
      ? createDataApiDatabase({
          region: requireEnv('AWS_REGION'),
          database: requireEnv('DATABASE_NAME'),
          resourceArn: requireEnv('RDS_RESOURCE_ARN'),
          secretArn: requireEnv('RDS_SECRET_ARN'),
        })
      : createLocalDatabase(
          process.env.DATABASE_URL ??
            'postgres://flex_thia:local_only_password@localhost:5432/flex_thia',
        );
  const repository = new DrizzleAdminBootstrapRepository(database);
  await bootstrapAdmin(process.argv.slice(2), repository, randomUUID());
};

const entryPath = process.argv[1];

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
