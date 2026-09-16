/** 로컬 PostgreSQL용 Drizzle client 생성을 캡슐화한다 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { databaseSchema as schema } from '../schema/databaseSchema.js';

/** 로컬 Docker PostgreSQL용 Drizzle client */
export const createLocalDatabase = (databaseUrl: string) => {
  const client = new Pool({ connectionString: databaseUrl });
  return drizzle({ client, schema });
};
