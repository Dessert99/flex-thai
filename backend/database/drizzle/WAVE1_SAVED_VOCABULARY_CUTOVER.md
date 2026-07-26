# Wave 1 saved vocabulary cutover gate

`0007_wave1-data-integration.sql`은 기존 `saved_vocabularies`를 유지한 채 사용자별 `저장한 어휘` 단어장으로 복사한다. 이 migration의 backfill 검증은 migration 실행 시점의 row만 보장하므로 endpoint cutover는 아래 release gate를 모두 통과한 뒤 수행한다.

1. 기존 saved-vocabulary endpoint와 worker의 write quiescence를 시작하고 `saved_vocabularies` 신규 쓰기가 없음을 확인한다.
2. migration 이후 발생한 legacy row가 있다면 같은 `saved_at`을 보존하는 catch-up insert를 실행한다.
3. migration의 검증 SQL을 다시 실행해 legacy row count와 migrated item count가 같고 `missing_item_count = 0`인지 확인한다.
4. 검증 transaction이 성공한 뒤에만 public saved/list와 write endpoint cutover를 배포한다.
5. cutover 관찰 기간에는 `saved_vocabularies`를 보존하며 rollback 시 legacy endpoint를 다시 활성화한다.
