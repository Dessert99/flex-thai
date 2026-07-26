# Wave 4 콘텐츠 생성·운영 설정 병렬 전달 설계

## 1. 기준과 목표

이 Wave는 로컬 `main`의 `4816cbc`를 공통 기준으로 삼아 다음 세 기능을
각각 독립 worktree에서 구현한다.

1. `ai-vocabulary-production`
2. `question-taxonomy-settings`
3. `user-audit-operations`

세 브랜치는 기능 내부의 계약·도메인·저장소·API·화면까지 완결하되, 공용
barrel, AppModule, OpenAPI 경로 목록, 인프라 route, migration journal,
navigation과 생성 파일은 수정하지 않는다. 이 파일들은 세 기능 브랜치를
검토한 뒤 통합 브랜치가 한 번만 수정한다.

완료 기준은 단순히 화면이 보이는 상태가 아니다. 각 기능의 단위·컴포넌트
테스트, 실제 PostgreSQL이 필요한 동시성·transaction 검증, 전체 lint,
typecheck, build와 기존 회귀 테스트가 모두 통과해야 한다.

## 2. 공통 실행 원칙

### 2.1 브랜치와 통합 순서

- 세 기능 브랜치는 같은 `main` SHA에서 시작한다.
- 기능 브랜치끼리 merge하지 않는다.
- 통합 브랜치는 세 기능 commit을 차례대로 merge한 뒤 공용 조립만 한다.
- 예상 통합 순서는 schema 영향이 큰 `question-taxonomy-settings`,
  worker 영향이 큰 `ai-vocabulary-production`, 독립적인
  `user-audit-operations` 순이다.
- migration은 기능 branch의 schema diff를 모두 받은 뒤 통합 브랜치에서
  하나의 Wave 4 migration으로 생성한다.
- 원격 push와 PR은 하지 않는다.

### 2.2 통합 브랜치 전용 파일

다음 경로는 기능 브랜치에서 수정하지 않는다.

- `backend/database/src/schema/index.ts`
- `backend/providers/src/fakes/index.ts`
- `backend/api/src/app.module.ts`
- `backend/api/src/openapi/**`
- `backend/config/src/**`
- `backend/database/drizzle/**`
- `backend/worker/package.json`
- `backend/worker/esbuild.config.mjs`
- `backend/providers/package.json`
- `infra/src/application-stack.ts`
- `infra/src/constructs/http-api.ts`
- `infra/src/constructs/async-jobs.ts`
- `frontend/web/src/app/routing/adminNavigation.ts`
- `frontend/web/src/app/routes/__root.tsx`
- `frontend/web/src/routeTree.gen.ts`
- `frontend/web/src/pages/admin-home/**`
- 루트 `package.json`과 `pnpm-lock.yaml`

기능 branch의 테스트는 가능한 한 leaf module을 직접 import한다. 다만
workspace package 경계를 지키며 API까지 typecheck하려면 public export가
필요하므로 `shared/contracts/src/index.ts`, `backend/domain/src/index.ts`,
`backend/database/src/index.ts`, `backend/providers/src/index.ts`에는 각
기능의 export만 지정된 기존 feature anchor 바로 뒤에 append할 수 있다.
기존 export의 수정·재정렬은 금지하며 최종 중복 검사는 통합 브랜치가
담당한다. 실제 runtime module 조립은 계속 통합 브랜치 전용이다.

### 2.3 자원 관리

- Docker는 실제 PostgreSQL 검증과 최종 smoke 검증 때만 올린다.
- 세 기능의 Docker 검증은 동시에 실행하지 않고 한 번의 DB 가동 창에서
  순서대로 실행한다.
- 각 검증 묶음이 끝나면 컨테이너를 내리고 프로젝트의 `dist`, `.vite`,
  `coverage`를 정리한다.
- `node_modules`, pnpm store, PostgreSQL volume은 재사용 비용이 크므로
  오류가 확인되지 않는 한 유지한다.
- 완료된 worktree는 통합과 최종 검증 뒤 제거한다.

## 3. `ai-vocabulary-production`

### 3.1 범위와 공급자 gate

공급자와 새 패키지는 아직 승인되지 않았다. 따라서 기능은 두 단계로
구분한다.

- Phase A는 provider-independent 도메인, DB, worker, fake/local processor를
  완성한다. production 설정이 없을 때는 현재와 같이 명시적인
  `PROVIDER_UNAVAILABLE` 실패를 유지한다.
- Phase B는 사용자가 Google Cloud Vision OCR과 AWS Bedrock 사용 및 필요한
  SDK·credential·model ID를 승인한 뒤 production adapter와 최소 IAM을
  연결한다.

승인 전에는 외부 SDK나 임의 모델을 설치·호출하지 않는다. 이 gate는
Phase A의 병렬 구현을 막지 않지만, Wave 4 전체를 production-ready로
판정하는 최종 gate다.

### 3.2 작업 입력과 port

dispatcher는 processor에 문자열 `sourceRef`만 넘기지 않고 다음을 담은
`ContentProductionWorkItem`을 전달한다.

- `jobId`, `attempt`, `purpose`, `requestedBy`
- immutable preset snapshot
- claim된 item과 lease token
- 해당 item의 정확한 input type, private input key, upload metadata

도메인 경계는 다음 port로 분리한다.

- `ContentProductionInputReader`
- `ContentOcrProvider`
- `VocabularyExtractionProvider`
- `VocabularyCrossValidationProvider`
- `VocabularyProductionLookup`
- `ContentProductionProviderRunRepository`
- `VocabularyProductionCandidateRepository`

어휘 조회는 공개 read port를 통해 exact normalized 어휘와 뜻 graph,
제한된 의심 중복 후보만 반환한다. AI processor가 vocabulary table이나
관리자 query를 직접 참조하지 않는다.

### 3.3 처리 흐름과 판정

처리 순서는 input read, TEXT decode 또는 OCR, 구조화 추출, Thai 정규화,
exact lookup, 의심 중복 판정, 결정 규칙, 별도 모델 교차 검증,
후보·검증 결과 저장, provider usage 기록이다.

- TEXT는 OCR을 호출하지 않는다.
- PDF와 IMAGE만 OCR을 호출한다.
- exact lookup은 `MERGED`를 대표 어휘로 따라가며 `DRAFT`, `PUBLISHED`,
  `HIDDEN` 어휘를 모두 중복 판정 대상으로 삼는다.
- normalized Thai가 같고 기존 뜻도 같으면
  `EXACT_EXISTING_MEANING`, 새 뜻이면 `EXACT_NEW_MEANING`이다.
- exact가 아니고 정규화 code-point distance가 1 이하이면
  `POSSIBLE_DUPLICATE`다. 이 값은 preset snapshot에 저장하며 seed
  기본값을 1로 둔다.
- 나머지는 `NEW_VOCABULARY`다.
- 의심 중복은 자동 병합하지 않는다.
- 생성 모델과 교차 검증 모델은 서로 다른 model ID여야 한다. 같은 Bedrock
  provider를 사용할 수 있지만 같은 model ID 구성은 시작 전에 거절한다.
- 후보가 0개면 성공으로 숨기지 않고 `NEEDS_ATTENTION`과 안정적인
  `NO_CANDIDATES` code를 기록한다.
- 후보는 자동으로 공용 어휘에 저장하거나 게시하지 않는다.

중복 분류와 실행 결과를 분리한다. 실행 결과는 `NORMAL`,
`NEEDS_ATTENTION`, `FAILED`, 검증 단계는 `SCHEMA`, `DECISION_RULE`,
`AI_CROSS_VALIDATION`이다.

### 3.4 저장과 멱등성

별도 candidate와 validation table에 attempt별 이력을 저장한다.
`provider_runs`는 prompt version, lifecycle, operation sequence를 표현할
수 있도록 확장한다.

- 후보·검증 결과 저장과 item terminal 전이는 활성 lease token을 조건으로
  한 transaction이다.
- `(job item, attempt, operation, sequence)`는 provider run을 유일하게
  식별한다.
- 외부 호출 전에 run을 claim하고 terminal 결과를 기록한다.
- worker가 외부 결과를 확인하지 못한 채 종료되면 자동 재호출하지 않고
  `PROVIDER_OUTCOME_UNKNOWN` 주의 상태로 남긴다. 명시적 retry만 새
  attempt를 만든다.
- stale attempt, stale lease, queue redelivery는 후보와 비용을 중복
  기록하지 않는다.
- raw provider payload, private input key와 원문 전체는 공개 job 응답이나
  audit에 노출하지 않는다.

## 4. `question-taxonomy-settings`

### 4.1 데이터 모델

현재 `question_types`는 세부 유형의 논리적 정체성으로 유지한다. 듣기
3개와 읽기 4개의 FLEX 큰 분류는 제품 범위가 고정되어 있으므로
`question_major_category` enum으로 둔다. 다음 설정을 추가한다.

- `question_types.major_category`, `question_types.is_enabled`
- `question_type_versions.status`: `DRAFT`, `ACTIVE`, `RETIRED`
- `question_type_versions.difficulty_criteria`
- `question_type_versions.created_at`
- `question_type_approved_examples`: canonical 승인 예시 snapshot
- `question_topics`, `question_tags`
- `question_versions.topic_id`
- `question_version_tags`

난이도는 기존 1~5 값을 보존하며 유형 버전의 `difficulty_criteria`가 각
단계의 한국어 기준 문구를 모두 가진다. topic과 tag는 slug, 표시 이름,
활성·보관 상태와 정렬 순서를 가진다. topic은 문제 버전당 최대 하나,
tag는 여러 개를 연결한다. 질문 버전에 저장된 분류 연결은 해당 버전의
불변 콘텐츠 일부다.

### 4.2 유형 버전 lifecycle

새 유형 버전은 `DRAFT`로 만든다. DRAFT에서 구조 template, 선택지 수,
결정 규칙, 1~5 난이도 기준과 승인 예시 snapshot을 편집한다.

초기 유형과 예시 문제의 순환은 다음 순서로 푼다.

1. DRAFT 유형 버전을 만든다.
2. 기존 관리자 문제 payload와 같은 canonical 구조의 승인 예시 snapshot을
   한 개 이상 저장한다.
3. 예시의 template, 선택지 수와 정답 규칙을 유형 버전 규칙으로 검증한다.
4. 난이도 1~5 기준과 예시가 모두 있을 때 유형 버전을 `ACTIVE`로 전환한다.
5. 일반 문제 작성·게시와 AI 생성은 ACTIVE 유형 버전만 새로 선택할 수 있다.

유형 버전이 ACTIVE가 되면 규칙, 난이도 기준과 예시 집합은 불변이다.
규칙 변경은 다음 version의 새 DRAFT를 만든다. ACTIVE 버전은 새 문제 생성
대상에서 제외하기 위해 RETIRED로 바꿀 수 있지만 기존 문제 버전의 참조와
학습 노출은 유지한다.

기존 유형 버전에는 같은 유형 버전을 참조하는 PASSED 문제 버전의
canonical graph를 snapshot으로 backfill하고 ACTIVE로 보존한다. 예시를
찾지 못한 legacy 버전은 DRAFT로 backfill하되 기존 문제 버전과 학습
기록의 참조 및 이미 게시된 문제의 노출은 그대로 유지한다. 설정 화면에서
`보완 필요`로 표시하고 예시를 저장해 ACTIVE로 전환할 수 있지만, 그
전에는 새 문제 생성 대상으로 선택할 수 없다.

### 4.3 관리자 API와 화면

관리자 API는 유형 목록·상세·논리 속성 변경, 새 버전 생성, DRAFT 예시
연결·해제, 활성화·retire, category/topic/tag 목록·생성·변경을 제공한다.
기존 문제 초안 생성·교체 payload에는 `topicSlug`와 `tagSlugs`를 추가한다.

관리 화면은 `/admin/settings/questions` 한 페이지에서 다음 탭을 제공한다.

- 유형과 버전
- topic과 tag

generic settings engine은 만들지 않는다. 활성화 버튼은 누락된 규칙,
난이도 기준, 승인 예시를 구체적으로 보여주며 조건이 충족되지 않으면
실행되지 않는다.

## 5. `user-audit-operations`

### 5.1 사용자 운영

기존 사용자 목록 API를 이메일 검색, role, status, TOTP 등록 여부,
page/pageSize 필터가 있는 paginated 응답으로 확장한다. 역할 변경 API를
추가하고 기존 상태 변경과 함께 before/after를 audit summary에 기록한다.

- 모든 동작은 최신 DB 상태 기준 `ACTIVE + ADMIN + TOTP 등록`을 요구한다.
- OTP 상태는 `mfa_enrolled_at` 기반 등록 여부만 뜻한다.
- action-level 최근 TOTP 재인증은 현재 모델에 없으므로 이번 Wave에서
  구현하거나 등록 상태와 혼동하지 않는다.
- 관리자는 자신을 disable하거나 LEARNER로 내릴 수 없다.
- 같은 값 변경은 audit를 추가하지 않는 idempotent no-op이다.
- active admin을 disable/demote할 때 transaction advisory lock 아래 남은
  active admin을 확인해 동시 교차 변경으로 관리자가 0명이 되는 경우도
  막는다.
- 역할을 LEARNER로 바꿔도 Cognito와의 분산 변경을 만들지 않기 위해
  `mfa_enrolled_at`은 보존한다. 화면에서는 learner를 `해당 없음`으로
  표시한다.

### 5.2 감사 조회

`operations` 모듈에 다음 API를 둔다.

- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/audit-logs/:auditLogId`

목록은 자유 검색, actor user, action, target type/id, from/to와 pagination을
지원하며 `(created_at DESC, id DESC)`로 안정 정렬한다. actor user가 없는
legacy 기록은 SYSTEM actor로, nullable target은 그대로 표현한다.

감사 기록은 append-only이고 조회 API는 update/delete를 제공하지 않는다.
token, cookie, TOTP code, private object key와 원문 payload는 summary로
반환하거나 새로 기록하지 않는다.

관리자 홈은 별도 중복 endpoint 없이 audit 목록의 첫 다섯 건을 독립
query로 가져온다. 최근 변경 조회가 실패해도 기존 홈 영역은 유지한다.

## 6. 통합과 검증

통합 브랜치는 다음을 한 번에 수행한다.

1. 세 기능의 root export와 Nest module 조립
2. 한 개의 Wave 4 migration과 local seed 갱신
3. OpenAPI DTO·경로와 API Gateway route 등록
4. 관리자 navigation, route tree와 최근 감사 홈 카드 연결
5. production AI provider 승인 시 config, secret, IAM과 bundle 연결
6. migration 전후 legacy 데이터 보존 검증
7. 기능별 실제 PostgreSQL 테스트를 한 Docker 가동 창에서 순차 실행
8. 전체 `pnpm check`와 로컬 API·웹 smoke 검증
9. Docker 종료와 재생성 가능한 프로젝트 부산물 정리

최종 통합은 기존 문제 버전 참조, 기존 audit row, Wave 3 작업 이력과
provider run을 보존해야 한다. 세 기능 중 하나가 실패해도 다른 기능의
데이터를 rollback하거나 초기화하지 않는다.
