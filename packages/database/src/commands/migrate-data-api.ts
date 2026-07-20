/** 현재 AWS SDK와 Drizzle ORM으로 운영 Aurora migration을 실행한다 */
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';

import { runDataApiMigration } from '../operations/run-data-api-migration.js';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const resourceArn = requireEnv('RDS_RESOURCE_ARN');
const secretArn = requireEnv('RDS_SECRET_ARN');
const database = requireEnv('DATABASE_NAME');
const region = requireEnv('AWS_REGION');
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);
const client = new RDSDataClient({ region });
const db = drizzle(client, {
  database,
  resourceArn,
  secretArn,
  logger: {
    logQuery(query) {
      console.info(`[migration SQL]\n${query}`);
    },
  },
});

try {
  await runDataApiMigration({
    migrate: () => migrate(db, { migrationsFolder }),
    destroy: () => {
      client.destroy();
    },
    onSuccess: () => {
      console.info('운영 Data API migration 완료');
    },
    onError: (error) => {
      console.error('운영 Data API migration 실패:', error);
    },
  });
} catch {
  process.exitCode = 1;
}
