# Vocabulary Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공용 검색 선택 또는 내 단어장에서 선택형 단어 연습을 만들고, 즉시 피드백·완료 결과와 append-only 원시 기록을 제공한다.

**Architecture:** `learning` 안에 `vocabulary-practice` 세로 slice를 추가한다. 서버가 source를 검증하고 meaning 단위 4지선다 snapshot을 materialize하며, 답안 transaction이 멱등 insert와 세션 완료를 함께 처리한다. 프론트는 설정·진행·결과 Page와 세션 생성·답 제출 Feature만 소유한다.

**Tech Stack:** TypeScript, Zod, NestJS, Drizzle ORM/PostgreSQL, Vite React, TanStack Query/Router, Tailwind CSS, shadcn UI, Vitest, Testing Library

## Global Constraints

- 기준: `docs/superpowers/specs/2026-07-26-vocabulary-practice-design.md`.
- 추천·숙련도·진도·연속 학습·카드 조회·음성 재생 횟수는 만들지 않는다.
- 외부 패키지·환경 변수·AWS 리소스와 E2E artifact를 추가하지 않는다.
- 테스트 설명은 한국어, 새 파일은 헤더 주석, 새·수정 export는 한 줄 JSDoc을 사용한다.
- 기능 브랜치는 app/schema/migration/routes/navigation/infra 조립 파일을 수정하지 않는다.

## Ownership

기능 브랜치 독점 경로:

```text
shared/contracts/src/learning/vocabulary-practice*
backend/domain/src/learning/vocabulary-practice*
backend/database/src/schema/learning-practice.schema*
backend/database/src/{queries,repositories}/drizzle-vocabulary-practice*
backend/api/src/learning/{learner-vocabulary-practice*,vocabulary-practice.module.ts}
frontend/web/src/pages/vocabulary-practice-*/**
frontend/web/src/features/{start,answer}-vocabulary-practice/**
```

기능 브랜치 마지막에만 수정하는 barrel:

```text
shared/contracts/src/index.ts
backend/domain/src/index.ts
backend/database/src/index.ts
```

통합 담당자 전용:

```text
backend/api/src/app.module.ts
backend/database/src/schema/index.ts
backend/database/drizzle/**
frontend/web/src/app/routes/**
frontend/web/src/routeTree.gen.ts
frontend/web/src/app/routing/{learnerNavigation,roleNavigation.test,routeReachability.test}.ts*
infra/src/constructs/http-api.ts
infra/test/http-api.spec.ts
package.json
pnpm-lock.yaml
```

---

### Task 1: 공개 계약

**Files:**

- Create: `shared/contracts/src/learning/vocabulary-practice.ts`
- Create: `shared/contracts/src/learning/vocabulary-practice.spec.ts`
- Modify last: `shared/contracts/src/index.ts`

**Interfaces:**

```ts
type PracticeMode =
  | 'THAI_TO_MEANING'
  | 'MEANING_TO_THAI'
  | 'AUDIO_TO_THAI'
  | 'AUDIO_TO_MEANING';
type PracticeSource =
  | { type: 'SEARCH_SELECTION'; vocabularyIds: string[] }
  | { type: 'WORDBOOK'; wordbookId: string };
interface CreateVocabularyPracticeRequest {
  source: PracticeSource;
  modes: PracticeMode[];
  questionCount: 10 | 20 | 'ALL';
  order: 'RANDOM' | 'SOURCE';
}
interface SubmitVocabularyPracticeAnswerRequest {
  clientAnswerId: string;
  selectedOptionId: string;
}
```

Produces:
`createVocabularyPracticeRequestSchema`,
`submitVocabularyPracticeAnswerRequestSchema`, `practiceCardSchema`,
`practiceQuestionSchema`, `vocabularyPracticeSessionResponseSchema`,
`vocabularyPracticeAnswerResponseSchema`와 각 inferred type.

- [ ] **RED: strict request와 정답 비노출 테스트를 작성한다**

```ts
it('중복 source ID·빈 mode·지원하지 않는 문항 수를 거부한다', () => {
  expect(() => createVocabularyPracticeRequestSchema.parse(invalid)).toThrow();
});
it('미답 문항은 correctOptionId를 공개하지 않는다', () => {
  expect(practiceQuestionSchema.safeParse(leakedQuestion).success).toBe(false);
});
```

- [ ] **RED 명령을 실행한다**

Run:
`pnpm exec vitest run shared/contracts/src/learning/vocabulary-practice.spec.ts`

Expected: FAIL — schema가 없다.

- [ ] **GREEN: discriminated source와 session status 계약을 구현한다**

`SEARCH_SELECTION.vocabularyIds`는 중복 없이 1~100개,
`modes`는 중복 없이 1~4개다. question은 4개 `{id,label}` option과
TEXT/AUDIO prompt만 공개한다. session은 `ACTIVE`면 result를 금지하고
`COMPLETED`면 전체·mode별 count와 `incorrectCards` result를 필수로 한다.

- [ ] **GREEN 명령을 실행한다**

```bash
pnpm exec vitest run shared/contracts/src/learning/vocabulary-practice.spec.ts
pnpm --filter @flex-thia/contracts typecheck
```

Expected: PASS.

---

### Task 2: 도메인 문항 생성과 상태 전이

**Files:**

- Create: `backend/domain/src/learning/vocabulary-practice.repository.ts`
- Create: `backend/domain/src/learning/vocabulary-practice.ts`
- Create: `backend/domain/src/learning/vocabulary-practice.spec.ts`
- Modify last: `backend/domain/src/index.ts`

**Interfaces:**

```ts
interface PracticeMeaningCandidate {
  vocabularyId: string;
  thai: string;
  meaningId: string;
  meaningKo: string;
  pronunciations: Array<{
    id: string;
    pronunciationKo: string;
    toneMarks: string;
    mediaAssetId: string;
    storageKey: string;
  }>;
  card: PracticeCardSnapshot;
}
interface VocabularyPracticeRepository {
  loadSource(input: CreateVocabularyPracticeInput): Promise<PracticeSourceRecord | null>;
  createSession(input: MaterializedPracticeSession): Promise<PracticeSessionRecord>;
  getSession(userId: string, sessionId: string): Promise<PracticeSessionRecord | null>;
  submitAnswer(input: SubmitPracticeAnswerInput): Promise<SubmitPracticeAnswerResult>;
}
class VocabularyPracticeService {
  create(input: CreateVocabularyPracticeInput): Promise<PracticeSessionRecord>;
  get(userId: string, sessionId: string): Promise<PracticeSessionRecord>;
  answer(input: AnswerVocabularyPracticeInput): Promise<PracticeAnswerFeedback>;
}
```

- [ ] **RED: 네 mode와 후보 부족 테스트를 작성한다**

```ts
it.each(practiceModes)('%s를 meaning 단위 4지선다로 만든다', async (mode) => {
  const result = await service.create({ ...input, modes: [mode] });
  expect(result.questions[0]?.options).toHaveLength(4);
});
it('후보가 부족하면 문항 수를 줄이지 않는다', async () => {
  await expect(service.create(input)).rejects.toMatchObject({
    code: 'PRACTICE_SOURCE_INSUFFICIENT',
  });
});
```

- [ ] **RED 명령을 실행한다**

Run:
`pnpm exec vitest run backend/domain/src/learning/vocabulary-practice.spec.ts`

Expected: FAIL — service와 port가 없다.

- [ ] **GREEN: ID·clock·shuffle 주입형 service를 구현한다**

```ts
interface VocabularyPracticeDependencies {
  repository: VocabularyPracticeRepository;
  createId: () => string;
  now: () => Date;
  shuffle: <T>(items: readonly T[]) => T[];
}
```

SOURCE는 원순서, RANDOM만 shuffle을 사용한다. mode는 round-robin으로
배정한다. audio mode는 meaning과 연결된 READY pronunciation만 사용한다.
option label은 4개 모두 고유해야 한다.

- [ ] **GREEN: source 없음·잘못된 option·완료 session 오류까지 검증한다**

오류 code:
`PRACTICE_SOURCE_NOT_FOUND`, `PRACTICE_SOURCE_INSUFFICIENT`,
`PRACTICE_SESSION_NOT_FOUND`, `PRACTICE_OPTION_INVALID`,
`PRACTICE_SESSION_COMPLETED`.

Run:

```bash
pnpm exec vitest run backend/domain/src/learning/vocabulary-practice.spec.ts
pnpm --filter @flex-thia/domain typecheck
```

Expected: PASS.

---

### Task 3: 기능 전용 schema와 PostgreSQL adapter

**Files:**

- Create: `backend/database/src/schema/learning-practice.schema.ts`
- Create: `backend/database/src/schema/learning-practice.schema.spec.ts`
- Create: `backend/database/src/queries/drizzle-vocabulary-practice.query.ts`
- Create: `backend/database/src/queries/drizzle-vocabulary-practice.query.spec.ts`
- Create: `backend/database/src/repositories/drizzle-vocabulary-practice.repository.ts`
- Create: `backend/database/src/repositories/drizzle-vocabulary-practice.repository.spec.ts`
- Create: `backend/database/src/repositories/drizzle-vocabulary-practice.repository.integration.spec.ts`
- Modify last: `backend/database/src/index.ts`
- Do not modify: schema index, `drizzle/**`

**Interfaces:**

```ts
class DrizzleVocabularyPracticeQuery {
  loadSearchSelection(userId: string, ids: string[]): Promise<PracticeSourceRecord>;
  loadWordbook(userId: string, wordbookId: string): Promise<PracticeSourceRecord | null>;
  getSession(userId: string, sessionId: string): Promise<PracticeSessionProjection | null>;
}
class DrizzleVocabularyPracticeRepository
  implements VocabularyPracticeRepository {}
```

- [ ] **RED: schema 무결성 테스트를 작성한다**

세 table:
`vocabulary_practice_sessions`, `vocabulary_practice_questions`,
`vocabulary_practice_answers`.

필수 제약:

```text
sessions: source 조합, question_count 1..100, status/completed_at 일치
questions: UNIQUE(session_id, position), UNIQUE(session_id, id)
answers: UNIQUE(session_id, question_id), UNIQUE(user_id, client_answer_id)
answers: composite FK(question_id, session_id)
audio question: pronunciation_id/media_asset_id 필수
```

- [ ] **RED 명령을 실행한다**

Run:
`pnpm exec vitest run backend/database/src/schema/learning-practice.schema.spec.ts`

Expected: FAIL — schema가 없다.

- [ ] **GREEN: `learning-practice.schema.ts`를 구현한다**

세션 source wordbook FK만 `ON DELETE SET NULL`, 콘텐츠와 학습 기록 FK는
`RESTRICT`다. question `options`는
`Array<{id:string;label:string}>` JSON snapshot이고 `correctOptionId`는
서버 전용 UUID다. answer는 insert-only다.

- [ ] **RED: source SQL과 답 transaction 테스트를 작성한다**

```ts
it('단어장 소유권·PUBLISHED·READY·meaning pronunciation 연결을 검증한다', async () => {
  expect(sqlText).toMatch(/PUBLISHED[\s\S]+READY/u);
});
it('같은 clientAnswerId 재전송은 answer를 늘리지 않는다', async () => {
  await repository.submitAnswer(answer);
  await repository.submitAnswer(answer);
  expect(await countAnswers()).toBe(1);
});
```

- [ ] **GREEN: query와 transaction repository를 구현한다**

WORDBOOK은 `added_at ASC, vocabulary_id ASC`, SEARCH_SELECTION은 요청 ID
순서를 복원한다. session+questions는 한 transaction으로 insert한다.
답 제출은 현재 user의 ACTIVE session/question을 `FOR UPDATE`로 잠그고
option membership 확인, 멱등 answer insert, 마지막 답 session 완료를
한 transaction에서 처리한다.

- [ ] **GREEN unit 명령을 실행한다**

```bash
pnpm exec vitest run \
  backend/database/src/schema/learning-practice.schema.spec.ts \
  backend/database/src/queries/drizzle-vocabulary-practice.query.spec.ts \
  backend/database/src/repositories/drizzle-vocabulary-practice.repository.spec.ts
pnpm --filter @flex-thia/database typecheck
```

Expected: PASS.

- [ ] **격리 PostgreSQL transaction을 검증한다**

```bash
VOCABULARY_PRACTICE_TEST_DATABASE_URL="$VOCABULARY_PRACTICE_TEST_DATABASE_URL" \
pnpm exec vitest run \
  backend/database/src/repositories/drizzle-vocabulary-practice.repository.integration.spec.ts
```

Expected: PASS — source 소유권, snapshot, retry 멱등, 동시 마지막 답이
검증된다. 공용·운영 DB는 사용하지 않는다.

---

### Task 4: NestJS service·Controller

**Files:**

- Create: `backend/api/src/learning/learner-vocabulary-practice.service.ts`
- Create: `backend/api/src/learning/learner-vocabulary-practice.service.spec.ts`
- Create: `backend/api/src/learning/learner-vocabulary-practice.controller.ts`
- Create: `backend/api/src/learning/learner-vocabulary-practice.controller.spec.ts`
- Create: `backend/api/src/learning/vocabulary-practice.module.ts`
- Do not modify: `backend/api/src/app.module.ts`

**Interfaces:**

```ts
class LearnerVocabularyPracticeService {
  create(userId: string, request: CreateVocabularyPracticeRequest):
    Promise<VocabularyPracticeSessionResponse>;
  get(userId: string, sessionId: string):
    Promise<VocabularyPracticeSessionResponse>;
  answer(userId: string, sessionId: string, questionId: string,
    request: SubmitVocabularyPracticeAnswerRequest):
    Promise<VocabularyPracticeAnswerResponse>;
}
```

- [ ] **RED: strict 응답·signed URL·정답 비노출 테스트를 작성한다**

```ts
it('storage key를 제외하고 응답마다 5분 signed URL을 만든다', async () => {
  const result = await service.get(userId, sessionId);
  expect(JSON.stringify(result)).not.toContain('storageKey');
  expect(result.cards[0]?.pronunciations[0]?.audioUrl).toMatch(/^https:/u);
});
```

- [ ] **RED 명령을 실행한다**

Run:
`pnpm exec vitest run backend/api/src/learning/learner-vocabulary-practice.service.spec.ts`

Expected: FAIL — service가 없다.

- [ ] **GREEN: mapper와 독립 module을 구현한다**

`MediaReadUrlProvider`로 조회·피드백마다 URL을 발급한다. 미답 question에는
정답을 넣지 않고 completed projection만 result를 갖게 contracts schema로
parse한다. `VocabularyPracticeModule.register`가 domain service와 signer를
Controller에 주입한다.

- [ ] **RED/GREEN: 세 route와 Swagger metadata를 구현한다**

```text
POST /me/vocabulary-practice/sessions
GET /me/vocabulary-practice/sessions/:sessionId
POST /me/vocabulary-practice/sessions/:sessionId/questions/:questionId/answers
```

Controller는 `@CurrentUser()` userId, contracts body/path parse,
정상·400·401·404·409 metadata를 제공한다.

Run:

```bash
pnpm exec vitest run \
  backend/api/src/learning/learner-vocabulary-practice.service.spec.ts \
  backend/api/src/learning/learner-vocabulary-practice.controller.spec.ts
pnpm --filter @flex-thia/api typecheck
```

Expected: PASS. app module에는 아직 연결하지 않는다.

---

### Task 5: 설정 화면

**Files:**

- Create: `frontend/web/src/features/start-vocabulary-practice/**`
- Create: `frontend/web/src/pages/vocabulary-practice-setup/**`
- Do not modify: app routes, route tree, navigation

**Interfaces:**

```ts
interface PracticeSetupFormProps {
  wordbooks: WordbookSummary[];
  searchResults: VocabularySummary[];
  onSearch: (query: string) => void;
  onStart: (request: CreateVocabularyPracticeRequest) => Promise<void>;
  onCreated: (sessionId: string) => void;
}
```

- [ ] **RED: source·mode·count·order 접근성 테스트를 작성한다**

```tsx
it('출처와 한 개 이상 방식을 요구한다', async () => {
  render(<PracticeSetupForm {...props} />);
  await user.click(screen.getByRole('button', { name: '연습 시작' }));
  expect(screen.getByText('연습할 출처를 선택해 주세요.')).toBeVisible();
  expect(screen.getByText('기억 확인 방식을 선택해 주세요.')).toBeVisible();
});
```

- [ ] **RED 명령을 실행한다**

Run:
`pnpm --filter @flex-thia/web exec vitest run src/features/start-vocabulary-practice`

Expected: FAIL — form이 없다.

- [ ] **GREEN: 기존 목록 API와 생성 mutation을 연결한다**

`GET /vocabularies?page=1&pageSize=100&query=...`,
`GET /me/wordbooks`를 재사용한다. RadioGroup/Button으로 source, modes,
10·20·전체, SOURCE·RANDOM을 구성한다. 추천·숙련도 설정은 없다.
`POST /me/vocabulary-practice/sessions` 성공 시 `onCreated(id)`를 호출한다.

- [ ] **GREEN 명령을 실행한다**

```bash
pnpm --filter @flex-thia/web exec vitest run \
  src/features/start-vocabulary-practice \
  src/pages/vocabulary-practice-setup
pnpm --filter @flex-thia/web typecheck
pnpm --filter @flex-thia/web architecture:check
```

Expected: PASS.

---

### Task 6: 진행·즉시 피드백·결과 화면

**Files:**

- Create: `frontend/web/src/features/answer-vocabulary-practice/**`
- Create: `frontend/web/src/pages/vocabulary-practice-session/**`
- Create: `frontend/web/src/pages/vocabulary-practice-result/**`

**Interfaces:**

```ts
type PracticePhase = 'STUDY' | 'QUIZ';
interface PracticeQuestionProps {
  question: PracticeQuestion;
  feedback?: VocabularyPracticeAnswerResponse;
  onAnswer: (optionId: string, clientAnswerId: string) => Promise<void>;
  onNext: () => void;
}
```

- [ ] **RED: 전체 카드와 조기 기억 확인 테스트를 작성한다**

```tsx
it('카드를 모두 넘기지 않아도 기억 확인을 시작한다', async () => {
  render(<VocabularyPracticeSessionPage session={session} />);
  expect(screen.getByText('교육')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '기억 확인 시작' }));
  expect(screen.getByText('1 / 10')).toBeVisible();
});
```

- [ ] **RED: 답 잠금·즉시 피드백·완료 결과 테스트를 작성한다**

```tsx
it('답 제출 뒤 정답 여부와 전체 카드를 즉시 공개한다', async () => {
  await user.click(screen.getByRole('button', { name: '답 제출' }));
  expect(await screen.findByText('정답입니다.')).toBeVisible();
});
it('결과에는 count와 오답 카드만 있고 숙련도는 없다', () => {
  expect(screen.queryByText(/숙련도|연속 학습|백분위/u)).toBeNull();
});
```

- [ ] **RED 명령을 실행한다**

Run:
`pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-practice-session src/pages/vocabulary-practice-result`

Expected: FAIL — Page가 없다.

- [ ] **GREEN: study/quiz phase와 answer mutation을 구현한다**

학습 카드는 모든 뜻·발음·성조와 `useThaiAudioPlayback` 음성을 제공한다.
카드 view/audio count는 전송하지 않는다. 답 mutation은 retry 동안 같은
`clientAnswerId`를 유지하고, feedback 전에는 정답 class/label을 표시하지
않는다. 완료 result는 전체·mode별 count와 오답 카드만 렌더링한다.

- [ ] **GREEN 명령을 실행한다**

```bash
pnpm --filter @flex-thia/web exec vitest run \
  src/features/answer-vocabulary-practice \
  src/pages/vocabulary-practice-session \
  src/pages/vocabulary-practice-result
pnpm --filter @flex-thia/web typecheck
pnpm --filter @flex-thia/web architecture:check
```

Expected: PASS.

---

### Task 7: 기능 gate와 통합 handoff

**Files modified in branch:** 세 package barrel만 마지막에 연결한다.

- [ ] **barrel export를 연결한다**

```ts
// contracts
export * from './learning/vocabulary-practice.js';
// domain
export * from './learning/vocabulary-practice.js';
export * from './learning/vocabulary-practice.repository.js';
// database
export * from './queries/drizzle-vocabulary-practice.query.js';
export * from './repositories/drizzle-vocabulary-practice.repository.js';
```

- [ ] **기능 브랜치 gate를 실행한다**

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/web test
pnpm structure:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @flex-thia/web architecture:check
pnpm --filter @flex-thia/web coverage
pnpm --filter @flex-thia/web build
```

Expected: 모두 exit 0. 금지 공통 파일은 변경되지 않는다.

- [ ] **통합 담당자가 schema/app/routes를 연결한다**

1. schema index export와 app module dependency 조립
2. practice enum·세 table만 포함한 migration 생성
3. 빈 DB와 최신 기존 DB upgrade
4. `/practice`, `/practice/$sessionId`,
   `/practice/$sessionId/result` route source와 route tree 생성
5. learner navigation에 `{href:'/practice', label:'단어 연습'}` 추가
6. API Gateway에 Controller의 세 JWT route 추가

- [ ] **통합 RED/GREEN을 실행한다**

```bash
pnpm --filter @flex-thia/database db:generate
DATABASE_URL="$EMPTY_DATABASE_URL" pnpm --filter @flex-thia/database db:migrate:local
DATABASE_URL="$UPGRADE_DATABASE_URL" pnpm --filter @flex-thia/database db:migrate:local
pnpm exec vitest run frontend/web/src/app/routing/routeReachability.test.ts
pnpm --filter @flex-thia/infra test
pnpm --filter @flex-thia/infra synth
pnpm check
```

Expected: migration이 두 DB에서 통과하고, 세 frontend route와 세 JWT API
route가 존재하며, 전체 품질 gate가 exit 0이다.
