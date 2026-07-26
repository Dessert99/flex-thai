# Wave 1 saved vocabulary cutover gate

`0009_wave1-wordbooks.sql`은 migration 실행 시점의 legacy `saved_vocabularies`를 사용자별 `저장한 어휘` 단어장으로 복사한다. endpoint cutover 직전에는 아래 명령이 legacy table을 `ACCESS EXCLUSIVE`로 잠그고, 쓰기 차단 trigger 설치·catch-up·`saved_at` 검증을 한 transaction에서 수행한다.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/drizzle/operations/wave1-saved-vocabulary-cutover.sql
```

1. 명령이 commit되면 `legacy_saved_count = migrated_item_count`, `missing_item_count = 0`이며 이후 legacy write는 trigger가 거부한다.
2. 그 다음 public saved-vocabulary endpoint를 새 wordbook endpoint로 cutover한다.
3. 관찰 기간에는 `saved_vocabularies`와 쓰기 차단 trigger를 유지한다.
4. rollback은 legacy endpoint 코드를 먼저 배포한 뒤 아래 명령으로 legacy write를 재개한다.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/database/drizzle/operations/wave1-resume-legacy-saved-vocabulary-writes.sql
```
