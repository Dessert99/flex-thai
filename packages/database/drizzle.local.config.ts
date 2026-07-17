/** 로컬 PostgreSQL migration이 동일한 schema와 접속 정보를 사용하게 한다 */
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 필요합니다');
}

/** 로컬 Docker PostgreSQL용 Drizzle Kit 설정 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
});
