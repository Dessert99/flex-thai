# Wave 6 관리자 자동화 UI 설계

## 목적

Wave 5의 AI 문제 생성·후보 검수·TTS 상태 전이를 다시 설계하지 않고,
관리자가 실제 운영 흐름을 끝까지 사용할 수 있는 콘텐츠 제작, TTS 운영,
사용량·비용 화면을 제공한다. 화면에 표시하는 모든 행동은 실제 계약과
저장 상태를 가져야 하며, 아직 실행되지 않는 옵션을 UI에만 노출하지 않는다.

## 공통 원칙

- 모든 관리자 API와 화면은 기존 `ADMIN + 등록된 MFA` 경계를 상속한다.
- 외부 유료 AI·TTS provider는 추가하지 않고 local deterministic adapter와
  production fail-closed adapter를 유지한다.
- provider 원문, provider request ID, storage key, 인증 정보는 공개 계약에
  포함하지 않는다.
- 금액은 부동소수점으로 변환하지 않고 USD decimal 문자열로 전달한다.
- 새 요청 계약은 strict Zod schema로 unknown key를 거절한다.
- 상태 전이 command는 현재 revision과 UUID request ID를 사용한다.
- 브라우저·API E2E 테스트는 추가하지 않고 계약, 도메인, DB query/repository,
  Controller, 컴포넌트 테스트와 lint·typecheck·build로 검증한다.
- 세 기능 브랜치는 leaf 파일만 소유한다. `AppModule`, 공개 barrel,
  OpenAPI 전체 목록, API Gateway, 관리자 navigation, root title,
  `routeTree.gen.ts`, 관리자 홈은 통합 브랜치가 직렬로 연결한다.

## 1. 콘텐츠 제작 콘솔

### 화면과 흐름

`/admin/content-production`은 verified upload, 생성 목적, 활성 preset,
문항 수를 받는 빠른 생성 화면이다. 고급 설정은 raw JSON 대신 다음 typed
필드를 제공한다.

- `questionCount`: 1 이상 100 이하
- `questionTypePlan`: 서로 다른 활성 문제 유형 버전과 각 `count`
- `difficultyPlan`: 서로 다른 난이도 1~5와 각 `count`
- `targetVocabularyIds`, `requiredVocabularyIds`,
  `excludedVocabularyIds`: 각 500개 이하의 중복 없는 UUID
- `newAuxiliaryVocabularyLimit`: 0 이상 100 이하
- `similarityThreshold`: 0 이상 1 이하
- `defaultVoicePresetId`: enabled TTS preset UUID
- `speakerVoiceAssignments`: 서로 다른 20개 이하의 trim된 speaker role과
  enabled TTS preset UUID
- `additionalInstructionKo`: trim 뒤 1 이상 2,000자 이하 또는 `null`

문제 생성 목적에서는 유형 계획과 난이도 계획의 합이 각각
`questionCount`와 같아야 한다. 세 어휘 집합은 서로 겹칠 수 없다.
어휘 추출 전용 목적은 문제 전용 옵션을 받지 않는다. 복합 목적은 어휘
추출이 성공한 뒤 동일 snapshot으로 문제 생성을 실행한다.

`POST /admin/content-production/prompt-previews`와 작업 생성은 하나의
effective snapshot resolver를 공유한다. 미리보기는 worker가 사용하는
`buildQuestionGenerationPrompt`를 그대로 호출하고 `promptVersion`,
순서가 고정된 안전한 section, 최종 prompt를 반환한다. prompt는 읽기
전용이며 관리자는 한국어 추가 지시만 바꿀 수 있다.

### 실행 의미

작업의 immutable `presetSnapshot.parameters`에는 검증 완료된 effective
options를 저장한다. 멱등 replay는 snapshot 전체가 같아야 하며 retry는
최초 snapshot을 재사용한다.

질문 생성 dispatcher는 `questionTypePlan`과 `difficultyPlan`을 안정적인
순서로 펼쳐 `questionCount`개의 `QUESTION_GENERATION` item을 만든다.
각 item은 한 유형 버전과 한 난이도를 snapshot으로 갖는다. 생성 processor는
그 item snapshot으로 context를 읽고 후보를 한 개 만든다. 현재 후보
검증·승인 상태 머신은 변경하지 않는다.

생성 preset은 기존 row-as-version 모델을 사용한다. 같은 이름의 새 버전은
이전 row를 수정하지 않고 다음 version row를 만든다. enabled preset만 새
작업에 선택할 수 있고 사용 이력이 있는 row는 물리 삭제하지 않는다.

후보 승인 scheduler는 생성된 문장의 speaker를 immutable
`speakerVoiceAssignments`에서 찾고, 없으면 `defaultVoicePresetId`를
사용한다. 서로 다른 preset이 필요하면 preset별 TTS job을 같은 승인
transaction에서 만들고 각 문장을 정확히 한 job에 넣는다. assignment의
speaker role은 prompt에도 포함해 생성 결과와 음성 선택이 같은 snapshot을
따르게 한다.

### 운영 화면

- `/admin/content-production`: 빠른/고급 생성, prompt 미리보기, 작업 내역
- `/admin/content-production/jobs/:jobId`: snapshot, 입력, 항목 상태,
  공개 오류, retry, 작업의 모든 후보 진입
- `/admin/content-production/candidates`: job, 정상·주의·실패,
  검수 상태 필터와 pagination
- `/admin/content-production/candidates/:candidateId`: canonical graph,
  redacted 실패, 정확히 네 검증 단계, 승인·폐기·재생성
- `/admin/content-production/presets`: preset 목록, 새 version,
  enable/disable

후보 query는 `jobId` projection/filter를 추가한다. 일괄
승인·폐기·재생성은 검증된 기존 단건 endpoint를 제한된 동시성으로
조합하고 항목별 성공/실패를 보여주며 실패 selection을 보존한다.

## 2. TTS 운영 콘솔

### 음성 preset

기존 `tts_voice_presets` row를 immutable version으로 사용한다.
`name + generationRevision`은 유일하며 새 설정은 새 row를 만든다.
enabled는 새 작업에서 선택 가능한지 뜻하고 hard delete는 제공하지 않는다.

실제 자동 생성에 쓰는 `TTS_VOICE_PRESET_ID`는 active preset으로 읽기
전용 표시한다. active row는 disable할 수 없으며 409를 반환한다.
create/version/enable/disable은 모두 관리자 audit을 남긴다.

### 작업, 재시도와 음성 재생

- `/admin/tts`: 상태·기간·페이지별 TTS 작업 목록
- `/admin/tts/jobs/:jobId`: voice snapshot, 항목 상태·오류 필터,
  실패 원인, 일괄·개별 retry
- `/admin/tts/presets`: preset version과 enabled/active 상태

retry는 `FAILED && retryable` 항목만 선택하고 `expectedAttempt`를 보낸다.
retry 상태, durable outbox, audit은 한 transaction으로 저장하며 exact
replay는 audit을 중복 생성하지 않는다. stale attempt 409는 상세을
refetch하고 사용자 selection을 갱신한다.

`GET /admin/tts/items/:itemId/audio`는 성공 항목의 READY media에 대해서만
`{ url, expiresAt }`을 반환한다. URL은 재생 클릭 때 발급하고 기존
`MediaReadUrlProvider`를 사용한다. 항목 미존재는 404, 미준비는 409이며
storage key는 응답에 포함하지 않는다.

### 게시 readiness

`GET /admin/tts/questions/:questionId/versions/:versionId/readiness`는
`ready`, required/ready count와 blocker를 반환한다. blocker에는 target
kind/id, media status와 연결 가능한 job/item 상태·attempt·error/retryable을
포함한다.

문제 상세은 validation과 TTS readiness를 별도 상태로 표시한다. blocker가
있으면 게시 버튼을 비활성화하고 연결된 TTS 작업/retry로 이동한다. 서버의
publication guard도 유지하며 `CONTENT_TTS_NOT_READY`는 안정적인 409로
매핑한다.

## 3. 사용량·비용 운영

### 집계

`GET /admin/usage-cost`는 `provider_runs`와 `tts_provider_runs`를
`UNION ALL`로 정규화해 AI/TTS 실행을 중복 없이 집계한다.

- 필터: UTC `from`, `to`, `source`, provider, model, voice, status
- 합계: 예상 비용, 실행 중 job 수, 실패 run 수, 검토 대기 candidate 수
- breakdown: source/provider/model/voice별 run 수와 예상 비용
- 완료 비용은 `finishedAt`, 실행 중은 `STARTED` job 기준
- TTS voice는 item과 job의 immutable voice snapshot에서 읽는다.
- 공급자마다 다른 usage JSON 전체는 공개하지 않는다.

### 비용 경고 설정

`operations_cost_settings` singleton row를 추가한다.

- 기간은 UTC 달력 월이다.
- `warningUsd` 기본값은 `15.000000`, `criticalUsd` 기본값은 `24.000000`이다.
- `0 < warningUsd < criticalUsd`를 DB와 계약에서 모두 검증한다.
- 통화는 `USD` 고정이다.
- GET과 PUT을 제공하고 PUT은 `expectedUpdatedAt`과 UUID `requestId`를
  사용해 충돌과 replay를 구분한다.
- 변경은 `USAGE_COST_SETTINGS_UPDATED` audit을 남긴다.
- 경고는 자동 차단이나 provider 중단이 아니라 관리자 화면의
  `NORMAL`, `WARNING`, `CRITICAL` 상태와 빠른 진입에만 사용한다.

`/admin/usage-cost`는 현재 UTC 월을 기본으로 합계, breakdown, 실패,
검토 대기, 실행 중, threshold 상태와 설정 편집을 제공한다.

## 4. 관리자 홈과 통합

관리자 navigation에는 콘텐츠 제작, TTS 운영, 사용량·비용을 추가한다.
관리자 홈은 다음 운영 카드를 기존 최근 문제·어휘·감사 카드와 독립 query로
조회한다.

- 게시 검토 대기
- AI 생성 실패와 실행 중 작업
- TTS 실패와 실행 중 작업
- 현재 월 AI·TTS 예상 비용과 threshold 상태
- 콘텐츠 생성, 후보 검수, TTS retry, 비용 화면 빠른 진입

새 카드 하나가 실패해도 기존 카드와 다른 운영 카드를 비우지 않는다.
모든 route는 기존 enrolled admin shell을 사용하고 root title,
redirect allowlist, reachability와 role navigation 테스트를 함께 갱신한다.

## 5. 병렬 작업 경계

### 브랜치 A: `content-production-console`

콘텐츠 제작 strict snapshot, preview, preset version, job-scoped candidate
query와 전용 frontend page/feature만 소유한다.

### 브랜치 B: `tts-operations-console`

TTS preset version, retry audit, audio/readiness API와 전용 frontend
page/feature, publication 409 mapping만 소유한다.

### 브랜치 C: `usage-cost-operations`

사용량·비용 계약, 집계 query, cost settings schema/repository/API,
전용 frontend page만 소유한다. Wave 6의 유일한 migration을 생성한다.

### 통합 브랜치

세 leaf commit을 병합한 뒤 공개 barrel, AppModule/module wiring,
OpenAPI, API Gateway, 관리자 navigation/root/reachability,
`routeTree.gen.ts`, 관리자 홈, migration journal/snapshot과 local seed를
한 번만 수정한다.

## 6. 완료 조건

- 빠른 생성과 모든 고급 옵션이 실제 immutable item snapshot과 worker
  실행에 반영된다.
- preview와 create가 같은 resolver와 prompt builder를 사용한다.
- 후보 bulk action은 부분 실패를 보존하고 redacted payload를 노출하지 않는다.
- TTS retry/outbox/audit이 원자적이고 음성 URL이 storage key를 숨긴다.
- blocker가 있으면 UI와 서버 모두 게시를 막고 retry 뒤 readiness가 갱신된다.
- AI/TTS 비용은 decimal 문자열로 중복 없이 집계되고 월 threshold 상태가
  저장·감사된다.
- 관리자 홈의 운영 카드가 부분 실패를 독립적으로 복구한다.
- 세 브랜치의 공용 hotspot 변경이 통합 브랜치에만 존재한다.
- 전체 `pnpm check`, 실제 PostgreSQL opt-in test와 main 병합 후
  `pnpm test`가 통과한다.
