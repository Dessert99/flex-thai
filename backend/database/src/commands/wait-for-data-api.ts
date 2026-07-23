/** 운영 migration 전에 0 ACU Aurora가 Data API 요청을 받을 때까지 기다린다 */
import {
  ExecuteStatementCommand,
  RDSDataClient,
} from '@aws-sdk/client-rds-data';

import { waitForDataApi } from '../operations/wait-for-data-api.js';

const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 5_000;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const resourceArn = requireEnv('RDS_RESOURCE_ARN');
const secretArn = requireEnv('RDS_SECRET_ARN');
const database = requireEnv('DATABASE_NAME');
const region = requireEnv('AWS_REGION');
const client = new RDSDataClient({ region });

await waitForDataApi({
  maxAttempts: MAX_ATTEMPTS,
  probe: async () => {
    await client.send(
      new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: 'select 1',
      }),
    );
  },
  sleep: () =>
    new Promise((resolve) => {
      setTimeout(resolve, RETRY_DELAY_MS);
    }),
  onRetry: (attempt) => {
    console.info(`Aurora Data API 재개 대기 중 (${attempt}/${MAX_ATTEMPTS})`);
  },
});

console.info('Aurora Data API 준비 완료');
