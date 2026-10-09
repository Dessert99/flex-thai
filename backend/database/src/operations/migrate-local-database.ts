/** enum 변경이 다음 migration에서 사용될 수 있도록 파일마다 commit한다 */
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Pool } from 'pg';

export async function migrateLocalDatabase(
  pool: Pool,
  migrationsFolder: string,
): Promise<void> {
  await pool.query('create schema if not exists drizzle');
  await pool.query(`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  const { rows } = await pool.query<{ created_at: string | null }>(
    'select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1',
  );
  let lastCreatedAt = Number(rows[0]?.created_at ?? 0);

  for (const migration of readMigrationFiles({ migrationsFolder })) {
    if (lastCreatedAt >= migration.folderMillis) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const statement of migration.sql) {
        await client.query(statement);
      }
      await client.query(
        'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
        [migration.hash, migration.folderMillis],
      );
      await client.query('commit');
      lastCreatedAt = migration.folderMillis;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
