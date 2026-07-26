# Wave 4 AI Vocabulary Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF·IMAGE·TEXT 입력에서 태국어 어휘 후보를 추출하고 중복·결정 규칙·독립 AI 검증 결과와 공급자 실행 이력을 비용 안전하게 저장한다.

**Architecture:** Wave 3 `content-production`의 job/item/lease 위에 구조화된 work item과 AI 어휘 pipeline을 추가한다. Phase A는 외부 호출 없이 fake provider와 실제 PostgreSQL persistence까지 완성하고, Phase B는 사용자가 Google Cloud Vision OCR + AWS Bedrock AI와 신규 의존성을 승인한 뒤 같은 port에 production adapter만 연결한다.

**Tech Stack:** TypeScript 6, Vitest, Drizzle ORM, PostgreSQL 16, AWS SDK v3, Google Cloud Vision API

## Global Constraints

- 기준선은 local `main` commit `4816cbc`다.
- 새 파일과 export는 `conventions/comment-convention.md`, 테스트 설명은 한국어 규칙을 따른다.
- E2E 스펙을 추가하지 않고 단위·repository·실제 PostgreSQL 테스트로 검증한다.
- Phase A는 신규 package, 외부 네트워크, credential, 유료 호출을 추가하지 않는다.
- Phase B는 Google Vision, Bedrock, `@google-cloud/vision`, `@aws-sdk/client-bedrock-runtime`을 사용자가 명시적으로 승인한 뒤 시작한다.
- 추출 모델과 교차 검증 모델은 서로 다른 configured Bedrock model ID를 사용한다.
- 후보를 `vocabularies`에 자동 저장·공개하지 않는다.
- 같은 provider 실행이 `STARTED`에서 worker와 함께 유실되면 같은 attempt에서 다시 호출하지 않고 `PROVIDER_OUTCOME_UNKNOWN`으로 둔다. 새 호출은 관리자의 명시적 retry로 증가한 attempt에서만 허용한다.
- 후보·검증 저장과 item terminal 전이는 active `attempt + leaseToken` 조건의 한 transaction이다.
- provider 원문, 입력 본문, storage key, prompt 본문은 공개 `job_items.result`에 넣지 않는다.

---

## Ownership

기능 브랜치가 소유한다.

- `backend/domain/src/content-production/{content-production-work-item,ai-vocabulary-production}*`
- `backend/domain/src/vocabulary/vocabulary-production-lookup.ts`
- 위 두 feature-local `index.ts`의 append-only export
- `backend/database/src/schema/{jobs,ai-vocabulary-production}.schema*`
- `backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository*`
- `backend/database/src/queries/drizzle-vocabulary-production.lookup*`
- `backend/providers/src/fakes/fake-{content-input,content-ocr,vocabulary-extraction,vocabulary-cross-validation}.provider*`
- `backend/providers/src/storage/s3-content-production-input.reader*`
- Phase B의 `backend/providers/src/ai/{google-vision-content-ocr,bedrock-vocabulary-extraction,bedrock-vocabulary-cross-validation}.provider*`
- `backend/worker/src/content-production/{content-production-dispatcher,ai-vocabulary-production.processor}*`

기능 브랜치가 수정하지 않고 통합 담당자가 직렬로 소유한다.

- `backend/database/src/schema/index.ts`, 모든 workspace root barrel
- `backend/worker/src/content-production-task*`
- `backend/api/src/app.module*`, `backend/config/**`, `infra/**`
- `backend/database/drizzle/**`, OpenAPI 생성물
- 모든 `package.json`, `pnpm-lock.yaml`

## Fixed model

```ts
type DuplicateClassification =
  | 'NEW_VOCABULARY'
  | 'EXACT_EXISTING_MEANING'
  | 'EXACT_NEW_MEANING'
  | 'POSSIBLE_DUPLICATE';
type CandidateGroup = 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
type ValidationStage = 'SCHEMA' | 'DECISION_RULE' | 'AI_CROSS_VALIDATION';
type ProviderRunStatus =
  | 'STARTED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'OUTCOME_UNKNOWN';
```

- exact lookup은 `DRAFT | PUBLISHED | HIDDEN`을 포함하고 `MERGED`는 최종 대표를 따라간다.
- 같은 Thai·같은 뜻은 `EXACT_EXISTING_MEANING`, 같은 Thai·새 뜻은 `EXACT_NEW_MEANING`이다.
- exact가 없고 preset의 `suspectedDuplicateMaxCodePointDistance` 안에 값이 있으면 `POSSIBLE_DUPLICATE`, 없으면 `NEW_VOCABULARY`다.
- 의심 중복은 거리·ID 순 상위 5개만 저장하고 자동 병합하지 않는다.
- preset 거리 값은 0~3 정수여야 하며 없거나 잘못되면 외부 호출 전에 `INVALID_DUPLICATE_POLICY`로 실패한다.
- 후보 0개, exact 같은 뜻, 의심 중복, AI 불일치는 `NEEDS_ATTENTION`이다.
- 신규·새 뜻은 세 validation이 모두 통과해야 `NORMAL`이다.
- schema·결정 규칙 실패는 `FAILED`다.
- 뜻 exact 비교는 NFKC, trim, 연속 공백 한 칸, 영문 소문자 결과를 사용한다.

## Phase A — provider-independent

### Task 1: Structured work item

**Files:**
- Create/Test: `backend/domain/src/content-production/content-production-work-item.ts`
- Modify/Test: `backend/worker/src/content-production/content-production-dispatcher.ts`

**Produces:**

```ts
interface ContentProductionWorkItem {
  jobId: string;
  jobAttempt: number;
  requestedBy: string;
  purpose: ContentProductionPurpose;
  presetSnapshot: ContentProductionPresetSnapshot;
  item: ContentProductionItem & {
    leaseUntil: Date;
    leaseToken: string;
    operation: 'VOCABULARY_EXTRACTION' | 'QUESTION_GENERATION';
  };
  input: ContentProductionInput & { jobInputId: string; ordinal: number };
}
```

- [ ] `sourceRef`를 역파싱하지 않고 exact input과 operation을 processor에 넘기는 실패 테스트를 작성한다.
- [ ] Run: `pnpm exec vitest run backend/domain/src/content-production/content-production-work-item.spec.ts backend/worker/src/content-production/content-production-dispatcher.spec.ts`
  - Expected Red: structured seed와 processor signature가 없다.
- [ ] `ensureItems`를 `{sourceRef, jobInputId, operation}[]`, processor를 `process(workItem, signal)`로 변경한다.
- [ ] 같은 attempt redelivery, stale attempt, lease 상실 회귀까지 위 명령이 PASS인지 확인한다.
- [ ] Commit: `refactor(content-production): pass structured worker items`

### Task 2: Pure candidate rules and ports

**Files:**
- Create/Test: `backend/domain/src/content-production/ai-vocabulary-production.ts`
- Create: `backend/domain/src/vocabulary/vocabulary-production-lookup.ts`
- Modify: feature-local barrels

**Produces:**

```ts
interface ContentProductionInputReader {
  read(input: ContentProductionWorkItem['input']): Promise<Uint8Array>;
}
interface ContentOcrProvider {
  recognize(input: OcrInput): Promise<ProviderTextResult>;
}
interface VocabularyExtractionProvider {
  extract(input: ExtractionInput): Promise<ExtractedVocabularyCandidate[]>;
}
interface VocabularyCrossValidationProvider {
  validate(input: ValidationInput): Promise<ProviderValidationResult>;
}
interface VocabularyProductionLookup {
  findExact(normalizedThai: string): Promise<VocabularyProductionMatch | null>;
  findSuspected(input: {
    normalizedThai: string;
    maxCodePointDistance: number;
    limit: 5;
  }): Promise<VocabularyProductionSuspect[]>;
}
```

- [ ] 네 duplicate classification, 세 group, schema/decision validation, stable suspect 정렬의 table test를 작성한다.
- [ ] Run: `pnpm exec vitest run backend/domain/src/content-production/ai-vocabulary-production.spec.ts`
  - Expected Red: types와 순수 함수가 없다.
- [ ] `normalizeThaiSearchText`와 공개 lookup port만 사용해 최소 규칙을 구현한다.
- [ ] 위 테스트와 `pnpm --filter @flex-thia/domain typecheck`가 PASS인지 확인한다.
- [ ] Commit: `feat(content-production): classify vocabulary candidates`

### Task 3: Cost-safe provider run lifecycle

**Files:**
- Modify/Test: `backend/domain/src/content-production/ai-vocabulary-production.ts`
- Modify/Test: `backend/database/src/schema/jobs.schema.ts`
- Create/Test: `backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.ts`

**Produces:**

```ts
interface VocabularyProviderRunRepository {
  claim(execution: ProviderExecution): Promise<
    | { kind: 'CLAIMED'; runId: string }
    | { kind: 'REPLAY'; result: NormalizedProviderResult }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(runId: string, result: NormalizedProviderResult): Promise<boolean>;
  fail(runId: string, failure: ProviderFailure): Promise<boolean>;
}
```

- [ ] 동일 key 동시 claim, succeeded replay, 남은 `STARTED`의 outcome unknown, terminal 재전이 거절 테스트를 작성한다.
- [ ] Run: `pnpm exec vitest run backend/domain/src/content-production/ai-vocabulary-production.spec.ts backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.spec.ts`
  - Expected Red: lifecycle repository가 없다.
- [ ] provider unique key를 `(job_item_id, attempt, operation, sequence)`로 바꾸고 `status`, `promptVersion`, normalized `result`, `retryable`을 저장한다.
- [ ] callback은 `CLAIMED`일 때만 호출하고 `REPLAY`/`OUTCOME_UNKNOWN`이면 호출하지 않는다.
- [ ] 위 명령이 PASS인지 확인한다.
- [ ] Commit: `feat(content-production): guard provider run lifecycle`

### Task 4: Candidate persistence and vocabulary lookup

**Files:**
- Create/Test: `backend/database/src/schema/ai-vocabulary-production.schema.ts`
- Modify: `backend/database/src/schema/jobs.schema.ts`
- Modify/Test: `backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.ts`
- Create/Test: `backend/database/src/queries/drizzle-vocabulary-production.lookup.ts`
- Test: `backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.integration.spec.ts`

- [ ] candidate `(jobItemId, jobAttempt, ordinal)` unique, validation `(candidateId, stage)` unique, stale lease no-op, transaction rollback 테스트를 먼저 작성한다.
- [ ] Run: `pnpm exec vitest run backend/database/src/schema/ai-vocabulary-production.schema.spec.ts backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.spec.ts backend/database/src/queries/drizzle-vocabulary-production.lookup.spec.ts`
  - Expected Red: schema·adapter가 없다.
- [ ] candidate에 Thai, normalized Thai, kind, meanings, classification, group, exact match, suspect evidence, review code를 저장한다.
- [ ] validation에 stage, result, stable code, details를 저장한다.
- [ ] `job_items`에 `jobInputId`와 `operation`을 추가하고 신규 row부터 채운다. 기존 row backfill/NOT NULL migration은 통합 담당자가 수행한다.
- [ ] `finishItem` transaction이 active `attempt + leaseToken + PROCESSING`을 잠근 뒤 artifacts insert와 terminal update를 함께 수행하게 한다.
- [ ] exact lookup의 대표 추적과 suspect top 5 stable order를 구현하고 unit 명령이 PASS인지 확인한다.
- [ ] 실제 PostgreSQL을 올린다: `docker compose up -d postgres`
- [ ] reset: `DATABASE_URL=postgres://flex_thia:local_only_password@127.0.0.1:5432/flex_thia LOCAL_DATABASE_RESET=true pnpm --filter @flex-thia/database db:reset-seed:local`
- [ ] integration: `AI_VOCABULARY_TEST_DATABASE_URL=postgres://flex_thia:local_only_password@127.0.0.1:5432/flex_thia pnpm exec vitest run backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.integration.spec.ts`
  - Expected Green: 동시 claim 1개, same-attempt 재호출 0개, explicit retry 새 run, stale lease write 0개, insert 실패 rollback, MERGED 대표 조회가 PASS.
- [ ] 즉시 `docker compose down`하고 volume은 보존한다.
- [ ] Commit: `feat(database): persist AI vocabulary production`

### Task 5: Deterministic local pipeline

**Files:**
- Create/Test: `backend/providers/src/fakes/fake-content-input.provider.ts`
- Create/Test: `backend/providers/src/fakes/fake-content-ocr.provider.ts`
- Create/Test: `backend/providers/src/fakes/fake-vocabulary-extraction.provider.ts`
- Create/Test: `backend/providers/src/fakes/fake-vocabulary-cross-validation.provider.ts`
- Create/Test: `backend/worker/src/content-production/ai-vocabulary-production.processor.ts`

- [ ] TEXT는 OCR 0회, PDF·IMAGE는 OCR 1회인 실패 테스트를 작성한다.
- [ ] 0 candidate, 네 duplicate class, schema/decision 실패, AI 불일치, 명확한 provider 실패, outcome unknown fixture를 추가한다.
- [ ] Run: `pnpm exec vitest run backend/providers/src/fakes backend/worker/src/content-production/ai-vocabulary-production.processor.spec.ts`
  - Expected Red: fake와 processor가 없다.
- [ ] `reader -> TEXT decode 또는 OCR -> extraction -> normalize -> exact/suspect lookup -> rules -> cross-validation -> artifacts` 순서를 구현한다.
- [ ] candidate 하나의 실패가 다른 candidate를 막지 않으며 공개 result에는 group count와 안정 code만 포함하게 한다.
- [ ] 위 명령과 `pnpm --filter @flex-thia/worker typecheck`가 PASS인지 확인한다.
- [ ] Commit: `feat(worker): add local AI vocabulary pipeline`

### Task 6: Lease/idempotency completion and S3 reader

**Files:**
- Modify/Test: `backend/worker/src/content-production/content-production-dispatcher.ts`
- Modify/Test: `backend/domain/src/content-production/content-production.service.ts`
- Create/Test: `backend/providers/src/storage/s3-content-production-input.reader.ts`

- [ ] processor 완료 직전 lease 상실 시 artifact·terminal write 0회 테스트를 작성한다.
- [ ] `NEEDS_ATTENTION + PROVIDER_OUTCOME_UNKNOWN + retryable`은 관리자 retry 때만 새 attempt가 되는 테스트를 작성한다.
- [ ] S3 reader의 exact key, size bound, 빈 body, abort, stream 오류 테스트를 작성한다.
- [ ] Run: `pnpm exec vitest run backend/worker/src/content-production backend/domain/src/content-production backend/providers/src/storage/s3-content-production-input.reader.spec.ts`
  - Expected Red: attention retry와 bounded reader가 없다.
- [ ] dispatcher가 lease heartbeat를 멈춘 뒤에도 lease가 유효할 때만 artifact-aware `finishItem`을 호출하게 한다.
- [ ] existing `FAILED && retryable`과 unknown attention만 명시적 retry 대상으로 둔다.
- [ ] S3 bytes는 log·error·공개 result에 넣지 않고 `sizeBytes` 초과 즉시 stream을 중단한다.
- [ ] 위 명령이 PASS인지 확인한다.
- [ ] Commit: `fix(content-production): finish candidates under active lease`

### Task 7: Phase A gate and cleanup

- [ ] Focused test:
  `pnpm exec vitest run backend/domain/src/content-production backend/providers/src/fakes backend/providers/src/storage/s3-content-production-input.reader.spec.ts backend/worker/src/content-production backend/database/src/schema/ai-vocabulary-production.schema.spec.ts backend/database/src/repositories/content-production backend/database/src/queries/drizzle-vocabulary-production.lookup.spec.ts`
- [ ] Typecheck:
  `pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/providers typecheck && pnpm --filter @flex-thia/worker typecheck`
- [ ] Ownership: `git diff --name-only 4816cbc...HEAD`에 위 소유 경로만 있는지 확인한다.
- [ ] 부산물만 제거한다:
  `rm -rf backend/domain/dist backend/database/dist backend/providers/dist backend/worker/dist coverage`
- [ ] Vite cache만 제거하고 `node_modules`는 보존한다:
  `rm -rf backend/domain/node_modules/.vite backend/database/node_modules/.vite backend/providers/node_modules/.vite backend/worker/node_modules/.vite`
- [ ] `docker compose down`으로 사용하지 않는 container를 내리고 volume은 지우지 않는다.

## Phase B — only after explicit approval

### Task 8: Approved dependencies and configuration

통합 담당자가 사용자 승인 후에만 수행한다.

- [ ] `@google-cloud/vision`, `@aws-sdk/client-bedrock-runtime`을 providers package와 lockfile에 추가한다.
- [ ] Google credential secret reference, Vision project/location, Bedrock region, extraction/validation model ID, 두 prompt version의 fail-fast config test를 먼저 작성한다.
- [ ] 두 Bedrock model ID가 같으면 startup이 실패하도록 구현한다.
- [ ] `pnpm --filter @flex-thia/config test && pnpm --filter @flex-thia/infra test && pnpm --filter @flex-thia/infra synth`가 PASS인지 확인한다.

### Task 9: Google Vision OCR adapter

**Files:**
- Create/Test: `backend/providers/src/ai/google-vision-content-ocr.provider.ts`

- [ ] Thai language hint, IMAGE/PDF mapping, stable page join, request ID·usage, 빈 OCR, 4xx, 429/5xx, abort, outcome unknown의 mock 실패 테스트를 작성한다.
- [ ] Run: `pnpm exec vitest run backend/providers/src/ai/google-vision-content-ocr.provider.spec.ts`
  - Expected Red: adapter가 없다.
- [ ] 원문 response를 버리고 normalized text·request ID·usage만 반환하는 adapter를 구현한다.
- [ ] 위 테스트와 providers typecheck가 PASS인지 확인한다.
- [ ] Commit: `feat(providers): add Google Vision OCR adapter`

### Task 10: Separate Bedrock extraction and validation adapters

**Files:**
- Create/Test: `backend/providers/src/ai/bedrock-vocabulary-extraction.provider.ts`
- Create/Test: `backend/providers/src/ai/bedrock-vocabulary-cross-validation.provider.ts`

- [ ] 서로 다른 model ID·prompt version, structured output, token usage, malformed JSON, throttling, abort, outcome unknown의 mock 실패 테스트를 작성한다.
- [ ] Run: `pnpm exec vitest run backend/providers/src/ai/bedrock-vocabulary-extraction.provider.spec.ts backend/providers/src/ai/bedrock-vocabulary-cross-validation.provider.spec.ts`
  - Expected Red: adapter가 없다.
- [ ] 추출 adapter는 candidate schema만, 검증 adapter는 candidate별 `PASSED | FAILED`와 안정 code만 반환하게 한다.
- [ ] prompt 본문과 provider 원문을 provider run에 저장하지 않는다.
- [ ] 위 테스트와 providers typecheck가 PASS인지 확인한다.
- [ ] Commit: `feat(providers): add Bedrock vocabulary generation`

### Task 11: Integration-owner assembly and final gate

- [ ] 통합 담당자가 root barrels, schema index, migration, worker task, config/infra를 한 번만 조립한다.
- [ ] 기존 `job_items`의 `jobInputId/operation`과 `provider_runs.status`를 Wave 3 데이터에서 backfill하는 migration을 실제 PostgreSQL에서 검증한다.
- [ ] local은 deterministic fake, production은 S3 + Vision + Bedrock extraction + distinct Bedrock validation을 조립한다.
- [ ] `AI_VOCABULARY_TEST_DATABASE_URL=postgres://flex_thia:local_only_password@127.0.0.1:5432/flex_thia pnpm exec vitest run backend/database/src/repositories/content-production/drizzle-ai-vocabulary-production.repository.integration.spec.ts`가 PASS인지 확인한다.
- [ ] `CHOKIDAR_USEPOLLING=1 pnpm check`가 exit 0인지 확인한다.
- [ ] 실제 유료 smoke는 사용자가 비용·credential 사용을 별도 승인했을 때만 1 TEXT, 1 IMAGE, 1 PDF로 수행한다.
- [ ] `docker compose down` 후 build 산출물과 `coverage`만 제거하고 volume·`node_modules`는 보존한다.

## Completion criteria

- Phase A만으로 TEXT·PDF·IMAGE fake/local pipeline과 실제 PostgreSQL 동시성·원자성 검증이 끝난다.
- 정확 중복·새 뜻·의심 중복·신규 후보와 schema·결정 규칙·독립 검증 결과가 후보별로 남는다.
- provider·model·prompt version·usage·cost·request ID lifecycle이 같은 attempt에서 중복되지 않는다.
- stale attempt/lease와 terminal redelivery는 후보·provider run·비용을 중복 생성하지 않는다.
- Phase B는 승인 전 dependency·credential·유료 호출을 만들지 않는다.
- 통합 뒤 migration reset/upgrade, worker bundle, `pnpm check`가 통과하고 Docker는 사용하지 않을 때 내려간다.
