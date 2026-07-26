# Wave 3 병렬 구현·통합 설계

## 1. 목적과 기준선

Wave 3는 Wave 2까지 검증·병합된 local `main` 위에서 다음 세 기능을
동시에 구현한다.

- `content-production-foundation`
- `personal-recommendations`
- `vocabulary-relations-merge`

세 기능 브랜치는 같은 commit에서 시작하고 각 기능의 계약, 도메인,
DB adapter, API와 필요한 화면을 세로로 완성한다. package export,
application root, OpenAPI exact path, migration과 생성 route tree는 통합
담당자가 직렬로 조립한다.

## 2. 공통 제품 결정

### 2.1 선행 기준 변경

개인 추천의 신규 어휘 fallback은 실제 게시 시각을 사용해야 한다.
`vocabularies`에는 게시 시각이 없고 어휘 병합 브랜치도 같은 schema를
소유하므로, 세 브랜치를 만들기 전에 `published_at`과 게시·복구 시각
정책을 local `main`에 한 번만 추가한다.

- 최초 게시와 숨김 복구 시 `published_at = occurred_at`
- 숨김은 기존 게시 시각을 보존
- 기존 게시 어휘는 migration에서 `updated_at`으로 보수적으로 backfill
- 추천과 병합 브랜치는 이 공통 컬럼을 같은 기준선에서 소비

### 2.2 운영 기본값

기획에서 운영 중 조정 가능하다고 둔 값은 다음 결정적 기본값으로
시작한다.

- 개인 추천 활성화: 공개·유효한 서로 다른 의미 신호 5개
- 추천 결과: 문제 3개, 어휘 3개
- 저장한 문제·단어장 항목은 다시 학습할 의도가 있는 추천 신호로 포함
- 첫 오답은 개인 활성화 기준을 통과한 뒤에만 점수에 반영
- 의심 중복은 자동 병합 근거로 사용하지 않고 정규화 결과와 Unicode
  code point 거리만 관리자 비교 보조 정보로 제공
- 병합 source는 `DRAFT`, `HIDDEN`, `PUBLISHED`를 허용하고 대표 어휘는
  같은 kind의 `PUBLISHED`만 허용
- 콘텐츠 제작 작업 재시도는 최대 3회
- 입력 object 임시 보관은 기존 S3 30일 lifecycle을 유지

이 값은 코드 내부의 한 곳에서 상수로 관리하며 새 설정 시스템은 Wave 4
또는 Wave 6 범위를 앞당겨 만들지 않는다.

### 2.3 공통 금지 파일

기능 브랜치는 다음 파일을 커밋하지 않는다.

- `backend/database/drizzle/**`
- `backend/database/src/schema/index.ts`
- `backend/api/src/app.module.ts`
- `frontend/web/src/routeTree.gen.ts`
- root·workspace `package.json`, `pnpm-lock.yaml`
- 공용 CDK application 조립과 환경 변수 schema

기능별 package barrel은 독립 typecheck에 필요한 append-only export만
마지막 커밋에 모은다. 통합 담당자가 병합 뒤 충돌을 해결하고 migration,
OpenAPI, infra route와 seed를 순차 반영한다.

## 3. `content-production-foundation`

### 3.1 범위

이미 존재하지만 비활성화된 upload, job, SQS, Step Functions, worker
기반을 승인된 `content-production` 모듈 경계로 정리하고 활성화한다.
기존 동기 canonical JSON import는 그대로 유지하며 실제 AI, OCR, TTS
호출과 생성 결과 검토 UI는 포함하지 않는다.

### 3.2 상태와 불변 조건

- 입력: `PENDING -> VERIFIED | REJECTED`
- 작업: `QUEUED -> RUNNING -> COMPLETED | COMPLETED_WITH_FAILURES | FAILED`
- 항목: `PENDING -> PROCESSING -> SUCCEEDED | NEEDS_ATTENTION | FAILED`
- 생성 목적:
  - `VOCABULARY_EXTRACTION`
  - `QUESTION_GENERATION`
  - `VOCABULARY_THEN_QUESTION_GENERATION`
- 한 작업에는 같은 입력 타입만 여러 개 연결할 수 있다.
- 관리자와 `clientRequestId`가 같으면 같은 canonical 요청만 replay한다.
- 작업은 선택한 preset의 immutable snapshot을 보존한다.
- 한 항목 실패는 다음 항목 처리를 막지 않는다.
- stale attempt와 terminal 재전달은 상태를 다시 쓰지 않는다.
- retryable 실패 항목만 최대 3회 다시 queue에 넣는다.

### 3.3 공개 API

- `POST /api/v1/admin/content-production/uploads/policies`
- `POST /api/v1/admin/content-production/uploads/:uploadId/complete`
- `GET /api/v1/admin/content-production/presets`
- `POST /api/v1/admin/content-production/jobs`
- `GET /api/v1/admin/content-production/jobs`
- `GET /api/v1/admin/content-production/jobs/:jobId`
- `POST /api/v1/admin/content-production/jobs/:jobId/retry`

모든 경로는 ADMIN, 관리자 MFA, Zod 계약과 Swagger 보안·오류 metadata를
사용한다. storage key, provider 원문 응답과 입력 내용은 공개하지 않는다.

### 3.4 소유권

브랜치가 소유한다.

- `shared/contracts/src/content-production/**`
- `backend/domain/src/content-production/**`
- 기존 `jobs/**`, `uploads/**`의 얇은 호환 또는 경계 이동
- `backend/database/src/schema/jobs.schema.ts`
- content-production repository/query
- storage·queue provider adapter와 local fake
- `backend/api/src/content-production/**`
- `backend/worker/src/content-production/**`

통합 담당자는 root export, application 조립, worker bundle entry, HTTP API
route, migration과 기본 preset seed를 소유한다. Wave 6가 생성 콘솔을
소유하므로 이 브랜치는 프론트엔드 화면을 추가하지 않는다.

## 4. `personal-recommendations`

### 4.1 계산 경계

추천 결과를 저장하거나 숙련도 모델을 만들지 않는다. 전용 read query가
현재 원시 기록과 공개 상태를 요청 시 계산한다.

의미 신호 수는 다음 distinct 수의 합이다.

- 현재 공개·유효 문제를 푼 논리 문제
- 현재 공개 문제를 저장한 항목
- 현재 공개 어휘의 단어장 항목
- 현재 공개 어휘를 실제 답한 단어 연습 문항

legacy `saved_vocabularies`, hover, 음성 재생, 대본 공개와 무효 문제
기록은 사용하지 않는다.

### 4.2 점수와 이유

문제 점수:

- 저장한 동일 문제 `+40`
- 유효한 첫 오답 동일 문제 `+35`
- 연습 오답 어휘가 후보의 TARGET/REQUIRED에 등장 `+25`
- 첫 오답과 같은 문제 유형 `+20`
- 저장 문제의 TARGET/REQUIRED 어휘가 등장 `+10`
- 첫 답을 맞힌 동일 문제 `-15`

어휘 점수:

- 현재 단어장 항목 `+40`
- 단어 연습 오답 `+35`
- 첫 오답 문제의 TARGET/REQUIRED `+25`
- 저장 문제의 TARGET/REQUIRED `+15`

점수 내림차순, 게시 시각 내림차순, ID 오름차순으로 정렬하고 가장 높은
기여 신호 하나를 한국어 추천 이유로 공개한다. 활성화 전이거나 양수
후보가 없으면 최근 게시 문제·어휘를 `FALLBACK`으로 반환한다.

### 4.3 공개 API와 소유권

- `GET /api/v1/me/recommendations`

응답은 `PERSONALIZED | FALLBACK`, 의미 신호 수, 활성화 기준, 문제 3개,
어휘 3개와 reason code를 포함한다.

브랜치가 소유한다.

- `shared/contracts/src/recommendations/**`
- `backend/database/src/queries/drizzle-recommendation.query*`
- `backend/api/src/recommendations/**`
- `frontend/web/src/pages/learner-home/**`

기존 learning·question·vocabulary schema와 write repository는 수정하지
않는다. 통합 담당자가 root module, OpenAPI와 HTTP API route를 연결한다.

## 5. `vocabulary-relations-merge`

### 5.1 관계와 병합 모델

뜻 관계는 source/target meaning 사이에 다음을 저장한다.

- `SYNONYM | ANTONYM | RELATED`
- `DIRECTED | BIDIRECTIONAL`
- `PENDING | PASSED | FAILED`
- 생성·변경 시각

자기 관계와 BIDIRECTIONAL 역방향 중복을 금지한다. 학습자에게는
`PASSED` 관계만 노출한다.

병합된 source는 `MERGED`와 `mergedIntoVocabularyId`를 저장하고 새
병합 chain을 만들지 않는다. preview는 두 graph, 사용처 수, 정규화
비교, code point 거리와 opaque `mergeToken`을 반환한다. 실행은 같은
상태 fingerprint에서만 허용한다.

### 5.2 transaction 경계

`SERIALIZABLE` transaction에서 source와 대표를 UUID 순으로 잠그고
preview fingerprint를 다시 계산한다. 달라졌으면 아무 것도 이동하지
않고 `VOCABULARY_MERGE_CONFLICT`를 반환한다.

이동한다.

- meaning, pronunciation과 meaning-pronunciation 소유 어휘
- token/expression occurrence의 canonical 어휘
- legacy saved vocabulary와 wordbook item
- practice question의 canonical scalar FK

중복 membership은 가장 이른 저장 시각 하나로 합친다. practice의 모든
text/json snapshot과 answer, 신고 snapshot/history, import 결과,
기존 audit은 수정하지 않는다. 병합 결과와 이동 수는 전용 merge 기록과
일반 audit에 함께 남긴다.

### 5.3 공개 API와 소유권

- relation 생성·수정·삭제
- merge preview
- merge 실행
- 관리자·학습자 어휘 상세의 관계 projection

브랜치가 소유한다.

- vocabulary relation·merge domain과 repository/query
- `backend/database/src/schema/vocabulary.schema.ts`
- `shared/contracts/src/admin/vocabulary-relations.ts`
- 기존 관리자·학습자 vocabulary 상세 계약과 query의 최소 확장
- 기존 관리자 vocabulary 상세 안의 관계·비교·병합 feature
- 학습자 vocabulary 상세의 검증 관계 표시

별도 route를 만들지 않아 route tree 충돌을 피한다. composite FK의
deferred 변경과 migration은 통합 담당자가 실제 PostgreSQL에서
검증한다.

## 6. 병렬 실행과 통합 순서

1. local `main`에 어휘 게시 시각 기준 변경을 검증·병합한다.
2. 같은 SHA에서 세 branch와 worktree를 만든다.
3. 각 브랜치는 계약 실패 테스트부터 시작해 독립 검증을 통과한다.
4. `content-production-foundation`을 먼저 병합하고 비활성 기반을
   `content-production` root에 연결한다.
5. `vocabulary-relations-merge`를 병합하고 schema·deferred FK migration을
   생성한다.
6. `personal-recommendations`를 병합해 이미 존재하는 `published_at`을
   사용하도록 확인한다.
7. root export, OpenAPI, infra route, preset·추천·병합 seed와 route tree를
   한 번만 조립한다.
8. 빈 DB, Wave 2 DB upgrade, reset/seed, 병합 transaction과 동시성
   integration을 실제 PostgreSQL에서 검증한다.
9. `pnpm check`, Docker build와 관리자·학습자 브라우저 smoke를 수행한다.

## 7. Wave 3 완료 조건

- local fake로 세 입력 타입의 검증, 작업 생성, 항목 처리, 부분 실패와
  재시도를 비용 없이 검증할 수 있다.
- 기존 canonical JSON import는 그대로 동작한다.
- 신규 사용자는 최근 게시 fallback, 의미 신호 5개 이상 사용자는 이유가
  있는 개인 추천을 홈에서 본다.
- 숨김·무효·비공개 콘텐츠는 신호와 후보에서 제외된다.
- 관리자는 뜻 관계를 관리하고 stale preview 없이만 어휘를 병합한다.
- 병합은 live 참조를 원자적으로 옮기고 모든 과거 snapshot을 보존한다.
- 모든 활성 API가 계약과 OpenAPI 보안 metadata를 가진다.
- migration, 전체 품질 게이트, Docker와 브라우저 smoke가 통과한다.
