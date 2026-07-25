/** 로컬 전용 DB reset·migration·seed 실행 경계를 제공한다 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

type LocalResetOptions = {
  databaseUrl: string;
  confirmation?: string | undefined;
};

/** 파괴적인 reset이 명시적으로 승인된 경우에만 실행을 계속한다 */
export const assertLocalResetAllowed = ({
  databaseUrl,
  confirmation,
}: LocalResetOptions): void => {
  if (confirmation !== 'true') {
    throw new Error('LOCAL_DATABASE_RESET=true가 필요합니다');
  }

  const target = new URL(databaseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres']);
  if (
    target.protocol !== 'postgres:' ||
    !localHosts.has(target.hostname) ||
    target.username !== 'flex_thia' ||
    target.pathname !== '/flex_thia'
  ) {
    throw new Error('로컬 flex_thia DB만 reset할 수 있습니다');
  }
};

const resetAndSeedLocalDatabase = async (
  databaseUrl: string,
): Promise<void> => {
  const pool = new Pool({ connectionString: databaseUrl });
  const migrationsFolder = fileURLToPath(
    new URL('../../drizzle', import.meta.url),
  );
  const seedSql = await readFile(
    new URL('../../seed/local.sql', import.meta.url),
    'utf8',
  );

  try {
    // migration 이력까지 지워 매 실행을 같은 빈 DB에서 시작한다.
    await pool.query(
      'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
    );
    await migrate(drizzle(pool), { migrationsFolder });
    await pool.query(seedSql);
  } finally {
    await pool.end();
  }
};

const main = async (): Promise<void> => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgres://flex_thia:local_only_password@localhost:5432/flex_thia';
  assertLocalResetAllowed({
    confirmation: process.env.LOCAL_DATABASE_RESET,
    databaseUrl,
  });
  await resetAndSeedLocalDatabase(databaseUrl);
  console.log('로컬 DB migration과 기본 seed를 완료했습니다.');
};

const entryPath = process.argv[1];

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
