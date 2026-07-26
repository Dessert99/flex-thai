# Wave 1 isolated database verification

두 개의 비어 있는 격리 PostgreSQL database URL을 각각 `EMPTY_DATABASE_URL`, `LEGACY_DATABASE_URL`로 준비한다. 운영·공용 개발 DB에는 실행하지 않는다.

## 빈 DB 순차 migration과 seed

```sh
DATABASE_URL="$EMPTY_DATABASE_URL" pnpm --filter @flex-thia/database db:migrate:local
psql "$EMPTY_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/seed/local.sql
```

## 0006 legacy 상태에서 upgrade

```sh
for migration in backend/database/drizzle/000{0..6}_*.sql; do psql "$LEGACY_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"; done
psql "$LEGACY_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/test-fixtures/wave1-legacy-saved-vocabulary.sql
psql "$LEGACY_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/drizzle/0007_wave1-identity-challenge.sql
psql "$LEGACY_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/drizzle/0008_wave1-thai-interactions.sql
psql "$LEGACY_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/drizzle/0009_wave1-wordbooks.sql
psql "$LEGACY_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/test-fixtures/wave1-wordbook-backfill-verification.sql
```

모든 명령이 종료 코드 0이어야 하며 마지막 SQL은 legacy 2개 row의 `saved_at`이 정확히 보존되지 않으면 실패한다.
