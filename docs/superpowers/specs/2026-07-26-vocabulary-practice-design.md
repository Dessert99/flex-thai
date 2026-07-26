# FLEX THIA 단어 연습 설계

- 작성일: 2026-07-26
- 상태: 승인된 전체 제품 기획의 Wave 2 구체화
- 선행 조건: Wave 1 `multiple-wordbooks` 통합과 전체 품질 게이트 통과
- 소유 모듈: `learning`의 `vocabulary-practice`

## 1. 목적과 완료 조건

사용자가 공용 어휘 검색 결과 또는 자신이 소유한 단어장에서 어휘를 골라
선택형 단어 연습을 진행하고, 답마다 즉시 피드백을 확인한 뒤 세션 종료
시에만 결과 요약을 확인하게 한다.

완료 조건은 다음과 같다.

- 출처는 `SEARCH_SELECTION`, `WORDBOOK` 두 종류만 지원한다.
- 방식은 `THAI_TO_MEANING`, `MEANING_TO_THAI`,
  `AUDIO_TO_THAI`, `AUDIO_TO_MEANING`을 지원한다.
- 사용자는 한 개 이상의 방식을 골라 혼합 세션을 만들 수 있다.
- 문항 수는 `10`, `20`, `ALL` 중 하나이며 최대 100문항이다.
- 출제 순서는 `RANDOM`, `SOURCE` 중 하나다.
- 학습 카드에서 전체 뜻·발음·성조·음성을 항상 확인할 수 있다.
- 기억 확인은 4지선다이며 제출 직후 정답 여부와 전체 학습 카드를
  보여준다.
- 유형별·전체 정답/오답 요약은 모든 문항에 답한 세션에서만 제공한다.
- 세션, 출제 문항 snapshot, 각 답안 원시 기록을 저장한다.
- 숙련도, 진도, 연속 학습, 추천 점수, 카드 조회·음성 재생 횟수는
  만들거나 저장하지 않는다.
- 브라우저·API E2E 테스트와 E2E scaffold를 추가하지 않는다.

## 2. 현재 기반과 재사용 범위

다음 Wave 1 기반을 그대로 소비한다.

- `wordbooks`, `wordbook_items`: 사용자 소유 단어장과 공용 어휘 membership
- `vocabularies`, `vocabulary_meanings`,
  `vocabulary_pronunciations`, `vocabulary_meaning_pronunciations`: 공용
  어휘의 다의어·발음 구조
- `media_assets`: `READY` 음성의 불변 storage key
- `DrizzleWordbookQuery`: 단어장 목록과 소유권 응답 패턴 참고
- `VocabularySummary`와 `MediaReadUrlProvider`: 전체 뜻·발음·성조와
  응답 시점 signed URL 조립 패턴
- `GET /api/v1/vocabularies`, `GET /api/v1/me/wordbooks`: 시작 화면의
  검색 결과와 단어장 목록
- React Query `authenticatedRequest`, Page 상태 컴포넌트, Button·Card·
  RadioGroup·Select UI
- `useThaiAudioPlayback`: 한 화면에서 음성이 겹치지 않는 재생과 오류 상태

기존 wordbook 목록 API는 페이지 단위 표시용이므로 세션 전체 source를
만드는 데 재사용하지 않는다. 연습 adapter가 소유권과 `PUBLISHED`·`READY`
조건을 다시 검증하고 materialized 문항을 한 transaction으로 저장한다.

## 3. 문제 단위와 출제 규칙

### 3.1 문제 단위

다의어 오답 판정을 모호하게 만들지 않도록 한 문항은
`vocabularyId + meaningId` 한 쌍을 대상으로 한다.

- 태국어→뜻: 태국어 표기가 prompt, 대상 `meaningKo`가 정답이다.
- 뜻→태국어: 대상 `meaningKo`가 prompt, 태국어 표기가 정답이다.
- 음성→태국어: 대상 뜻과 연결된 `READY` pronunciation 음성이 prompt,
  태국어 표기가 정답이다.
- 음성→뜻: 같은 음성이 prompt, 대상 `meaningKo`가 정답이다.

음성 방식은 `vocabulary_meaning_pronunciations`로 대상 뜻과 연결된
발음만 사용한다. 연결된 `READY` 발음이 없는 어의는 음성 방식 후보에서
제외한다. 비음성 방식도 피드백 카드에서 음성을 보여줘야 하므로
`READY` 발음이 하나도 없는 어휘는 새 세션 후보에서 제외한다.

### 3.2 출처와 순서

- `SEARCH_SELECTION`: 요청의 `vocabularyIds` 순서를 source 순서로 보존한다.
- `WORDBOOK`: `wordbook_items.added_at ASC, vocabulary_id ASC`를 source
  순서로 사용한다.
- `RANDOM`: 서버에서 한 번 섞은 최종 순서를 문항 position으로 저장한다.
- 선택한 방식이 여러 개면 최종 후보 순서에 round-robin으로 배정한다.
- 요청한 문항 수와 4개의 고유 선택지를 만들 수 없으면 임의로 줄이지 않고
  `PRACTICE_SOURCE_INSUFFICIENT` 충돌로 거부한다.

정답과 오답 선택지는 같은 세션 후보에서 만들고 표시 문자열이 중복되지
않게 한다. 생성된 순서·prompt·선택지·정답과 학습 카드 문자열은 이후
공용 어휘 수정과 무관하게 question snapshot에 보존한다.

## 4. 데이터 모델

기능 schema는
`backend/database/src/schema/learning-practice.schema.ts`가 독점 소유한다.

### `vocabulary_practice_sessions`

- `id`, `user_id`
- `source_type`
- nullable `source_wordbook_id` (`ON DELETE SET NULL`)
- `source_label`: 단어장 이름 또는 `공용 검색` snapshot
- `modes`: 선택한 방식 배열
- `requested_question_count`: `ALL`이면 null
- `question_order`
- `status`: `ACTIVE`, `COMPLETED`
- `question_count`
- `started_at`, nullable `completed_at`

단어장 삭제가 과거 연습 기록을 막지 않도록 source FK는 `SET NULL`이고
이름 snapshot은 유지한다.

### `vocabulary_practice_questions`

- `id`, `session_id`, `position`
- `vocabulary_id`, `meaning_id`, nullable `pronunciation_id`,
  nullable `media_asset_id`
- `mode`
- `thai_snapshot`, `meaning_ko_snapshot`
- `pronunciation_ko_snapshot`, `tone_marks_snapshot`
- `options`: `{ id, label }[]` JSON snapshot
- `correct_option_id`

`(session_id, position)`과 `(session_id, id)`를 유일하게 만든다. session과
question은 삭제 API를 제공하지 않으며 학습 기록으로 보존한다.

### `vocabulary_practice_answers`

- `id`, `session_id`, `question_id`, `user_id`
- `client_answer_id`
- `selected_option_id`, `selected_label_snapshot`
- `is_correct`, `answered_at`

`(session_id, question_id)`는 한 문항의 중복 답을 막고,
`(user_id, client_answer_id)`는 네트워크 재전송을 멱등 처리한다.
question의 session과 answer의 session이 같도록 composite FK를 둔다.
답안은 insert-only다.

## 5. 도메인과 transaction

`VocabularyPracticeService`는 프레임워크와 Drizzle을 모른다.

```ts
type PracticeMode =
  | 'THAI_TO_MEANING'
  | 'MEANING_TO_THAI'
  | 'AUDIO_TO_THAI'
  | 'AUDIO_TO_MEANING';

interface CreateVocabularyPracticeInput {
  userId: string;
  source:
    | { type: 'SEARCH_SELECTION'; vocabularyIds: string[] }
    | { type: 'WORDBOOK'; wordbookId: string };
  modes: PracticeMode[];
  questionCount: 10 | 20 | 'ALL';
  order: 'RANDOM' | 'SOURCE';
}
```

생성 use case는 source 조회, 후보 검증, mode 배정, 4지선다 생성,
snapshot materialization을 수행한 뒤 repository의 한 transaction 저장을
호출한다. ID factory, clock, shuffle을 주입해 단위 테스트를 결정적으로
만든다.

답안 use case는 다음 원자성을 요구한다.

1. 현재 사용자의 `ACTIVE` session과 question을 잠근다.
2. 같은 `clientAnswerId`이면 기존 결과를 반환한다.
3. 선택지가 question snapshot에 속하는지 확인한다.
4. 원시 answer를 insert한다.
5. 모든 문항에 답했다면 session을 `COMPLETED`로 바꾼다.
6. 현재 문항의 즉시 피드백을 반환한다.

완료되지 않은 세션 조회에는 aggregate 결과를 포함하지 않는다. 완료
세션만 전체·방식별 정답/오답 수와 오답 학습 카드를 반환한다.

## 6. 공개 API

모든 경로는 JWT가 필요한 `/api/v1/me` 하위 경로다.

### `POST /api/v1/me/vocabulary-practice/sessions`

```json
{
  "source": {
    "type": "WORDBOOK",
    "wordbookId": "uuid"
  },
  "modes": ["THAI_TO_MEANING", "AUDIO_TO_MEANING"],
  "questionCount": 10,
  "order": "RANDOM"
}
```

검색 출처는 `source`에 중복 없는 `vocabularyIds` 1~100개를 전달한다.
응답은 session metadata, 전체 학습 카드, 정답을 제외한 materialized
questions를 반환한다.

### `GET /api/v1/me/vocabulary-practice/sessions/{sessionId}`

현재 사용자의 세션만 반환한다. 음성 URL은 DB에 저장하지 않고 매 응답에서
5분 signed URL로 새로 만든다. 완료 세션에만 `result`가 존재한다.

### `POST /api/v1/me/vocabulary-practice/sessions/{sessionId}/questions/{questionId}/answers`

```json
{
  "clientAnswerId": "uuid",
  "selectedOptionId": "uuid"
}
```

응답은 `isCorrect`, `correctOptionId`, 전체 학습 카드,
`sessionCompleted`를 반환한다. 다른 사용자의 session/question,
현재 question에 없는 option, 완료 session의 새 답은 노출 없는
404 또는 상태 충돌 409로 처리한다.

Controller는 요청·응답 Zod schema와 정상·400·401·404·409 Swagger
metadata를 함께 제공한다. API Gateway의 명시 route 목록은 통합
담당자가 세 경로를 추가한다.

## 7. 프론트엔드

### 시작 화면 `/practice`

- 내 단어장 하나를 고르거나 공용 어휘를 검색해 1~100개를 직접 선택한다.
- 한 개 이상의 기억 확인 방식, 10·20·전체, source·무작위 순서를 고른다.
- eligible 어의 수와 선택 요약을 보여주고 세션 생성 후 session 화면으로
  이동한다.
- 추천 단어, 숙련도 목표, 연속 학습 설정은 표시하지 않는다.

### 진행 화면 `/practice/{sessionId}`

- 처음에는 전체 학습 카드를 이전·다음으로 탐색한다.
- 사용자는 모든 카드를 넘기지 않아도 `기억 확인 시작`을 누를 수 있다.
- 카드 조회·음성 재생 횟수는 서버에 보내지 않는다.
- 기억 확인에서는 현재 mode의 prompt와 4개 선택지를 보여준다.
- 답 제출 뒤 선택지를 잠그고 정답 여부, 정답, 전체 뜻·발음·성조·음성을
  즉시 보여준다.
- 중복 제출을 막되 mutation 재시도는 같은 `clientAnswerId`를 사용한다.

### 결과 화면 `/practice/{sessionId}/result`

- 완료 세션의 전체 정답·오답, 방식별 정답·오답, 오답 어휘 카드만
  보여준다.
- 숙련도, 백분위, 연속 기록, 추천 CTA는 보여주지 않는다.
- 미완료 세션이면 진행 화면으로 보낸다.

화면 전용 query와 phase는 `pages/vocabulary-practice-*`가 소유하고,
세션 생성과 답 제출 mutation만 `features/start-vocabulary-practice`,
`features/answer-vocabulary-practice`로 분리한다.

## 8. 소유권과 통합 경계

기능 브랜치가 독점 소유할 수 있는 경로:

- `shared/contracts/src/learning/vocabulary-practice.ts`
- `backend/domain/src/learning/vocabulary-practice*.ts`
- `backend/database/src/schema/learning-practice.schema.ts`
- `backend/database/src/queries/drizzle-vocabulary-practice.query.ts`
- `backend/database/src/repositories/drizzle-vocabulary-practice.repository.ts`
- `backend/api/src/learning/learner-vocabulary-practice*.ts`
- `frontend/web/src/pages/vocabulary-practice-*/**`
- `frontend/web/src/features/start-vocabulary-practice/**`
- `frontend/web/src/features/answer-vocabulary-practice/**`

기능 브랜치 마지막 조립 커밋에서만 수정할 공개 barrel:

- `shared/contracts/src/index.ts`
- `backend/domain/src/index.ts`
- `backend/database/src/index.ts`

기능 브랜치가 수정하지 않고 통합 담당자에게 넘길 파일:

- `backend/api/src/app.module.ts`
- `backend/database/src/schema/index.ts`
- `backend/database/drizzle/**`
- `frontend/web/src/app/routes/**`
- `frontend/web/src/routeTree.gen.ts`
- `frontend/web/src/app/routing/learnerNavigation.ts`
- `frontend/web/src/app/routing/roleNavigation.test.tsx`
- `frontend/web/src/app/routing/routeReachability.test.ts`
- `infra/src/constructs/http-api.ts`
- `infra/test/http-api.spec.ts`
- root·workspace `package.json`, `pnpm-lock.yaml`

통합 담당자는 app 조립, schema export, 기능 단독 migration/snapshot,
세 프론트 route와 route tree, `단어 연습` navigation, API Gateway 세
route를 한 기능 통합 단계에서 반영한다.

## 9. 주요 리스크와 방지

- 다의어 모호성: vocabulary가 아니라 meaning 단위 문항으로 고정한다.
- 음성 의미 불일치: meaning-pronunciation 연결과 `READY` 상태를 검증한다.
- content 변경으로 과거 결과 변형: question과 answer에 표시 snapshot을
  저장한다.
- signed URL 만료: URL을 저장하지 않고 조회·피드백 응답마다 재발급한다.
- 단어장 변경·삭제: 세션 문항을 먼저 materialize하고 source 이름을
  snapshot으로 보존한다.
- 중복 답·동시 마지막 답: unique 제약과 session row lock transaction으로
  한 번만 완료한다.
- 정답 유출: create/get 응답은 미답 question의 `correctOptionId`,
  `isCorrect`를 포함하지 않는다.
- 후보 부족: 묵시적으로 문항 수를 줄이지 않고 409로 거부한다.
- Wave 3 추천과 충돌: 추천 출처와 추천 점수는 만들지 않고 원시 기록만
  향후 소비 가능하게 보존한다.
- 병렬 통합 충돌: app/schema/migration/routes/navigation/infra route를
  기능 브랜치에서 건드리지 않는다.

## 10. 검증

- 계약·도메인·DB·API는 Vitest 단위 테스트로 RED/GREEN을 확인한다.
- DB transaction은 격리 PostgreSQL integration test로 source 소유권,
  snapshot 저장, 중복 답 멱등성, 동시 완료를 확인한다.
- 프론트는 Vitest·Testing Library 컴포넌트 테스트로 설정, 학습 카드,
  즉시 피드백, 완료 결과와 접근성을 확인한다.
- OpenAPI와 CDK route는 통합 단계의 단위/synth 테스트로 확인한다.
- migration은 빈 DB와 최신 기존 DB upgrade에서 실행한다.
- E2E test, Playwright 설정과 API 통합 E2E는 추가하지 않는다.
