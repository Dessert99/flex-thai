/** Lambda가 TCP 연결 없이 Aurora를 호출할 Drizzle client를 만든다 */
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import * as schema from '../schema/index.js';

/** Aurora Data API 연결 정보 */
export interface DataApiDatabaseConfig {
  region: string;
  database: string;
  resourceArn: string;
  secretArn: string;
}

/** Lambda에서 TCP 연결 없이 Aurora를 호출하는 Drizzle client */
export const createDataApiDatabase = (config: DataApiDatabaseConfig) =>
  drizzle(new RDSDataClient({ region: config.region }), {
    database: config.database,
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    schema,
  });
