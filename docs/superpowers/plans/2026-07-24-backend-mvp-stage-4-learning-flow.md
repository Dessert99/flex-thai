# Backend MVP Stage 4 학습자 흐름 구현 계획

> **실행 규칙:** 이 계획의 Task는 `superpowers:subagent-driven-development`로
> 하나씩 순차 실행한다. 각 Task는 새 구현 에이전트가 TDD, 검증, 자체 검토,
> 커밋까지 수행하고 별도 리뷰 에이전트가 명세와 품질을 검토한다.

**Goal:** 현재 게시 문제 조회, 첫 답·재시도와 멱등 재전송, 원시 풀이 기록,
저장 문제·어휘, 오답 필터와 공용 어휘 조회를 구현해 인증된
`LEARNER | ADMIN`의 MVP 학습 흐름을 완성한다.

**Architecture:** `backend/domain/src/learning`이 append-only 답안과 멱등성,
문제 가용성, 저장 대상 가용성 규칙과 port를 소유한다. `backend/database`는
학습 schema, 답안 transaction repository와 읽기 전용 question/vocabulary
query를 구현한다. `shared/contracts/src/learning`은 정답과 storage key를
제외한 공개 Zod 계약을 소유한다. `backend/api/src/learning`은 인증 사용자,
query, use case, media URL provider를 조립하고 공개 응답으로 변환한다.

**Tech Stack:** TypeScript, Vitest, Zod, NestJS, Drizzle ORM, PostgreSQL 16,
CloudFront signed URL, Swagger/OpenAPI

---

## 확정된 Stage 4 경계

- 현재 HEAD `922c1ba`의 `questions.currentPublishedVersionId` composite FK,
  `questionVersions` 상태, `questionOptions(questionVersionId,id)` UNIQUE와
  Stage 3 publication interface를 기준으로 한다.
- 답안은 append-only이며 update/delete port와 HTTP endpoint를 만들지 않는다.
- `(userId, questionId, attemptNo)`와 `(userId, clientAttemptId)`를 DB에서
  유일하게 하고, 한 사용자의 답안 transaction은 `users` row lock으로
  직렬화한다.
- 같은 `clientAttemptId`와 같은 payload는 기존 답안을 반환하고 다른
  payload는 `ATTEMPT_IDEMPOTENCY_CONFLICT`다.
- 새 답안은 문제 `PUBLISHED`, 요청 버전이 current,
  요청 버전 `PUBLISHED`, 선택지가 요청 버전에 속할 때만 저장한다.
  숨김·무효화·퇴역·current 불일치는 `QUESTION_UNAVAILABLE`이다.
- 첫 답은 `attemptNo = 1`, 재시도는 기존 답안을 덮어쓰지 않고 다음 번호를
  사용한다.
- 무효화된 버전의 기존 답안은 원시 기록 조회에는 남지만 문제 목록의
  `firstResult` 필터에서는 제외한다. `RETIRED` 버전의 첫 답은 유지한다.
- 저장 PUT/DELETE는 멱등이다. PUT은 현재 공개 문제 또는 `PUBLISHED`
  vocabulary만 허용하고, DELETE는 대상이 나중에 숨겨져도 반복 성공한다.
- 문제 목록·상세는 현재 `PUBLISHED` question/current `PUBLISHED` version만
  반환한다. 상세와 목록에는 `isCorrect`, correct option, validation 결과,
  storage key를 포함하지 않는다.
- 문제 상세는 `EXPLANATION` block을 제출 전에 제외한다. 답안 응답만
  `correctOptionId`와 같은 version의 explanation blocks를 반환한다.
- 목록은 `page` 기본 1, `pageSize` 기본 20, 최대 100이며 stable `id`
  tie-breaker를 사용한다.
- media URL은 READY asset의 storage key를 공개 응답에 직접 넣지 않고
  `MediaReadUrlProvider`로 5분 CloudFront URL을 만든다. test/local은
  deterministic fake를 사용하고 production signer의 infra wiring은 변경하지
  않는다.
- 쓰기 body·path·query는 `shared/contracts` Zod schema로 검증한다.
- 모든 공개 operation은 Bearer 인증, LEARNER 역할 상속, 성공 응답,
  요청·응답, 400/401/403/404/409/500 오류 Swagger metadata와 OpenAPI
  document 단위 테스트를 가진다.
- 브라우저·API E2E 스펙은 만들지 않는다.

---

### Task 1: 답안·저장 콘텐츠 domain use case와 port

**Files:**

- Create: `backend/domain/src/learning/question-attempt.repository.ts`
- Create: `backend/domain/src/learning/question-attempt.ts`
- Create: `backend/domain/src/learning/question-attempt.spec.ts`
- Create: `backend/domain/src/learning/saved-content.repository.ts`
- Create: `backend/domain/src/learning/saved-content.ts`
- Create: `backend/domain/src/learning/saved-content.spec.ts`
- Create: `backend/domain/src/media/media-read-url.provider.ts`
- Modify: `backend/domain/src/index.ts`

**Produces:**

```ts
/** 학습자 쓰기 흐름의 안정적인 공개 오류 */
export class LearningDomainError extends Error {
  readonly code:
    | 'QUESTION_UNAVAILABLE'
    | 'QUESTION_OPTION_MISMATCH'
    | 'ATTEMPT_IDEMPOTENCY_CONFLICT'
    | 'VOCABULARY_UNAVAILABLE';
}

/** 네트워크 재전송과 첫 답·재시도를 원자적으로 저장한다 */
export class QuestionAttemptService {
  submit(input: SubmitQuestionAttemptInput): Promise<SubmitQuestionAttemptResult>;
}

/** 문제와 어휘 저장 연결을 멱등하게 관리한다 */
export class SavedContentService {
  saveQuestion(userId: string, questionId: string, savedAt: Date): Promise<void>;
  removeQuestion(userId: string, questionId: string): Promise<void>;
  saveVocabulary(
    userId: string,
    vocabularyId: string,
    savedAt: Date,
  ): Promise<void>;
  removeVocabulary(userId: string, vocabularyId: string): Promise<void>;
}

/** private media key를 짧은 읽기 URL로만 공개한다 */
export interface MediaReadUrlProvider {
  createReadUrl(storageKey: string, expiresAt: Date): Promise<string>;
}
```

- [ ] **Step 1: 답안 수명과 멱등성 실패 테스트를 작성한다**

`question-attempt.spec.ts`의 fake transaction은 호출 순서와 삽입 값을
기록한다.

```ts
describe('QuestionAttemptService 답안 제출', () => {
  it('첫 답은 attemptNo 1과 정답 여부를 append-only로 저장한다', async () => {});
  it('다음 제출은 기존 답을 유지하고 attemptNo를 증가시킨다', async () => {});
  it('같은 clientAttemptId와 같은 payload는 기존 답을 반환한다', async () => {});
  it('같은 clientAttemptId의 payload가 다르면 충돌한다', async () => {});
  it('숨김·무효화·current 불일치 문제에는 새 답을 저장하지 않는다', async () => {});
  it('다른 version의 선택지는 저장하지 않는다', async () => {});
});
```

Run:

```bash
pnpm exec vitest run backend/domain/src/learning/question-attempt.spec.ts
```

Expected: FAIL with module resolution error

- [ ] **Step 2: transaction port와 최소 use case를 구현한다**

`QuestionAttemptRepository.runInTransaction(userId, work)`는 adapter가
사용자 row를 잠근 뒤 callback을 실행하게 한다. transaction은 다음만
노출한다.

```ts
findByClientAttemptId(userId, clientAttemptId)
loadSubmissionTarget(questionId, questionVersionId, selectedOptionId)
readNextAttemptNo(userId, questionId)
insertAttempt(input)
loadCorrectOptionId(questionVersionId)
```

멱등 payload 비교 항목은 `questionId`, `questionVersionId`,
`selectedOptionId`, `durationMs`다. 재전송은 가용성을 다시 검사하지 않고
기존 답안과 해당 version의 정답 ID를 반환한다.

- [ ] **Step 3: 저장 문제·어휘 RED/GREEN을 완성한다**

```ts
describe('SavedContentService 저장 콘텐츠', () => {
  it('공개 문제와 게시 어휘를 중복 없이 저장한다', async () => {});
  it('숨긴 문제와 비공개 어휘는 저장하지 않는다', async () => {});
  it('삭제는 대상이 숨겨진 뒤에도 반복 성공한다', async () => {});
});
```

`SavedContentRepository`는 `isQuestionAvailable`,
`isVocabularyAvailable`, `saveQuestion`, `removeQuestion`,
`saveVocabulary`, `removeVocabulary`만 제공한다.

- [ ] **Step 4: domain 전체 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
pnpm lint
git diff --check
git add backend/domain/src
git commit -m "feat: define learner attempt lifecycle"
```

---

### Task 2: 학습 기록 schema와 additive migration

**Files:**

- Create: `backend/database/src/schema/learning.schema.ts`
- Create: `backend/database/src/schema/learning.schema.spec.ts`
- Modify: `backend/database/src/schema/index.ts`
- Create: `backend/database/drizzle/0005_learning-flow.sql`
- Create: `backend/database/drizzle/meta/0005_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`

**Tables:**

```text
question_attempts
  id, user_id, question_id, question_version_id, attempt_no,
  selected_option_id, client_attempt_id, duration_ms, is_correct, submitted_at

saved_questions
  user_id, question_id, saved_at

saved_vocabularies
  user_id, vocabulary_id, saved_at
```

- [ ] **Step 1: schema metadata 실패 테스트를 작성한다**

다음을 exact metadata로 고정한다.

- `question_attempts(user_id,question_id,attempt_no)` UNIQUE
- `question_attempts(user_id,client_attempt_id)` UNIQUE
- `(question_id,question_version_id) →
  question_versions(question_id,id) RESTRICT`
- `(question_version_id,selected_option_id) →
  question_options(question_version_id,id) RESTRICT`
- `user_id`, saved target FK 모두 RESTRICT
- `attempt_no > 0`, `duration_ms >= 0`
- saved table composite primary key
- user/submittedAt와 target 탐색 index
- append-only record에 `updatedAt`, soft-delete column이 없음

Run:

```bash
pnpm exec vitest run backend/database/src/schema/learning.schema.spec.ts
```

Expected: FAIL with missing exports

- [ ] **Step 2: 세 table을 최소 schema로 구현한다**

`questionAttempts`는 정답 여부를 제출 당시 값으로 보존한다. 답안의
question/version/option 관계는 두 composite FK로 교차 참조를 막는다.
saved table은 연결 외의 이름·폴더 기능을 만들지 않는다.

- [ ] **Step 3: Drizzle Kit으로 `0005`를 생성하고 정적 검증한다**

```bash
pnpm --filter @flex-thia/database exec drizzle-kit generate \
  --config drizzle.local.config.ts \
  --name learning-flow
```

generated SQL/snapshot을 수동 수정하지 않는다. `0000`~`0004`가 바뀌지
않고 DROP/DELETE/TRUNCATE가 없으며 target UNIQUE가 composite FK보다 먼저
생성되는지 확인한다.

- [ ] **Step 4: clean PostgreSQL 16에 `0000`~`0005`를 적용한다**

본인이 만든 임시 container에서 migration 6개, exact UNIQUE/FK/CHECK/PK를
catalog로 확인하고 exact container만 제거한다.

- [ ] **Step 5: database 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/database/src/schema backend/database/drizzle
git commit -m "feat: add learner records schema"
```

---

### Task 3: Drizzle 답안 transaction과 저장 repository

**Files:**

- Create: `backend/database/src/repositories/drizzle-learning.repository.ts`
- Create: `backend/database/src/repositories/drizzle-learning.repository.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: transaction·멱등·조건부 저장 RED를 작성한다**

fake Drizzle 테스트로 다음을 고정한다.

- `runInTransaction(userId)`가 callback 전에 ACTIVE user row를
  `FOR UPDATE`로 잠그고 결과/예외를 그대로 전달
- existing client ID row mapping과 payload 비교 입력
- target query가 question status/current version/version status와
  selected/correct option을 한 snapshot에서 읽음
- `readNextAttemptNo`가 user/question의 max+1을 계산
- insert가 모든 append-only column을 한 번에 저장
- saved PUT은 `ON CONFLICT DO NOTHING`, DELETE는 반복 0 row 허용
- question/vocabulary 가용성 조회는 `PUBLISHED`만 true

Run:

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-learning.repository.spec.ts
```

Expected: FAIL with module resolution error

- [ ] **Step 2: `DrizzleLearningRepository`를 구현한다**

하나의 class가 `QuestionAttemptRepository`와 `SavedContentRepository`를
구현한다. transaction에서 ACTIVE user row를 먼저 잠가 같은 사용자의 첫
답·재시도 번호와 client ID 확인을 직렬화한다. 예상하지 못한 0/복수 row는
안정적인 `LearningPersistenceError`로 전달한다.

- [ ] **Step 3: 실제 PostgreSQL 동시성과 멱등성을 검증한다**

clean migration DB의 최소 published question fixture로 다음을 실행한다.

- 첫 답 두 개의 동시 제출 결과 attemptNo가 1, 2
- 같은 client ID·같은 payload 동시 제출은 row 하나와 같은 응답
- 같은 client ID·다른 payload는 기존 row 유지와 domain conflict
- hidden/invalidated 전이 뒤 새 제출은 row 증가 없음
- saved PUT/DELETE 반복 호출은 연결 1/0개
- option/version 교차 FK 직접 insert 실패

- [ ] **Step 4: 전체 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm --filter @flex-thia/domain test
pnpm lint
git diff --check
git add backend/database/src/repositories backend/database/src/index.ts
git commit -m "feat: persist learner attempts atomically"
```

---

### Task 4: 학습자 공개 Zod 계약

**Files:**

- Create: `shared/contracts/src/learning/questions.ts`
- Create: `shared/contracts/src/learning/questions.spec.ts`
- Create: `shared/contracts/src/learning/vocabularies.ts`
- Create: `shared/contracts/src/learning/vocabularies.spec.ts`
- Modify: `shared/contracts/src/index.ts`

**Question contracts:**

- `questionListQuerySchema`: `skill`, `questionTypeId`, `difficulty`, `saved`,
  `firstResult`, `page`, `pageSize`
- `questionListResponseSchema`: question/type/skill/difficulty/saved/firstResult
- `questionDetailResponseSchema`: current version, public blocks/options,
  sentence feedback, READY media URL, saved; correct/validation/storage 없음
- `submitQuestionAttemptRequestSchema`: version, option, client ID, duration
- `submitQuestionAttemptResponseSchema`: attempt와 correct option/explanation
- `questionAttemptListQuerySchema`, `questionAttemptListResponseSchema`
- UUID path schemas와 공통 page metadata

**Vocabulary contracts:**

- `vocabularyListQuerySchema`: query/kind/partOfSpeech/difficulty/page/pageSize
- public summary/detail, meaning, pronunciation/audio, example sentence
- related question page
- saved vocabulary page

- [ ] **Step 1: 정상·잘못된 query/body RED를 작성한다**

page는 1 이상, pageSize는 1~100, difficulty는 1~5, duration은 0 이상의
safe integer, 모든 ID는 UUID여야 한다. unknown key는 strict object에서
거절한다.

- [ ] **Step 2: 정답·내부 정보 비노출 RED를 작성한다**

문제 list/detail schema가 `isCorrect`, `correctOptionId`,
`validationStatus`, `validationIssues`, `storageKey`를 허용하지 않는지
검증한다. `correctOptionId`와 explanation은 attempt response에서만
허용한다.

- [ ] **Step 3: 최소 Zod schema와 type export를 구현한다**

반복 sentence/block schema는 실제로 두 공개 응답에서 공유할 때만 같은
파일의 local schema로 둔다. DB/domain 타입을 import하지 않는다.

- [ ] **Step 4: contracts 전체 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/contracts typecheck
pnpm lint
git diff --check
git add shared/contracts/src
git commit -m "feat: define learner api contracts"
```

---

### Task 5: 문제 목록·상세·풀이 기록 read query

**Files:**

- Create: `backend/database/src/queries/drizzle-learner-question.query.ts`
- Create: `backend/database/src/queries/drizzle-learner-question.query.spec.ts`
- Modify: `backend/database/src/index.ts`

**Produces:**

```ts
/** API mapper가 정답 없이 문제를 직렬화할 내부 읽기 projection */
export class DrizzleLearnerQuestionQuery {
  listQuestions(userId: string, query: LearnerQuestionListQuery): Promise<...>;
  getQuestionDetail(userId: string, questionId: string): Promise<... | null>;
  listAttempts(userId: string, query: PageQuery): Promise<...>;
  getExplanation(questionVersionId: string): Promise<...>;
}
```

- [ ] **Step 1: 공개 문제 범위와 필터 RED를 작성한다**

- question/current version 모두 `PUBLISHED`
- skill/type/difficulty/saved 조건
- valid first attempt의 `CORRECT`, `INCORRECT`, `UNANSWERED`
- `INVALIDATED` attempt 제외, `RETIRED` attempt 포함
- page total과 stable order
- projection에 option `isCorrect`와 validation/storage key 공개 필드가 없음

- [ ] **Step 2: 상세 조립 RED를 작성한다**

block/문장/token/expression/option을 position 순으로 복원하고 같은 sentence를
재사용한다. 상세는 `EXPLANATION` block과 correct flag를 제외하고, internal
projection에는 API mapper가 서명할 READY media storage key만 둔다.
`getExplanation(versionId)`만 explanation blocks를 반환한다.

- [ ] **Step 3: raw attempt read와 query를 구현한다**

풀이 기록은 제출 역순과 ID tie-breaker로 page를 반환하며 invalidated
record도 보존한다. query class는 write transaction이나 업무 상태 전이를
소유하지 않는다.

- [ ] **Step 4: clean PostgreSQL projection을 검증한다**

published/hidden/draft, retired/invalidated attempts, saved/unsaved fixture로
모든 filter와 정답 비노출을 확인한다.

- [ ] **Step 5: database 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/database/src/queries backend/database/src/index.ts
git commit -m "feat: query learner questions"
```

---

### Task 6: 공용·저장 어휘와 관련 문제 read query

**Files:**

- Create: `backend/database/src/queries/drizzle-learner-vocabulary.query.ts`
- Create: `backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: 공용 어휘 검색 RED를 작성한다**

- `PUBLISHED` vocabulary만 반환
- Thai query는 `normalizeThaiSearchText` 결과를 `normalizedThai`에 적용
- 한국어 query는 meaning과 pronunciation을 case-insensitive 검색
- kind/partOfSpeech/difficulty/page filter
- meaning/pronunciation stable order와 READY media storage key

- [ ] **Step 2: 상세·예문·관련 문제 RED를 작성한다**

- detail은 meaning/pronunciation 연결과 published sentence 예문을 반환
- 예문은 현재 공개 문제에서 사용하는 frozen sentence version으로 제한
- related questions는 token 또는 expression으로 vocabulary를 참조하는
  현재 공개 문제를 중복 없이 반환
- saved vocabulary 목록은 현재 사용자 연결과 vocabulary 공개 상태를
  함께 적용

- [ ] **Step 3: `DrizzleLearnerVocabularyQuery`를 구현한다**

쓰기나 publish 규칙은 넣지 않고 query projection과 deterministic mapping만
구현한다. API에 storage key 자체를 반환하지 않고 internal media ref로
표시한다.

- [ ] **Step 4: clean PostgreSQL과 전체 검증 후 커밋한다**

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/database/src/queries backend/database/src/index.ts
git commit -m "feat: query learner vocabularies"
```

---

### Task 7: private media read URL provider와 runtime config

**Files:**

- Create: `backend/providers/src/storage/cloudfront-media-read-url.provider.ts`
- Create: `backend/providers/src/storage/cloudfront-media-read-url.provider.spec.ts`
- Create: `backend/providers/src/fakes/fake-media-read-url.provider.ts`
- Modify: `backend/providers/src/fakes/index.ts`
- Modify: `backend/providers/src/index.ts`
- Modify: `backend/providers/package.json`
- Modify: `backend/config/src/api-env.ts`
- Modify: `backend/config/src/api-env.spec.ts`

- [ ] **Step 1: 서명 URL과 경로 안전성 RED를 작성한다**

고정 RSA test key와 clock으로 URL resource, `Expires`, `Signature`,
`Key-Pair-Id`, CloudFront-safe base64를 검증한다. storage key의 `/`는
보존하고 segment의 공백·`?`·`#`는 encode하며 base URL 밖으로 나가는
`..`/빈 key를 거절한다. private key와 storage key를 오류 메시지에 넣지
않는다.

- [ ] **Step 2: production provider와 deterministic fake를 구현한다**

production provider는 `SecretsManager` secret string을 최초 호출에서 읽고
process lifetime 동안 cache한다. URL TTL은 caller가 준 5분 시각을 사용한다.
local fake는 실제 storage key가 아닌 URL-encoded opaque test path를 반환한다.

- [ ] **Step 3: application config를 검증한다**

production은 `MEDIA_CDN_BASE_URL`, `MEDIA_KEY_PAIR_ID`,
`MEDIA_PRIVATE_KEY_SECRET_ARN`을 요구한다. test/development는 fake provider
때문에 기본값만 사용한다. infra 파일은 수정하지 않는다.

- [ ] **Step 4: providers/config 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/providers test
pnpm --filter @flex-thia/providers typecheck
pnpm --filter @flex-thia/config test
pnpm --filter @flex-thia/config typecheck
pnpm lint
git diff --check
git add backend/providers backend/config
git commit -m "feat: sign learner media urls"
```

---

### Task 8: 학습자 Controller·DI·Swagger·OpenAPI 통합

**Files:**

- Create: `backend/api/src/learning/learner-content.service.ts`
- Create: `backend/api/src/learning/learner-content.service.spec.ts`
- Create: `backend/api/src/learning/learner-questions.controller.ts`
- Create: `backend/api/src/learning/learner-questions.controller.spec.ts`
- Create: `backend/api/src/learning/learner-vocabularies.controller.ts`
- Create: `backend/api/src/learning/learner-vocabularies.controller.spec.ts`
- Create: `backend/api/src/learning/learning.module.ts`
- Create: `backend/api/src/learning/learning.module.spec.ts`
- Modify: `backend/api/src/openapi/openapi.dto.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`

**Routes:**

```text
GET    /api/v1/questions
GET    /api/v1/questions/{questionId}
POST   /api/v1/questions/{questionId}/attempts
GET    /api/v1/me/question-attempts
PUT    /api/v1/me/saved-questions/{questionId}
DELETE /api/v1/me/saved-questions/{questionId}
GET    /api/v1/vocabularies
GET    /api/v1/vocabularies/{vocabularyId}
GET    /api/v1/vocabularies/{vocabularyId}/questions
GET    /api/v1/me/saved-vocabularies
PUT    /api/v1/me/saved-vocabularies/{vocabularyId}
DELETE /api/v1/me/saved-vocabularies/{vocabularyId}
```

- [ ] **Step 1: service mapper RED를 작성한다**

`LearnerContentService`가 internal storage key를 `MediaReadUrlProvider`로
5분 URL로 바꾸고, 같은 key는 응답 하나에서 한 번만 sign한다. 문제 상세는
정답·explanation·validation/storage key를 제외하고, attempt 응답에서만
correct option과 explanation을 합친다.

- [ ] **Step 2: Controller contract·guard RED를 작성한다**

각 controller 단위 테스트는:

- `CognitoAuthorizerGuard`, `ApplicationRoleGuard`, `@RequireRole('LEARNER')`
- body/path/query Zod parse
- 현재 `userId` 전달
- 201 attempt, 200 read, 204 saved PUT/DELETE
- service 결과를 response schema로 재검증
- SQL/provider를 Controller가 직접 호출하지 않음

- [ ] **Step 3: DTO·오류 mapping을 구현한다**

`LearningDomainError`는:

```text
QUESTION_UNAVAILABLE              409
QUESTION_OPTION_MISMATCH          409
ATTEMPT_IDEMPOTENCY_CONFLICT      409
VOCABULARY_UNAVAILABLE            404
```

query null은 정답이나 비공개 존재를 드러내지 않는 404
`QUESTION_NOT_FOUND`/`VOCABULARY_NOT_FOUND` Problem Details로 변환한다.

- [ ] **Step 4: `LearningModule`과 root composition을 구현한다**

현재 local/data-api database 하나로 `DrizzleLearningRepository`,
question/vocabulary query를 조립한다. nonproduction은 fake media provider,
production은 CloudFront provider를 사용한다. 기존 Identity module/health와
legacy jobs/uploads 비활성 상태를 보존한다.

- [ ] **Step 5: Swagger/OpenAPI document RED/GREEN을 완성한다**

모든 route operation에 다음을 둔다.

- `@ApiBearerAuth('accessToken')`
- request body/query/path와 success DTO
- 400, 401, 403, 404/409, 500 Problem Details
- saved 204는 response body 없음

OpenAPI test는 distinct path 19개, learner path의 Bearer security, attempt
request/response, list query, problem response media type, detail schema의
정답/internal field 부재를 검사한다.

- [ ] **Step 6: API와 root 전체 검증 후 커밋한다**

```bash
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/api typecheck
pnpm --filter @flex-thia/contracts test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git add backend/api
git commit -m "feat: expose learner mvp api"
```

---

## Stage 4 전체 검증

Task 8 리뷰 승인 뒤 Stage 4 시작 commit부터 전체 변경 리뷰를 수행하고
Critical/Important를 모두 수정·재검토한다. 그 다음 최종 HEAD에서 실행한다.

```bash
pnpm structure:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git status --short
```

Expected:

- 변경 파일 Prettier와 `git diff --check` 통과
- clean PostgreSQL 16 migration 6개 통과
- 동시 first/retry, idempotent replay/conflict, unavailable submission,
  saved PUT/DELETE, firstResult filter integration 통과
- 공개 learner operation 12개가 요청·응답·Bearer·Problem Swagger와
  OpenAPI document 테스트를 가짐
- 문제 조회 응답에 correct flag, validation 결과, storage key가 없음
- 전체 테스트·lint·typecheck·build exit 0
- 작업 트리 clean
