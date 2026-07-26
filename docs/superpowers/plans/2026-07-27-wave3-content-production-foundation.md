# Wave 3 Content Production Foundation 구현 계획

1. content-production 계약에 입력·목적·preset snapshot·작업 목록/상세·재시도를 정의하고 실패 테스트를 작성한다.
2. 기존 jobs/uploads 도메인을 content-production 경계로 옮기고 혼합 입력, 멱등 충돌, 항목 상태, retry 한도 테스트를 통과시킨다.
3. 기존 jobs schema를 preset snapshot·항목 attempt·집계 불변 조건으로 확장하고 repository 동시성 테스트를 작성한다.
4. S3·SQS adapter와 local fake를 새 port에 맞추며 기존 검증 정책을 보존한다.
5. worker dispatcher가 입력별 항목을 멱등 생성하고 부분 실패 후 최종 상태를 집계하게 한다.
6. ADMIN+MFA Controller와 service를 구현하되 root module, migration, infra route는 수정하지 않는다.
7. 기능 테스트, lint, typecheck와 worker build를 통과하고 조립 export만 마지막 커밋에 모은다.

검증 기준은 혼합 입력 거절, 같은 요청 replay, 다른 body 충돌, stale
attempt no-op, 부분 실패 계속 처리, retryable만 최대 3회 재시도, provider
비공개와 기존 canonical import 회귀 없음이다.
