/** Aurora Data API migration이 운영 schema와 secret 경계를 공유하게 한다 */
import { defineConfig } from 'drizzle-kit';

const requireEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} 환경 변수가 필요합니다`);
  }

  return value;
};

/** Aurora Data API용 Drizzle Kit 설정 */
export default defineConfig({
  dialect: 'postgresql',
  driver: 'aws-data-api',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    database: requireEnv('DATABASE_NAME'),
    resourceArn: requireEnv('RDS_RESOURCE_ARN'),
    secretArn: requireEnv('RDS_SECRET_ARN'),
  },
});
