# Wave 5 문제 생성·TTS·학습자 탐색 병렬 전달 설계

## 1. 기준과 목표

Wave 5는 로컬 `main`의 `e98cba6`을 공통 기준으로 삼아 다음 세 기능을
독립 worktree에서 구현한다.

1. `ai-question-production`
2. `automated-tts`
3. `learner-question-discovery`

이 Wave의 목적은 문제 생성과 필수 음성 준비를 실제 도메인·저장소·worker
수준까지 완성하고, Wave 4에서 추가한 문제 분류 체계를 학습자 문제 탐색에
연결하는 것이다. 외부 AI·OCR·TTS 공급자와 유료 SDK는 별도 승인 전까지
연결하지 않는다. Phase A는 provider-independent port, deterministic fake,
실제 PostgreSQL persistence와 게시 차단까지 완성한다.

Wave 6는 이 Wave에서 고정한 API를 소비해 생성·검증, TTS, 사용량·비용
관리자 콘솔을 구현한다. Wave 7은 production web 배포, 로컬 원클릭 실행,
전체 PostgreSQL CI, 접근성·성능과 최종 수동 테스트 환경을 마무리한다.

## 2. 공통 실행 원칙

### 2.1 브랜치와 통합

- 세 기능 브랜치는 같은 `main` SHA에서 시작한다.
- 기능 브랜치끼리 merge하지 않는다.
- 각 브랜치는 자신의 leaf module과 테스트만 수정한다.
- 통합 브랜치는 세 기능 commit을 merge한 뒤 공용 조립과 하나의 Wave 5
  migration만 만든다.
- 원격 push와 PR은 하지 않는다.
- 기능별 코드 리뷰와 통합 리뷰에서 Critical·Important 지적을 닫은 뒤
  `main`에 로컬 merge한다.

예상 통합 순서는 schema와 게시 규칙에 영향을 주는
`ai-question-production`, media 준비 상태를 연결하는 `automated-tts`,
read path만 바꾸는 `learner-question-discovery` 순이다.

### 2.2 통합 브랜치 전용 파일

기능 브랜치는 다음 공용 파일을 수정하지 않는다.

- `backend/database/src/schema/index.ts`
- `backend/database/drizzle/**`
- `backend/domain/src/index.ts`
- `backend/database/src/index.ts`
- `backend/providers/src/index.ts`
- `backend/worker/src/index.ts`
- `backend/api/src/app.module.ts`
- `backend/api/src/openapi/**`
- `infra/src/constructs/http-api.ts`
- `infra/src/constructs/async-jobs.ts`
- `shared/contracts/src/index.ts`
- `frontend/web/src/routeTree.gen.ts`
- 루트 `package.json`, `pnpm-lock.yaml`, `compose.yaml`

기능 브랜치가 package 경계 typecheck에 필요한 export를 추가해야 할 때는
기능별 leaf `index.ts`까지만 수정한다. 공용 barrel, runtime DI, queue
registration, OpenAPI 경로, 인프라 route, migration journal과 local seed는
통합 브랜치가 한 번만 수정한다.

### 2.3 자원 관리

- Docker는 통합 PostgreSQL 검증과 최종 로컬 smoke 때만 실행한다.
- DB 검증은 하나의 컨테이너 가동 창에서 순차 실행한다.
- 검증 직후 `docker compose down`으로 컨테이너와 네트워크를 내리며
  volume은 삭제하지 않는다.
- 각 검증 묶음 뒤 `dist`, `coverage`, `.vite`, `cdk.out`만 제거한다.
- `node_modules`, pnpm store와 PostgreSQL volume은 유지한다.
- `main` 통합과 재검증이 끝난 worktree와 로컬 feature branch는 제거한다.

## 3. `ai-question-production`

### 3.1 소유 경계

이 브랜치는 다음 leaf 경계를 소유한다.

- `backend/domain/src/content-production/ai-question-production*`
- `backend/database/src/schema/ai-question-production.schema*`
- `backend/database/src/repositories/content-production/`
  `drizzle-ai-question-production.repository*`
- `backend/database/src/queries/drizzle-question-production-context*`
- `backend/providers/src/fakes/fake-question-*`
- `backend/worker/src/content-production/ai-question-production.processor*`
- `backend/api/src/content-production/question-production-*`
- `shared/contracts/src/content-production/question-production*`

기존 공용 dispatcher, Wave 4 어휘 processor와 TTS/media leaf는 수정하지
않는다. dispatcher의 operation 조립은 통합 브랜치가 담당한다.

### 3.2 생성 입력과 prompt

문제 생성 입력은 immutable preset snapshot과 다음 자료를 조합한다.

- 활성 문제 유형 버전의 구조와 출제 규칙
- 난이도 기준 1~5
- 유형별 canonical 승인 예시 한 개 이상
- 목표·필수·제외 어휘
- 신규 보조 어휘 한도
- 유사한 기존 게시 문제의 제한된 요약
- canonical 문제 출력 schema
- 관리자의 한국어 추가 지시

활성 유형 버전에 난이도 기준이나 승인 예시가 없으면 외부 provider를
호출하지 않고 `QUESTION_TAXONOMY_INCOMPLETE`로 실패한다. 입력 자료의
문장을 그대로 복제하지 않으며 provider에는 private storage key나 사용자
인증 정보를 전달하지 않는다.

### 3.3 port

도메인 경계는 다음 port를 사용한다.

- `QuestionProductionContextRepository`
- `QuestionGenerationProvider`
- `QuestionCrossValidationProvider`
- `QuestionSimilarityLookup`
- `QuestionProductionProviderRunRepository`
- `QuestionProductionCandidateRepository`
- `GeneratedQuestionDraftRepository`

생성 모델과 교차 검증 모델은 서로 다른 model ID여야 한다. 같은 provider를
사용할 수 있지만 같은 model ID 구성은 작업 시작 전에 거절한다.

### 3.4 후보와 검증

후보는 canonical 문제 graph와 다음 상태를 별도로 저장한다.

- 결과 그룹: `NORMAL`, `NEEDS_ATTENTION`, `FAILED`
- 검토 상태: `PENDING`, `APPROVED`, `DISCARDED`
- 검증 단계:
  `SCHEMA`, `DECISION_RULE`, `SIMILARITY`, `AI_CROSS_VALIDATION`
- 검증 결과: `PASSED`, `FAILED`

검증은 다음을 포함한다.

- 필수 field와 정확한 출력 schema
- 태국어 문장과 token offset
- 문제 유형별 block·option 구조
- 정답과 해설 정합성
- 목표·필수·제외 어휘 규칙
- 신규 보조 어휘 한도
- 기존 게시 문제와의 유사도
- 독립 AI 교차 검증

schema 또는 결정 규칙 실패는 `FAILED`, 유사도 경고나 교차 검증의
검토 가능 실패는 `NEEDS_ATTENTION`으로 보존한다. 후보 하나의 실패가 같은
item의 다른 정상 후보를 버리지 않는다. 후보가 하나도 없으면 성공으로
숨기지 않고 `NO_QUESTION_CANDIDATES`를 기록한다.

### 3.5 승인·폐기·재생성

- `NORMAL`이며 모든 필수 검증을 통과한 `PENDING` 후보만 승인할 수 있다.
- 승인은 자동 게시가 아니라 새 논리 문제와 `DRAFT` 버전을 만든다.
- 생성 DRAFT의 문장 음성은 아직 없을 수 있으며 TTS 준비 상태와 게시
  상태를 분리한다.
- DRAFT 문장 version은 `mediaAssetId = null`을 허용하되 게시 검증은 모든
  필수 음성이 `READY`일 때만 통과한다.
- 승인 transaction은 후보 상태와 생성된 question/version 연결을 함께
  저장해 중복 승인을 막는다.
- `PENDING` 후보만 폐기할 수 있고 폐기된 후보는 복구하지 않는다.
- 재생성은 원본 후보를 덮어쓰지 않고 같은 job item의 새 attempt와
  `regeneratedFromCandidateId`를 남긴다.

승인·폐기·재생성 command와 read API는 Wave 5에서 고정한다. Wave 6의
관리자 화면은 이 API만 소비한다.

### 3.6 멱등성과 provider 기록

- `(job item, attempt, operation, sequence)` provider run key를 재사용한다.
- 외부 호출 전에 claim하고 terminal 결과를 기록한다.
- outcome을 확인하지 못한 `STARTED` run은 자동 재호출하지 않고
  `PROVIDER_OUTCOME_UNKNOWN`으로 남긴다.
- 후보·검증 저장과 item terminal 전이는 활성 lease token 조건의 한
  transaction이다.
- stale attempt, stale lease와 queue redelivery는 후보·비용을 중복
  기록하지 않는다.
- raw provider payload, 원문 전체와 private key는 API나 audit에 노출하지
  않는다.

## 4. `automated-tts`

### 4.1 소유 경계

이 브랜치는 다음 leaf 경계를 소유한다.

- `backend/domain/src/media/tts-*`
- `backend/database/src/schema/tts.schema*`
- `backend/database/src/repositories/tts/`
- `backend/database/src/queries/drizzle-tts-operations*`
- `backend/providers/src/fakes/deterministic-tts-*`
- `backend/worker/src/media/tts-*`
- `backend/api/src/media/tts-*`
- `shared/contracts/src/media/tts-*`

AI 문제 생성 후보, 학습자 question query와 공용 content-production
dispatcher는 수정하지 않는다.

### 4.2 생성 대상과 voice snapshot

TTS item은 다음 대상 중 하나의 immutable text snapshot을 가진다.

- 어휘 발음
- 다단어 표현
- 태국어 문장 version
- 개념 학습 태국어 예시 문장

각 item은 target kind/id, text snapshot, voice preset snapshot, provider
configuration revision과 필수 여부를 저장한다. 원본 콘텐츠가 바뀌면 기존
item을 수정하지 않고 새 revision을 만든다.

### 4.3 상태와 재시도

job과 item 상태는 분리한다.

- item: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`
- job: item 집계로 `QUEUED`, `RUNNING`, `SUCCEEDED`,
  `PARTIALLY_FAILED`, `FAILED`

item은 attempt, lease token, lease 만료, 안정적인 error code와 retryable을
가진다. provider timeout, retryable failure와 terminal failure를 구분한다.
일괄·개별 재시도는 실패 item만 새 attempt로 전이하며 정상 item은 다시
호출하지 않는다. 일부 item의 반복 실패가 다른 item의 완료를 막지 않는다.

### 4.4 음성 재사용과 저장

재사용 key는 다음 값의 digest다.

- 정규화한 발음 또는 문장 text
- voice preset snapshot
- provider/model
- audio format
- generation revision

같은 key의 `READY` media asset이 있으면 provider를 호출하지 않고
재사용한다. 생성 결과는 private immutable media asset으로 저장하고 실제
metadata 검증 뒤에만 `READY`로 전이한다. 중복 작업이 동시에 같은 key를
생성해도 unique claim으로 하나의 provider 호출과 하나의 대표 media
연결만 남긴다.

Phase A의 deterministic provider는 테스트에서 검사 가능한 짧은 WAV와
고정 usage를 반환한다. production 설정이 없을 때 runtime은 외부 호출을
시도하지 않고 `TTS_PROVIDER_UNAVAILABLE`을 기록한다.

### 4.5 게시 차단

- AI 검증, TTS 준비, 게시 상태를 하나의 enum으로 합치지 않는다.
- 읽기와 듣기 모두 참조하는 필수 어휘·표현·문장의 media asset이 없거나
  `READY`가 아니면 게시할 수 없다.
- 문제 DRAFT의 nullable media 참조는 TTS 성공 transaction에서 채운다.
- 이미 게시된 immutable sentence version의 음성을 교체하지 않는다.
  공급자 변경이나 재생 오류는 새 문제/content version과 새 TTS revision을
  만든다.
- 게시 검증 오류는 누락 target을 노출할 수 있는 안정적인
  `CONTENT_TTS_NOT_READY` code를 사용한다.

TTS 작업 목록·상세·일괄 retry·개별 retry API를 Wave 5에서 고정하며,
Wave 6 UI가 이를 소비한다.

## 5. `learner-question-discovery`

### 5.1 소유 경계

이 브랜치는 다음 기존 read path만 소유한다.

- `shared/contracts/src/learning/questions*`
- `backend/database/src/queries/drizzle-learner-question.query*`
- 관련 PostgreSQL integration test
- `backend/api/src/learning/learner-content.service*`
- 필요한 learner question controller test
- `frontend/web/src/pages/question-list/**`

DB schema, migration, 관리자 taxonomy command, content-production,
worker, providers, infra와 route tree는 수정하지 않는다.

### 5.2 공개 검색 계약

기존 `GET /api/v1/questions`에 다음 query를 추가한다.

- `majorCategory`
- `questionTypeId`
- `topicId`
- `tagId`
- `sort=LATEST`

기존 `skill`, `difficulty`, `saved`, `firstResult`, page 계약은 유지한다.
기본 정렬은 `publishedAt DESC, questionId DESC`다. 같은 게시 시각에도
보조 key로 page가 흔들리지 않아야 한다.

목록 항목에는 대분류, 세부 유형, 주제, 태그와 난이도 표시 정보를
포함한다. 응답에는 현재 게시 중인 문제에서 실제로 사용할 수 있는
대분류·유형·주제·태그 선택지를 포함한다. 선택지는 현재 filter 결과가
아니라 전체 공개 문제 집합에서 계산해 filter 조합 중에도 안정적으로
유지한다.

DRAFT, 숨김 문제, 무효 version은 항목과 선택지의 근거에서 모두 제외한다.
topic/tag 다대다 join은 `EXISTS` 또는 distinct 대상 query를 사용해 count와
pagination을 중복시키지 않는다.

### 5.3 학습자 UI

- 문제 유형 UUID 직접 입력을 제거한다.
- 대분류, 세부 유형, 주제, 태그를 label 기반 select로 제공한다.
- filter 변경 시 page를 1로 되돌린다.
- URL search 왕복으로 새로고침과 뒤로가기를 보존한다.
- 데스크톱은 왼쪽 filter panel, 모바일은 bottom Sheet를 사용한다.
- 문제 카드에 대분류·세부 유형·주제·태그·난이도를 표시한다.
- 저장 여부, 첫 정답 결과와 기존 pagination 동작은 보존한다.

## 6. 통합 브랜치 작업

통합 브랜치는 다음 작업만 수행한다.

1. 세 feature branch merge
2. schema·domain·database·provider·worker·contract barrel export
3. AI question processor와 TTS worker runtime 조립
4. AppModule과 leaf API module 등록
5. OpenAPI와 API Gateway route 등록
6. nullable DRAFT media와 AI question/TTS table을 포함한 단일 Wave 5
   migration 생성
7. local taxonomy·voice preset·생성 preset seed 보강
8. question publication의 TTS readiness 연결
9. 실제 PostgreSQL migration·seed·동시성·transaction 검증
10. 전체 `pnpm check`, 리뷰 수정, local `main` merge와 재검증

통합 migration은 기존 게시 sentence의 media 참조를 그대로 보존한다.
nullable 변경은 신규 DRAFT 생성을 위한 것이며 기존 `PUBLISHED` 데이터의
준비 상태를 약화하지 않는다.

## 7. 오류 처리

- validation과 상태 전이 실패는 안정적인 domain code로 응답한다.
- 잘못된 command는 400, 없는 리소스는 404, stale revision·중복 승인·lease
  충돌은 409로 매핑한다.
- provider unavailable과 terminal 생성 실패는 job/item 결과로 저장하며
  HTTP 요청을 장시간 대기시키지 않는다.
- raw provider 응답, storage key, 원문 전체, 인증 정보는 error response와
  audit summary에서 제거한다.
- retry는 명시적인 command에서만 attempt를 증가시킨다.

## 8. 검증 전략

모든 테스트 설명은 한국어로 작성하고 E2E 테스트는 추가하지 않는다.

### 8.1 기능 브랜치

- 계약 schema parsing과 serialization
- prompt 조립과 taxonomy 누락
- 후보 schema·결정 규칙·유사도·교차 검증
- 승인·폐기·재생성 상태 전이
- TTS 재사용·부분 실패·timeout·retry
- 게시 차단과 nullable DRAFT media
- learner filter, stable sort, distinct count
- 데스크톱·모바일 filter와 URL round trip component test
- focused Vitest, lint, typecheck와 build

### 8.2 통합 브랜치

- migration snapshot과 backfill 순서
- 실제 PostgreSQL provider claim·lease·중복 승인
- 실제 PostgreSQL TTS reuse claim·부분 실패·retry
- local seed와 게시 차단
- OpenAPI와 infra route exact 목록
- 전체 unit/component suite
- web coverage threshold
- 전체 workspace build

### 8.3 수동 smoke

Wave 5 통합 뒤 Docker는 다음 확인 동안만 실행한다.

- local migration과 seed
- 관리자 계정으로 문제 생성/TTS API 상태 확인
- 학습자 문제 목록에서 label filter와 stable pagination 확인
- 게시 전 필수 TTS 누락 차단 확인

smoke 뒤 서버와 Docker를 내리고 생성 부산물을 정리한다.

## 9. 명시적 비범위

다음 항목은 Wave 5에서 만들지 않는다.

- 외부 OCR/AI/TTS SDK, credential, model ID와 유료 호출
- 생성·검증과 TTS 관리자 화면
- 생성 preset CRUD 화면
- AI·TTS 사용량·예상 비용 화면
- production web 배포 전환과 CI 전체 DB gate
- 신규 E2E runner 또는 browser/API E2E spec

이 항목들은 제품 범위에서 제거되는 것이 아니라 각각 공급자 승인,
Wave 6 관리자 자동화 UI, Wave 7 통합 안정화에 배정된다.

## 10. 완료 기준

Wave 5는 다음 조건을 모두 만족해야 완료다.

- AI 문제 후보가 prompt·결정 규칙·유사도·독립 교차 검증을 거쳐 실제
  PostgreSQL에 멱등 저장된다.
- 정상 후보 승인으로 nullable audio의 DRAFT가 만들어지고 자동 게시되지
  않는다.
- TTS가 항목별 상태, 재사용, 부분 실패와 일괄·개별 retry를 보존한다.
- 필수 음성이 모두 `READY`가 아니면 게시할 수 없다.
- 학습자가 UUID를 입력하지 않고 분류·주제·태그로 공개 문제를 찾는다.
- 세 feature review와 integration review의 Critical·Important 지적이 없다.
- 실제 PostgreSQL 통합 테스트와 전체 `pnpm check`가 통과한다.
- local `main`에 merge되고 원격 push·PR은 없다.
- Docker와 생성 cache가 종료·정리되고 DB volume은 유지된다.
