/** 로컬 DB의 미적용 migration을 파일별 트랜잭션으로 적용한다 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { migrateLocalDatabase } from '../operations/migrate-local-database.js';

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://flex_thia:local_only_password@localhost:5432/flex_thia',
  });
  const migrationsFolder = fileURLToPath(
    new URL('../../drizzle', import.meta.url),
  );
  void (async () => {
    try {
      await migrateLocalDatabase(pool, migrationsFolder);
      console.log('로컬 DB migration을 완료했습니다.');
    } finally {
      await pool.end();
    }
  })().catch((error: unknown) => {
    console.error('로컬 DB migration에 실패했습니다.', error);
    process.exitCode = 1;
  });
}
