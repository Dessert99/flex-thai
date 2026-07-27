# Wave 5 AI Question Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 활성 문제 유형 설정과 어휘 정책을 바탕으로 신규 문제 후보를 생성·검증하고, 관리자 승인·폐기·재생성을 멱등하게 수행할 backend 기능을 완성한다.

**Architecture:** 기존 content-production job/item/lease와 provider run lifecycle을 재사용하고, AI 문제 생성 전용 domain port·candidate schema·processor·관리 API를 leaf module로 추가한다. 외부 provider는 연결하지 않으며 deterministic fake와 실제 Drizzle adapter까지 구현한다. nullable DRAFT audio, runtime DI, migration과 공용 export는 통합 브랜치가 조립한다.

**Tech Stack:** TypeScript 6, NestJS 11, Zod, Drizzle ORM, PostgreSQL 16, Vitest

## Global Constraints

- 코드 기준선은 local `main`의 `e98cba6`이며 승인 설계 `54d25e8`을 포함한 공통 계획 commit에서 branch를 만든다.
- `docs/superpowers/specs/2026-07-27-wave5-parallel-delivery-design.md`를 기능 요구의 단일 기준으로 사용한다.
- 새 파일·수정 export는 `conventions/comment-convention.md`를 따른다.
- Vitest/Jest의 `describe`, `it`, `test` 설명은 한국어로 작성한다.
- browser/API E2E와 신규 E2E runner는 추가하지 않는다.
- 신규 package, 외부 네트워크, credential, 유료 호출을 추가하지 않는다.
- 생성 model과 교차 검증 model ID가 같으면 provider 호출 전에 거절한다.
- 후보를 자동 게시하지 않는다.
- provider raw payload, prompt 본문, storage key와 원문 전체를 API·audit에 노출하지 않는다.
- 공용 barrel, AppModule, OpenAPI 목록, infra route, migration과 root package 파일은 수정하지 않는다.

---

## Ownership

**Create/modify:**

- `backend/domain/src/content-production/ai-question-production.ts`
- `backend/domain/src/content-production/ai-question-production.spec.ts`
- `backend/database/src/schema/ai-question-production.schema.ts`
- `backend/database/src/schema/ai-question-production.schema.spec.ts`
- `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.ts`
- `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`
- `backend/database/src/queries/drizzle-question-production-context.query.ts`
- `backend/database/src/queries/drizzle-question-production-context.query.spec.ts`
- `backend/providers/src/fakes/fake-question-generation.provider.ts`
- `backend/providers/src/fakes/fake-question-generation.provider.spec.ts`
- `backend/providers/src/fakes/fake-question-cross-validation.provider.ts`
- `backend/providers/src/fakes/fake-question-cross-validation.provider.spec.ts`
- `backend/worker/src/content-production/ai-question-production.processor.ts`
- `backend/worker/src/content-production/ai-question-production.processor.spec.ts`
- `shared/contracts/src/content-production/question-production.ts`
- `shared/contracts/src/content-production/question-production.spec.ts`
- `backend/api/src/content-production/question-production.dto.ts`
- `backend/api/src/content-production/question-production.service.ts`
- `backend/api/src/content-production/question-production.service.spec.ts`
- `backend/api/src/content-production/question-production.controller.ts`
- `backend/api/src/content-production/question-production.controller.spec.ts`
- feature-local `index.ts` only when it already exists

**Do not modify:**

- `backend/database/src/schema/index.ts`
- workspace root barrels
- `backend/database/drizzle/**`
- `backend/worker/src/content-production/content-production-dispatcher.ts`
- `backend/api/src/app.module.ts`
- `backend/api/src/openapi/**`
- `infra/**`
- every `package.json` and `pnpm-lock.yaml`
- `backend/domain/src/media/**`
- `frontend/**`

## Fixed interfaces

```ts
type QuestionCandidateGroup = 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
type QuestionCandidateReviewStatus = 'PENDING' | 'APPROVED' | 'DISCARDED';
type QuestionValidationStage =
  | 'SCHEMA'
  | 'DECISION_RULE'
  | 'SIMILARITY'
  | 'AI_CROSS_VALIDATION';

type GeneratedQuestionSentenceInput = Omit<
  CanonicalDraftSentenceInput,
  'mediaAssetId'
>;

type GeneratedQuestionOptionInput =
  | {
      clientRef: string;
      position: number;
      sentence: GeneratedQuestionSentenceInput;
      span: null;
    }
  | {
      clientRef: string;
      position: number;
      sentence: null;
      span: {
        blockPosition: number;
        sentencePosition: number;
        startTokenIndex: number;
        endTokenIndex: number;
      };
    };

interface GeneratedQuestionPayload {
  questionTypeSlug: string;
  questionTypeVersion: number;
  difficulty: number;
  topicSlug: string;
  tagSlugs: string[];
  blocks: Array<{
    kind:
      | 'INSTRUCTION'
      | 'PASSAGE'
      | 'DIALOGUE'
      | 'QUESTION'
      | 'EXPLANATION';
    displayMode: 'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO' | 'AUDIO_THEN_REVEAL';
    sentences: Array<{
      speaker: string | null;
      sentence: GeneratedQuestionSentenceInput;
    }>;
  }>;
  options: GeneratedQuestionOptionInput[];
  correctOptionRef: string;
}

interface GeneratedQuestionCandidate {
  questionTypeVersionId: string;
  topicId: string;
  tagIds: string[];
  difficulty: number;
  payload: GeneratedQuestionPayload;
}

interface QuestionProductionCandidateRecord {
  ordinal: number;
  candidate: GeneratedQuestionCandidate;
  payloadHash: string;
  resultGroup: QuestionCandidateGroup;
  reviewStatus: QuestionCandidateReviewStatus;
  reviewCode: string | null;
  regeneratedFromCandidateId: string | null;
}

interface QuestionProductionArtifacts {
  kind: 'QUESTION_CANDIDATES';
  candidates: QuestionProductionCandidateRecord[];
  validations: QuestionProductionValidationRecord[];
}

interface QuestionGenerationPrompt {
  promptVersion: string;
  sections: Array<{ name: string; content: unknown }>;
  outputSchema: Record<string, unknown>;
}

interface QuestionGenerationInput {
  prompt: QuestionGenerationPrompt;
  preset: ContentProductionPresetSnapshot;
  signal: AbortSignal;
}

interface QuestionGenerationResult {
  candidates: GeneratedQuestionCandidate[];
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
}

interface QuestionCrossValidationInput {
  candidate: GeneratedQuestionCandidate;
  promptVersion: string;
  signal: AbortSignal;
}

interface QuestionCrossValidationResult {
  status: 'PASSED' | 'FAILED';
  code: string | null;
  evidence: Record<string, unknown>;
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
}

interface QuestionSimilarityMatch {
  questionVersionId: string;
  score: number;
  summary: string;
}

interface QuestionProductionValidationRecord {
  candidateOrdinal: number;
  stage: QuestionValidationStage;
  status: 'PASSED' | 'FAILED';
  code: string | null;
  details: Record<string, unknown>;
}

interface ReviewCommand {
  candidateId: string;
  expectedRevision: number;
  actorUserId: string;
  actorSub: string;
  requestId: string;
  occurredAt: Date;
}

type DiscardQuestionCandidateInput = ReviewCommand;
type RegenerateQuestionCandidateInput = ReviewCommand;
type ApproveQuestionCandidateInput = ReviewCommand;

interface ApprovedQuestionDraft {
  questionId: string;
  questionVersionId: string;
  candidateId: string;
}
```

`GeneratedQuestionPayload`은 clientRef 기반 sentence/block/option graph이며
media ID를 포함하지 않는다. 승인 시 통합 브랜치의
`GeneratedQuestionDraftRepository`가 nullable audio DRAFT graph로 변환한다.

### Task 1: Pure candidate model and ports

**Files:**

- Create: `backend/domain/src/content-production/ai-question-production.ts`
- Test: `backend/domain/src/content-production/ai-question-production.spec.ts`

**Interfaces:**

- Consumes: `ContentProductionWorkItem`, `ContentProductionPresetSnapshot`
- Produces:

```ts
interface QuestionProductionContextRepository {
  load(input: {
    preset: ContentProductionPresetSnapshot;
    operation: 'QUESTION_GENERATION';
  }): Promise<QuestionProductionContext>;
}
interface QuestionGenerationProvider {
  generate(input: QuestionGenerationInput): Promise<QuestionGenerationResult>;
}
interface QuestionCrossValidationProvider {
  validate(
    input: QuestionCrossValidationInput,
  ): Promise<QuestionCrossValidationResult>;
}
interface QuestionSimilarityLookup {
  findSimilar(
    candidate: GeneratedQuestionCandidate,
    limit: 5,
  ): Promise<QuestionSimilarityMatch[]>;
}
interface GeneratedQuestionDraftRepository {
  approve(input: ApproveQuestionCandidateInput): Promise<
    | { kind: 'APPROVED'; questionId: string; questionVersionId: string }
    | { kind: 'ALREADY_APPROVED'; questionId: string; questionVersionId: string }
    | { kind: 'CONFLICT' }
  >;
  discard(input: DiscardQuestionCandidateInput): Promise<boolean>;
  requestRegeneration(
    input: RegenerateQuestionCandidateInput,
  ): Promise<{ jobId: string; attempt: number }>;
}
```

- [ ] **Step 1: Write failing domain table tests**

  다음 case를 고정한다.

  ```ts
  it.each([
    ['schema 실패', 'FAILED', 'QUESTION_SCHEMA_INVALID'],
    ['결정 규칙 실패', 'FAILED', 'QUESTION_RULE_INVALID'],
    ['유사도 경고', 'NEEDS_ATTENTION', 'QUESTION_SIMILARITY_REVIEW'],
    ['교차 검증 불일치', 'NEEDS_ATTENTION', 'QUESTION_CROSS_VALIDATION_FAILED'],
    ['모든 검증 통과', 'NORMAL', null],
  ] as const)('%s 후보 그룹을 계산한다', (_label, group, code) => {
    expect(classifyQuestionCandidate(makeValidationFixture(code))).toEqual({
      group,
      code,
    });
  });
  ```

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts`

  Expected: module과 분류 함수가 없어 FAIL.

- [ ] **Step 3: Implement minimal domain types and pure rules**

  `classifyQuestionCandidate`, `validateGeneratedQuestionSchema`,
  `validateQuestionDecisionRules`, `assertDistinctValidationModels`와 위 port를
  구현한다.

- [ ] **Step 4: Verify Green**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts && pnpm --filter @flex-thia/domain typecheck`

- [ ] **Step 5: Commit**

  `git commit -m "feat(content-production): define AI question rules"`

### Task 2: Prompt assembly and taxonomy completeness

**Files:**

- Modify: `backend/domain/src/content-production/ai-question-production.ts`
- Test: `backend/domain/src/content-production/ai-question-production.spec.ts`

**Interfaces:**

- Consumes:

```ts
interface QuestionProductionContext {
  commonPrinciples: string[];
  typeVersion: {
    id: string;
    slug: string;
    version: number;
    template: QuestionTemplate;
    structureRules: Record<string, unknown>;
    generationRules: Record<string, unknown>;
  };
  difficultyCriteria: Array<{ difficulty: number; criteria: string }>;
  approvedExamples: Array<{ title: string; payload: unknown }>;
  targetVocabulary: QuestionPromptVocabulary[];
  requiredVocabulary: QuestionPromptVocabulary[];
  excludedVocabulary: QuestionPromptVocabulary[];
  similarQuestions: QuestionSimilaritySummary[];
  additionalInstructionKo: string | null;
}
```

- Produces:

```ts
function buildQuestionGenerationPrompt(
  context: QuestionProductionContext,
): QuestionGenerationPrompt;
```

- [ ] **Step 1: Write failing prompt tests**

  활성 유형 규칙, 선택 난이도 기준, 승인 예시, 목표·필수·제외 어휘,
  유사 문제 요약, output schema와 한국어 추가 지시가 stable section
  순서로 포함되는지 검증한다.

- [ ] **Step 2: Add incomplete taxonomy tests**

  기준 1~5 중 선택 난이도 기준이 없거나 승인 예시가 0개면
  `QUESTION_TAXONOMY_INCOMPLETE`이고 generation provider가 호출되지 않는
  contract를 고정한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts`

- [ ] **Step 4: Implement deterministic prompt builder**

  JSON serialization은 sorted key helper를 사용하고 prompt version을
  명시적으로 반환한다. private input key와 원문 전체는 prompt context
  type에 넣지 않는다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts`

  Commit:
  `git commit -m "feat(content-production): assemble question prompts"`

### Task 3: Candidate and validation schema

**Files:**

- Create: `backend/database/src/schema/ai-question-production.schema.ts`
- Test: `backend/database/src/schema/ai-question-production.schema.spec.ts`

**Interfaces:**

- Produces tables:
  `question_production_candidates`,
  `question_production_validations`

- [ ] **Step 1: Write failing schema metadata tests**

  다음 invariant를 검사한다.

  ```ts
  expect(unique(candidate, ['jobItemId', 'jobAttempt', 'ordinal'])).toBe(true);
  expect(unique(validation, ['candidateId', 'stage'])).toBe(true);
  expect(candidate.columns.payloadHash.notNull).toBe(true);
  expect(candidate.columns.reviewStatus.notNull).toBe(true);
  ```

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/schema/ai-question-production.schema.spec.ts`

- [ ] **Step 3: Implement schema**

  candidate에는 job item/attempt/ordinal, type version, topic, difficulty,
  canonical payload JSON, SHA-256, group, review status/code,
  regenerated-from, approved question/version와 timestamps를 둔다.
  validation에는 candidate, stage, status, code, details와 timestamp를 둔다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/schema/ai-question-production.schema.spec.ts && pnpm --filter @flex-thia/database typecheck`

  Commit:
  `git commit -m "feat(database): model question production candidates"`

### Task 4: Context query and candidate repository

**Files:**

- Create: `backend/database/src/queries/drizzle-question-production-context.query.ts`
- Test: `backend/database/src/queries/drizzle-question-production-context.query.spec.ts`
- Create: `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.ts`
- Test: `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`

**Interfaces:**

- Implements: `QuestionProductionContextRepository`,
  `QuestionProductionCandidateRepository`
- Reuses: Wave 4 `VocabularyProviderRunRepository` lifecycle through the generic
  provider run table

- [ ] **Step 1: Write failing context query tests**

  active type version만 읽고 난이도 기준·승인 예시·topic/tag·preset
  vocabulary policy를 stable order로 조립하는지 검증한다. DRAFT/RETIRED
  유형은 제외한다.

- [ ] **Step 2: Write failing persistence tests**

  같은 item/attempt/ordinal replay, validation stage 중복, stale lease no-op,
  artifact insert 실패 rollback을 fake transaction으로 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-question-production-context.query.spec.ts backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`

- [ ] **Step 4: Implement Drizzle adapters**

  repository는 active `PROCESSING + attempt + leaseToken + leaseUntil` 조건
  아래 candidate/validation insert와 item terminal update를 한 transaction에
  둔다. candidate 공개 read는 raw prompt/provider payload를 select하지 않는다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-question-production-context.query.spec.ts backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts && pnpm --filter @flex-thia/database typecheck`

  Commit:
  `git commit -m "feat(database): persist AI question results"`

### Task 5: Deterministic providers and processor

**Files:**

- Create: `backend/providers/src/fakes/fake-question-generation.provider.ts`
- Test: `backend/providers/src/fakes/fake-question-generation.provider.spec.ts`
- Create: `backend/providers/src/fakes/fake-question-cross-validation.provider.ts`
- Test: `backend/providers/src/fakes/fake-question-cross-validation.provider.spec.ts`
- Create: `backend/worker/src/content-production/ai-question-production.processor.ts`
- Test: `backend/worker/src/content-production/ai-question-production.processor.spec.ts`

**Interfaces:**

- Consumes: Task 1 ports and existing `ContentProductionWorkItem`
- Produces:

```ts
class AiQuestionProductionProcessor {
  process(
    item: ContentProductionWorkItem & {
      item: { operation: 'QUESTION_GENERATION' };
    },
    signal: AbortSignal,
  ): Promise<ContentProductionProcessResult>;
}
```

- [ ] **Step 1: Write failing pipeline tests**

  `context -> prompt -> generation -> schema/rules -> similarity ->
  cross-validation -> artifacts` 순서를 spy로 검증한다.

- [ ] **Step 2: Add isolation/idempotency cases**

  후보 하나 실패 후 다음 후보 계속 처리, 0 후보,
  provider outcome unknown, 같은 model ID, abort signal과 stale lease
  결과를 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/providers/src/fakes/fake-question-generation.provider.spec.ts backend/providers/src/fakes/fake-question-cross-validation.provider.spec.ts backend/worker/src/content-production/ai-question-production.processor.spec.ts`

- [ ] **Step 4: Implement fake providers and processor**

  fake는 prompt fixture에 따라 canonical candidate와 fixed usage를 반환한다.
  processor 공개 result에는 group count와 stable code만 넣는다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/providers/src/fakes/fake-question-generation.provider.spec.ts backend/providers/src/fakes/fake-question-cross-validation.provider.spec.ts backend/worker/src/content-production/ai-question-production.processor.spec.ts && pnpm --filter @flex-thia/worker typecheck`

  Commit:
  `git commit -m "feat(worker): process AI question candidates"`

### Task 6: Review commands

**Files:**

- Modify: `backend/domain/src/content-production/ai-question-production.ts`
- Test: `backend/domain/src/content-production/ai-question-production.spec.ts`
- Modify: `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.ts`
- Test: `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`

**Interfaces:**

- Produces: `QuestionCandidateReviewService`

```ts
approve(input: {
  candidateId: string;
  expectedRevision: number;
  actorUserId: string;
  actorSub: string;
  requestId: string;
  occurredAt: Date;
}): Promise<ApprovedQuestionDraft>;
discard(input: ReviewCommand): Promise<void>;
regenerate(input: ReviewCommand): Promise<{ jobId: string; attempt: number }>;
```

- [ ] **Step 1: Write failing state transition tests**

  NORMAL+all passed만 approve, 같은 request replay, concurrent approve 한 건,
  discarded/approved 재전이 거절, regeneration lineage와 attempt 증가를
  검증한다.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`

- [ ] **Step 3: Implement service and transactional repository methods**

  approve는 candidate row lock, expected revision, generated draft port,
  candidate link와 audit input을 한 transaction contract로 묶는다.
  통합 branch가 실제 nullable-audio draft adapter를 주입할 수 있게 port를
  유지한다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`

  Commit:
  `git commit -m "feat(content-production): review question candidates"`

### Task 7: Public admin contracts

**Files:**

- Create: `shared/contracts/src/content-production/question-production.ts`
- Test: `shared/contracts/src/content-production/question-production.spec.ts`

**Interfaces:**

- Produces strict Zod schemas for:
  candidate list/detail, approve, discard, regenerate and responses

- [ ] **Step 1: Write failing contract tests**

  UUID/revision/page bounds, four validation stages, payload redaction,
  unknown key rejection과 ISO datetime을 검증한다.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run shared/contracts/src/content-production/question-production.spec.ts`

- [ ] **Step 3: Implement strict schemas**

  detail은 canonical candidate, validation evidence와 review state를 포함하되
  provider raw payload, prompt body, private key를 포함하지 않는다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run shared/contracts/src/content-production/question-production.spec.ts && pnpm --filter @flex-thia/contracts typecheck`

  Commit:
  `git commit -m "feat(contracts): expose question production review"`

### Task 8: NestJS leaf API

**Files:**

- Create: `backend/api/src/content-production/question-production.dto.ts`
- Create: `backend/api/src/content-production/question-production.service.ts`
- Test: `backend/api/src/content-production/question-production.service.spec.ts`
- Create: `backend/api/src/content-production/question-production.controller.ts`
- Test: `backend/api/src/content-production/question-production.controller.spec.ts`

**Interfaces:**

- Produces routes under `/admin/content-production/question-candidates`
- Requires existing ADMIN+MFA guards when integration module registers it

- [ ] **Step 1: Write failing service/controller tests**

  list/detail, approve 200 replay, discard 204, regenerate 202,
  invalid input 400, missing 404, revision/state conflict 409와 audit context
  전달을 검증한다.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/api/src/content-production/question-production.service.spec.ts backend/api/src/content-production/question-production.controller.spec.ts`

- [ ] **Step 3: Implement DTO, mapper, service and controller**

  controller는 shared Zod DTO만 받고 domain code를 기존 exception filter가
  해석할 stable error로 전달한다. raw DB/provider row를 반환하지 않는다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run backend/api/src/content-production/question-production.service.spec.ts backend/api/src/content-production/question-production.controller.spec.ts && pnpm --filter @flex-thia/api typecheck`

  Commit:
  `git commit -m "feat(api): add question candidate operations"`

### Task 9: Branch-wide verification and cleanup

**Files:**

- Review every file owned by this branch

- [ ] **Step 1: Run focused suite**

  Run:
  `pnpm exec vitest run backend/domain/src/content-production/ai-question-production.spec.ts backend/database/src/schema/ai-question-production.schema.spec.ts backend/database/src/queries/drizzle-question-production-context.query.spec.ts backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts backend/providers/src/fakes/fake-question-generation.provider.spec.ts backend/providers/src/fakes/fake-question-cross-validation.provider.spec.ts backend/worker/src/content-production/ai-question-production.processor.spec.ts shared/contracts/src/content-production/question-production.spec.ts backend/api/src/content-production/question-production.service.spec.ts backend/api/src/content-production/question-production.controller.spec.ts`

- [ ] **Step 2: Run quality gates**

  Run:
  `pnpm lint && pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/providers typecheck && pnpm --filter @flex-thia/worker typecheck && pnpm --filter @flex-thia/contracts typecheck && pnpm --filter @flex-thia/api typecheck`

- [ ] **Step 3: Check surgical diff**

  Run:
  `git diff --check && git status --short`

  Expected: ownership 밖 변경, migration, generated cache가 없다.

- [ ] **Step 4: Remove generated artifacts**

  Remove only branch-local `dist`, `coverage`, `.vite`, `cdk.out`.
  Keep `node_modules`, pnpm store and Docker volume.

- [ ] **Step 5: Final commit if verification changed files**

  `git commit -m "test(content-production): harden AI question production"`
