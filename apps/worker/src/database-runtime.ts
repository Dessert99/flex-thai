/** Lambda worker가 Aurora Data API Drizzle client를 지연 생성하게 한다 */
import {
  createDataApiDatabase,
  createLocalDatabase,
  DrizzleJobRepository,
} from '@flex-thia/database';

const requireEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} 환경 변수가 필요합니다`);
  }

  return value;
};

/** local과 Lambda 환경에 맞는 Drizzle database를 생성한다 */
export const createWorkerDatabase = (): ConstructorParameters<
  typeof DrizzleJobRepository
>[0] =>
  process.env.DATABASE_MODE === 'local'
    ? createLocalDatabase(requireEnv('DATABASE_URL'))
    : createDataApiDatabase({
        region: requireEnv('AWS_REGION'),
        database: requireEnv('DATABASE_NAME'),
        resourceArn: requireEnv('RDS_RESOURCE_ARN'),
        secretArn: requireEnv('RDS_SECRET_ARN'),
      });

/** worker runtime이 공유하는 필수 환경 변수 reader */
export const readWorkerEnv = requireEnv;
