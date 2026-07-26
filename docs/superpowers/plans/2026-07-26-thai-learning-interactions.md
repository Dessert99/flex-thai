# Thai Learning Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문제·해설·어휘 예문의 태국어 문장을 단어와 표현 단위로 탐색하고 음성을 들을 수 있게 하며, 문장 내부 범위를 선택하는 `INLINE_SPAN_CHOICE` 문제를 전 계층에서 지원한다.

**Architecture:** 공용 태국어 문장 계약을 단일 모듈로 추출하고, 도메인에는 표현의 문맥상 뜻·발음과 inline option 범위를 명시적으로 저장한다. 데이터베이스 query가 학습자 전용 projection을 만들고 API가 모든 media key를 signed URL로 치환하며, 프론트엔드는 code-point 기반 segmentation과 접근 가능한 비중첩 control을 사용한다.

**Tech Stack:** TypeScript, Zod, NestJS, Drizzle ORM, PostgreSQL, React, TanStack Router/Query, shadcn/ui, Vitest, Testing Library

## Global Constraints

- 새 파일에는 `conventions/comment-convention.md`의 파일 헤더 주석을 쓰고, 새로 추가하거나 수정하는 export에는 한 줄 한국어 JSDoc을 쓴다.
- Vitest/Jest의 `describe`, `it`, `test` 설명 문자열은 한국어로 쓴다.
- `conventions/structure-convention.md`, `conventions/frontend/component-convention.md`, `docs/development/backend-architecture.md`의 의존성 방향을 유지한다.
- Playwright나 API 통합 E2E spec을 추가하지 않는다.
- 기능 브랜치는 `backend/database/drizzle/**`, `frontend/web/src/routeTree.gen.ts`, root/package manifests, `pnpm-lock.yaml`을 수정하지 않는다.
- `backend/*/src/index.ts`, `shared/contracts/src/index.ts`, `backend/api/src/app.module.ts` 같은 공용 조립 파일 변경은 기능 브랜치 마지막 `chore(thai-content): wire learning interactions` 커밋 하나로 격리한다.
- `frontend/web/src/pages/vocabulary-detail/**` 연결은 복수 단어장 브랜치와 충돌하므로 기능 브랜치에서 수정하지 않고 Task 11의 통합 담당 작업으로 남긴다.
- token offset과 문장 segmentation은 UTF-16 `String.slice()`가 아니라 `Array.from(text)`의 Unicode code point 기준이다.
- inline option span은 `sentenceVersionId`, 포함 `startTokenIndex`, 제외 `endTokenIndex`로 논리 option ID에 직접 연결한다. 표시 문자열 검색으로 범위를 추론하지 않는다.
- token, expression, inline option control을 서로 중첩된 `<button>`으로 렌더링하지 않는다.
- 대본 공개, hover, focus, tap, 음성 재생은 학습 이력이나 analytics로 기록하지 않는다.

---

### Task 1: 공용 태국어 문장 공개 계약

**Files:**
- Create: `shared/contracts/src/thai-content/sentences.ts`
- Create: `shared/contracts/src/thai-content/sentences.spec.ts`
- Modify: `shared/contracts/src/learning/questions.ts`
- Modify: `shared/contracts/src/learning/questions.spec.ts`
- Modify: `shared/contracts/src/learning/vocabularies.ts`
- Modify: `shared/contracts/src/learning/vocabularies.spec.ts`

**Interfaces:**
- Consumes: 기존 `publicSentenceSchema`의 sentence, token, expression 필드.
- Produces: `thaiTokenFeedbackSchema`, `thaiExpressionFeedbackSchema`, `publicThaiSentenceSchema`, `PublicThaiSentence`.

- [ ] **Step 1: 공용 계약의 실패 테스트를 작성한다**

```ts
/** 공용 태국어 문장 계약 테스트. */
import { describe, expect, it } from 'vitest';
import { publicThaiSentenceSchema } from './sentences';

describe('publicThaiSentenceSchema', () => {
  it('단어와 대표 표현의 학습 피드백을 공개한다', () => {
    const parsed = publicThaiSentenceSchema.parse({
      id: crypto.randomUUID(),
      originalText: 'ฉันรักภาษาไทย',
      translationKo: '나는 태국어를 사랑한다',
      pronunciationKo: '찬 락 파싸 타이',
      toneMarks: 'R H M M',
      audioUrl: 'https://media.example/sentence',
      speaker: null,
      position: 0,
      displayMode: 'VISIBLE',
      tokens: [{
        position: 0,
        surface: 'ฉัน',
        startOffset: 0,
        endOffset: 3,
        vocabularyId: crypto.randomUUID(),
        meaningId: crypto.randomUUID(),
        pronunciationId: crypto.randomUUID(),
        contextMeaningKo: '나',
        pronunciationKo: '찬',
        toneMarks: 'R',
        audioUrl: 'https://media.example/token',
        role: 'TARGET',
      }],
      expressions: [{
        startTokenIndex: 0,
        endTokenIndex: 1,
        vocabularyId: crypto.randomUUID(),
        meaningId: crypto.randomUUID(),
        pronunciationId: crypto.randomUUID(),
        contextMeaningKo: '나',
        pronunciationKo: '찬',
        toneMarks: 'R',
        audioUrl: 'https://media.example/expression',
        representative: true,
      }],
    });

    expect(parsed.tokens[0]?.contextMeaningKo).toBe('나');
    expect(parsed.expressions[0]?.representative).toBe(true);
  });

  it('내부 media storage key와 알 수 없는 필드를 거부한다', () => {
    expect(() => publicThaiSentenceSchema.parse({
      id: crypto.randomUUID(),
      originalText: 'ไทย',
      translationKo: '태국어',
      pronunciationKo: '타이',
      toneMarks: 'M',
      audioUrl: null,
      speaker: null,
      position: 0,
      displayMode: 'VISIBLE',
      tokens: [],
      expressions: [],
      mediaStorageKey: 'private/sentence.mp3',
    })).toThrow();
  });
});
```

- [ ] **Step 2: 계약 테스트가 기존 schema 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run shared/contracts/src/thai-content/sentences.spec.ts`

Expected: FAIL with `Failed to load url ./sentences` or missing export.

- [ ] **Step 3: 공용 strict schema를 최소 구현한다**

```ts
/** 학습자에게 공개하는 태국어 문장 계약. */
import { z } from 'zod';

const nullableAudioUrlSchema = z.url().nullable();

/** 단어의 문맥 학습 피드백 계약. */
export const thaiTokenFeedbackSchema = z.object({
  position: z.int().nonnegative(),
  surface: z.string().min(1),
  startOffset: z.int().nonnegative(),
  endOffset: z.int().positive(),
  vocabularyId: z.uuid(),
  meaningId: z.uuid(),
  pronunciationId: z.uuid(),
  contextMeaningKo: z.string().min(1),
  pronunciationKo: z.string().min(1),
  toneMarks: z.string().min(1),
  audioUrl: nullableAudioUrlSchema,
  role: z.enum(['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION']),
}).strict();

/** 표현 전체의 문맥 학습 피드백 계약. */
export const thaiExpressionFeedbackSchema = z.object({
  startTokenIndex: z.int().nonnegative(),
  endTokenIndex: z.int().positive(),
  vocabularyId: z.uuid(),
  meaningId: z.uuid(),
  pronunciationId: z.uuid(),
  contextMeaningKo: z.string().min(1),
  pronunciationKo: z.string().min(1),
  toneMarks: z.string().min(1),
  audioUrl: nullableAudioUrlSchema,
  representative: z.boolean(),
}).strict();

/** 문제·해설·예문이 공유하는 공개 태국어 문장 계약. */
export const publicThaiSentenceSchema = z.object({
  id: z.uuid(),
  originalText: z.string().min(1),
  translationKo: z.string().min(1),
  pronunciationKo: z.string().min(1),
  toneMarks: z.string().min(1),
  audioUrl: nullableAudioUrlSchema,
  speaker: z.string().min(1).nullable(),
  position: z.int().nonnegative(),
  displayMode: z.enum(['VISIBLE', 'AUDIO_THEN_REVEAL']),
  tokens: z.array(thaiTokenFeedbackSchema),
  expressions: z.array(thaiExpressionFeedbackSchema),
}).strict();

/** 공개 태국어 문장 응답 타입. */
export type PublicThaiSentence = z.infer<typeof publicThaiSentenceSchema>;
```

`questions.ts`의 중복 sentence schema와 `vocabularies.ts`의 예문 schema를 `publicThaiSentenceSchema`로 교체한다.

- [ ] **Step 4: 세 계약 테스트와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run shared/contracts/src/thai-content/sentences.spec.ts shared/contracts/src/learning/questions.spec.ts shared/contracts/src/learning/vocabularies.spec.ts && pnpm --filter @flex-thia/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: 공용 계약 변경을 커밋한다**

```bash
git add shared/contracts/src/thai-content shared/contracts/src/learning/questions.ts shared/contracts/src/learning/questions.spec.ts shared/contracts/src/learning/vocabularies.ts shared/contracts/src/learning/vocabularies.spec.ts
git commit -m "feat(contracts): expose interactive Thai sentences"
```

### Task 2: 표현 피드백과 INSTRUCTION 역할 도메인 모델

**Files:**
- Modify: `backend/domain/src/thai-content/thai-sentence-version.ts`
- Modify: `backend/domain/src/thai-content/thai-sentence-version.spec.ts`
- Modify: `backend/domain/src/content-import/content-draft.ts`
- Modify: `backend/domain/src/content-import/content-draft.spec.ts`
- Modify: `backend/domain/src/content-import/content-draft.repository.ts`
- Modify: `backend/domain/src/questions/question-admin.ts`
- Modify: `backend/domain/src/questions/question-admin.spec.ts`
- Modify: `backend/domain/src/questions/question-admin.repository.ts`
- Modify: `shared/contracts/src/admin/content-imports.ts`
- Modify: `shared/contracts/src/admin/content-imports.spec.ts`
- Modify: `shared/contracts/src/admin/questions.ts`
- Modify: `shared/contracts/src/admin/questions.spec.ts`

**Interfaces:**
- Consumes: Task 1의 token/expression 공개 필드.
- Produces: `ThaiTokenRole`, 확장된 `ThaiExpressionOccurrenceInput`, canonical import/admin 입력.

- [ ] **Step 1: 표현 참조와 INSTRUCTION 역할의 실패 테스트를 작성한다**

```ts
it('표현의 선택 뜻과 발음 및 문맥상 뜻을 보존한다', () => {
  const input: ThaiExpressionOccurrenceInput = {
    startTokenIndex: 0,
    endTokenIndex: 2,
    vocabularyId: expressionId,
    vocabularyKind: 'EXPRESSION',
    meaningId,
    pronunciationId,
    contextMeaningKo: '감사합니다',
    adminSelected: true,
  };
  expect(resolveRepresentativeExpressions([input])[0]).toMatchObject({
    meaningId,
    pronunciationId,
    contextMeaningKo: '감사합니다',
    representative: true,
  });
});

it('문제 지시문 어휘에 INSTRUCTION 역할을 허용한다', () => {
  expect(validateThaiSentenceVersion(makeSentence({
    tokens: [makeToken({ role: 'INSTRUCTION' })],
  }))).toEqual([]);
});
```

관리 입력 테스트에는 expression `meaningId`와 `pronunciationId`가 해당 `vocabularyId` 소유가 아니면 `EXPRESSION_REFERENCE_MISMATCH`가 반환되는 사례를 추가한다.

- [ ] **Step 2: domain 테스트가 새 필드와 enum 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/domain/src/thai-content/thai-sentence-version.spec.ts backend/domain/src/content-import/content-draft.spec.ts backend/domain/src/questions/question-admin.spec.ts`

Expected: FAIL with missing `meaningId`, `pronunciationId`, or rejected `INSTRUCTION`.

- [ ] **Step 3: 도메인 입력과 canonical graph를 최소 확장한다**

```ts
/** 태국어 token이 문장에서 맡는 학습 역할. */
export type ThaiTokenRole =
  | 'TARGET'
  | 'REQUIRED'
  | 'SUPPORTING'
  | 'INSTRUCTION';

/** 문장 안 표현 occurrence 입력. */
export interface ThaiExpressionOccurrenceInput {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  vocabularyKind: 'WORD' | 'EXPRESSION';
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  adminSelected: boolean;
}
```

`ThaiTokenOccurrenceInput.role`은 `ThaiTokenRole`을 사용한다. content import와 question admin의 저장 command에도 같은 세 필드를 복사하고, repository port는 이 구조를 그대로 받는다.

- [ ] **Step 4: 참조 소유권과 기존 대표 표현 규칙이 모두 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/domain/src/thai-content/thai-sentence-version.spec.ts backend/domain/src/content-import/content-draft.spec.ts backend/domain/src/questions/question-admin.spec.ts shared/contracts/src/admin/content-imports.spec.ts shared/contracts/src/admin/questions.spec.ts`

Expected: PASS.

- [ ] **Step 5: 표현 도메인 변경을 커밋한다**

```bash
git add backend/domain/src/thai-content backend/domain/src/content-import shared/contracts/src/admin/content-imports.ts shared/contracts/src/admin/content-imports.spec.ts backend/domain/src/questions/question-admin.ts backend/domain/src/questions/question-admin.spec.ts backend/domain/src/questions/question-admin.repository.ts shared/contracts/src/admin/questions.ts shared/contracts/src/admin/questions.spec.ts
git commit -m "feat(thai-content): preserve expression feedback"
```

### Task 3: 표현 피드백 persistence와 학습자 projection

**Files:**
- Modify: `backend/database/src/schema/thai-content.schema.ts`
- Modify: `backend/database/src/schema/questions.schema.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-content-draft.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-content-draft.repository.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-question-admin.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-question-admin.repository.spec.ts`
- Modify: `backend/database/src/queries/drizzle-learner-question.query.ts`
- Modify: `backend/database/src/queries/drizzle-learner-question.query.spec.ts`
- Modify: `backend/database/src/queries/drizzle-learner-vocabulary.query.ts`
- Modify: `backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts`

**Interfaces:**
- Consumes: Task 2의 expression fields.
- Produces: pronunciation/media가 결합된 `LearnerQuestionTokenProjection`, `LearnerQuestionExpressionProjection`, 예문 `PublicThaiSentence` projection.

- [ ] **Step 1: schema와 query projection 실패 테스트를 작성한다**

```ts
it('표현 occurrence가 선택 뜻과 발음 및 문맥상 뜻을 저장한다', () => {
  expect(getTableConfig(thaiExpressionOccurrences).columns.map(({ name }) => name))
    .toEqual(expect.arrayContaining([
      'meaning_id',
      'pronunciation_id',
      'context_meaning_ko',
    ]));
});

it('학습자 문장에 단어와 표현 음성 피드백을 결합한다', async () => {
  const detail = await query.getQuestionDetail(userId, questionId);
  expect(detail?.blocks[0]?.sentences[0]?.tokens[0]).toMatchObject({
    pronunciationKo: '찬',
    toneMarks: 'R',
    mediaStorageKey: 'audio/token.mp3',
  });
  expect(detail?.blocks[0]?.sentences[0]?.expressions[0]).toMatchObject({
    contextMeaningKo: '감사합니다',
    pronunciationKo: '컵쿤 크랍',
  });
});
```

- [ ] **Step 2: database focused tests가 projection 누락으로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts backend/database/src/repositories/drizzle-content-draft.repository.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts`

Expected: FAIL with missing columns or projection fields.

- [ ] **Step 3: schema, write repository, read query를 최소 확장한다**

`thaiExpressionOccurrences`에 다음 columns와 기존 vocabulary tables를 향한 foreign key를 추가한다.

```ts
meaningId: uuid('meaning_id').notNull(),
pronunciationId: uuid('pronunciation_id').notNull(),
contextMeaningKo: text('context_meaning_ko').notNull(),
```

query projection은 private 응답 내부에서만 다음 필드를 사용한다.

```ts
export interface LearnerQuestionExpressionProjection {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaStorageKey: string | null;
  representative: boolean;
}
```

token과 expression의 `pronunciationId`로 `vocabularyPronunciations`를 join하고 pronunciation의 `mediaAssetId`로 `mediaAssets.storageKey`를 읽는다. 어휘 예문 query도 같은 sentence loader 결과를 사용한다.

- [ ] **Step 4: database focused tests가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts backend/database/src/repositories/drizzle-content-draft.repository.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts && pnpm --filter @flex-thia/database typecheck`

Expected: PASS.

- [ ] **Step 5: persistence 변경을 커밋한다**

```bash
git add backend/database/src/schema/thai-content.schema.ts backend/database/src/schema/questions.schema.spec.ts backend/database/src/repositories/drizzle-content-draft.repository.ts backend/database/src/repositories/drizzle-content-draft.repository.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts backend/database/src/queries/drizzle-learner-question.query.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts
git commit -m "feat(database): project Thai learning feedback"
```

### Task 4: INLINE_SPAN_CHOICE 도메인과 계약

**Files:**
- Modify: `backend/domain/src/questions/question-version.ts`
- Modify: `backend/domain/src/questions/question-version.spec.ts`
- Modify: `shared/contracts/src/admin/content-imports.ts`
- Modify: `shared/contracts/src/admin/content-imports.spec.ts`
- Modify: `shared/contracts/src/admin/questions.ts`
- Modify: `shared/contracts/src/admin/questions.spec.ts`
- Modify: `shared/contracts/src/learning/questions.ts`
- Modify: `shared/contracts/src/learning/questions.spec.ts`

**Interfaces:**
- Consumes: 기존 `QuestionTemplate`, `QuestionVersionValidationCandidate`, option ID와 정답 처리.
- Produces: `INLINE_SPAN_CHOICE`, `QuestionOptionSpan`, `INLINE_SPAN_INVALID` validation issue.

- [ ] **Step 1: 네 번째 template과 span 불변식의 실패 테스트를 작성한다**

```ts
it('INLINE_SPAN_CHOICE는 QUESTION 문장 안의 3개 또는 4개 범위를 허용한다', () => {
  const report = validateQuestionVersion(makeCandidate({
    typeVersion: {
      id: typeVersionId,
      template: 'INLINE_SPAN_CHOICE',
      optionCount: 4,
    },
    options: [0, 1, 2, 3].map((position) => ({
      id: optionIds[position]!,
      position,
      isCorrect: position === 1,
      span: {
        sentenceVersionId,
        startTokenIndex: position,
        endTokenIndex: position + 1,
      },
    })),
  }));
  expect(report.issues).toEqual([]);
});

it('inline 범위가 QUESTION 문장 밖이거나 token 범위를 벗어나면 거부한다', () => {
  expect(validateQuestionVersion(makeInlineCandidate({
    span: {
      sentenceVersionId: explanationSentenceId,
      startTokenIndex: 0,
      endTokenIndex: 99,
    },
  })).issues).toContainEqual(expect.objectContaining({
    code: 'INLINE_SPAN_INVALID',
  }));
});
```

학습자 계약 테스트는 option에 `span`을 공개하되 `isCorrect`는 문제 상세 응답에서 거부하고, 제출 요청은 기존처럼 `selectedOptionId` 하나만 받는지 검증한다.

- [ ] **Step 2: domain과 계약 테스트가 enum/schema 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/domain/src/questions/question-version.spec.ts shared/contracts/src/admin/content-imports.spec.ts shared/contracts/src/admin/questions.spec.ts shared/contracts/src/learning/questions.spec.ts`

Expected: FAIL with rejected `INLINE_SPAN_CHOICE` or unknown `span`.

- [ ] **Step 3: discriminated option model과 validation을 최소 구현한다**

```ts
/** 문제가 사용하는 화면 template. */
export type QuestionTemplate =
  | 'STANDARD_CHOICE'
  | 'PASSAGE_CHOICE'
  | 'DIALOGUE_CHOICE'
  | 'INLINE_SPAN_CHOICE';

/** 문장 token 범위에 연결된 선택지. */
export interface QuestionOptionSpan {
  sentenceVersionId: string;
  startTokenIndex: number;
  endTokenIndex: number;
}

export interface QuestionVersionOptionCandidate {
  id: string;
  position: number;
  isCorrect: boolean;
  sentence: QuestionSentenceCandidate | null;
  span: QuestionOptionSpan | null;
}
```

validation 규칙은 inline template에서 option 3개 또는 4개, 정확히 하나의 QUESTION sentence, 각 option의 span 필수, `0 <= start < end <= tokens.length`, 중복 범위 금지, 정확히 한 정답이다. 기존 세 template에서는 sentence 필수와 span 금지를 유지한다.

- [ ] **Step 4: domain과 계약 focused tests가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/domain/src/questions/question-version.spec.ts shared/contracts/src/admin/content-imports.spec.ts shared/contracts/src/admin/questions.spec.ts shared/contracts/src/learning/questions.spec.ts && pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: inline domain/contract 변경을 커밋한다**

```bash
git add backend/domain/src/questions/question-version.ts backend/domain/src/questions/question-version.spec.ts shared/contracts/src/admin/content-imports.ts shared/contracts/src/admin/content-imports.spec.ts shared/contracts/src/admin/questions.ts shared/contracts/src/admin/questions.spec.ts shared/contracts/src/learning/questions.ts shared/contracts/src/learning/questions.spec.ts
git commit -m "feat(questions): define inline span choices"
```

### Task 5: INLINE_SPAN_CHOICE persistence와 query

**Files:**
- Modify: `backend/database/src/schema/questions.schema.ts`
- Modify: `backend/database/src/schema/questions.schema.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-question-admin.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-question-admin.repository.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-question-publication.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-question-publication.repository.spec.ts`
- Modify: `backend/database/src/queries/drizzle-admin-question.query.ts`
- Modify: `backend/database/src/queries/drizzle-admin-question.query.spec.ts`
- Modify: `backend/database/src/queries/drizzle-learner-question.query.ts`
- Modify: `backend/database/src/queries/drizzle-learner-question.query.spec.ts`

**Interfaces:**
- Consumes: Task 4의 `QuestionOptionSpan`.
- Produces: option ID와 span의 원자적 저장·복제·교체·게시·학습자 projection.

- [ ] **Step 1: 저장과 공개 projection의 실패 테스트를 작성한다**

```ts
it('inline option ID와 범위를 같은 draft 교체 transaction에 저장한다', async () => {
  await repository.replaceDraft(questionId, makeInlineDraft());
  expect(executedTransactionInserts).toContainEqual(expect.objectContaining({
    optionId,
    sentenceVersionId,
    startTokenIndex: 1,
    endTokenIndex: 3,
  }));
});

it('학습자 상세에는 inline 범위를 공개하고 정답 여부는 숨긴다', async () => {
  const detail = await query.getQuestionDetail(userId, questionId);
  expect(detail?.options[0]).toMatchObject({
    id: optionId,
    span: { sentenceVersionId, startTokenIndex: 1, endTokenIndex: 3 },
  });
  expect(detail?.options[0]).not.toHaveProperty('isCorrect');
});
```

- [ ] **Step 2: persistence focused tests가 새 columns 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts backend/database/src/repositories/drizzle-question-publication.repository.spec.ts backend/database/src/queries/drizzle-admin-question.query.spec.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts`

Expected: FAIL with missing inline span columns/projection.

- [ ] **Step 3: nullable span columns와 repository mapping을 최소 구현한다**

`questionOptions`에 다음 columns를 추가한다.

```ts
spanSentenceVersionId: uuid('span_sentence_version_id'),
spanStartTokenIndex: integer('span_start_token_index'),
spanEndTokenIndex: integer('span_end_token_index'),
```

세 값이 모두 null이거나 모두 non-null인 check constraint를 추가하고, inline publication validation 전에 span sentence/token 소속을 query한다. admin replace/copy와 publication copy는 option ID와 세 span 값을 같은 transaction에서 옮긴다.

- [ ] **Step 4: persistence와 query tests가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts backend/database/src/repositories/drizzle-question-publication.repository.spec.ts backend/database/src/queries/drizzle-admin-question.query.spec.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts && pnpm --filter @flex-thia/database typecheck`

Expected: PASS.

- [ ] **Step 5: inline persistence 변경을 커밋한다**

```bash
git add backend/database/src/schema/questions.schema.ts backend/database/src/schema/questions.schema.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts backend/database/src/repositories/drizzle-question-publication.repository.ts backend/database/src/repositories/drizzle-question-publication.repository.spec.ts backend/database/src/queries/drizzle-admin-question.query.ts backend/database/src/queries/drizzle-admin-question.query.spec.ts backend/database/src/queries/drizzle-learner-question.query.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts
git commit -m "feat(database): persist inline span choices"
```

### Task 6: API media signing과 공개 응답

**Files:**
- Modify: `backend/api/src/learning/learner-content.service.ts`
- Modify: `backend/api/src/learning/learner-content.service.spec.ts`
- Modify: `backend/api/src/learning/learner-questions.controller.spec.ts`
- Modify: `backend/api/src/learning/learner-vocabularies.controller.spec.ts`

**Interfaces:**
- Consumes: Task 3/5의 private `mediaStorageKey` projection과 Task 1/4의 public contracts.
- Produces: token/expression/example `audioUrl`만 포함하는 strict public response.

- [ ] **Step 1: 응답 단위 media signing 실패 테스트를 작성한다**

```ts
it('문장과 단어와 표현이 같은 storage key를 쓰면 한 번만 서명한다', async () => {
  mediaUrlSigner.sign.mockResolvedValue('https://signed.example/audio');
  const response = await service.getQuestionDetail(userId, questionId);

  expect(mediaUrlSigner.sign).toHaveBeenCalledTimes(1);
  expect(response.blocks[0]?.sentences[0]?.tokens[0]?.audioUrl)
    .toBe('https://signed.example/audio');
  expect(response.blocks[0]?.sentences[0]?.expressions[0]?.audioUrl)
    .toBe('https://signed.example/audio');
  expect(JSON.stringify(response)).not.toContain('mediaStorageKey');
});
```

- [ ] **Step 2: API test가 token/expression URL 누락으로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/api/src/learning/learner-content.service.spec.ts backend/api/src/learning/learner-questions.controller.spec.ts backend/api/src/learning/learner-vocabularies.controller.spec.ts`

Expected: FAIL with missing `audioUrl` or excessive signer calls.

- [ ] **Step 3: 응답 로컬 memoized signer와 sentence mapper를 구현한다**

```ts
const createResponseMediaSigner = () => {
  const cache = new Map<string, Promise<string>>();
  return (storageKey: string | null): Promise<string | null> => {
    if (storageKey === null) return Promise.resolve(null);
    const existing = cache.get(storageKey);
    if (existing !== undefined) return existing;
    const signed = this.mediaUrlSigner.sign(storageKey);
    cache.set(storageKey, signed);
    return signed;
  };
};
```

`mapSentence()`는 sentence, tokens, expressions의 key를 위 함수로 서명한 뒤 `parseLearnerPublicResponse(publicThaiSentenceSchema, value)`를 호출한다. `getQuestionDetail`, `submitQuestionAttempt`의 explanation, `getVocabularyDetail`은 각각 응답당 signer 하나를 공유한다.

- [ ] **Step 4: API focused tests와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/api/src/learning/learner-content.service.spec.ts backend/api/src/learning/learner-questions.controller.spec.ts backend/api/src/learning/learner-vocabularies.controller.spec.ts && pnpm --filter @flex-thia/api typecheck`

Expected: PASS.

- [ ] **Step 5: API projection 변경을 커밋한다**

```bash
git add backend/api/src/learning/learner-content.service.ts backend/api/src/learning/learner-content.service.spec.ts backend/api/src/learning/learner-questions.controller.spec.ts backend/api/src/learning/learner-vocabularies.controller.spec.ts
git commit -m "feat(api): sign Thai feedback audio"
```

### Task 7: 태국어 문장 segmentation과 음성 상호작용

**Files:**
- Create: `frontend/web/src/features/explore-thai-content/index.ts`
- Create: `frontend/web/src/features/explore-thai-content/model/segmentThaiSentence.ts`
- Create: `frontend/web/src/features/explore-thai-content/model/segmentThaiSentence.test.ts`
- Create: `frontend/web/src/features/explore-thai-content/ui/ThaiFeedbackTrigger.tsx`
- Create: `frontend/web/src/features/explore-thai-content/ui/ThaiFeedbackTrigger.test.tsx`
- Create: `frontend/web/src/features/explore-thai-content/ui/InteractiveThaiSentence.tsx`
- Create: `frontend/web/src/features/explore-thai-content/ui/InteractiveThaiSentence.test.tsx`

**Interfaces:**
- Consumes: `PublicThaiSentence` from Task 1.
- Produces: `segmentThaiSentence(sentence)`, `ThaiFeedbackTrigger`, `InteractiveThaiSentence`.

- [ ] **Step 1: code-point segmentation과 접근성 실패 테스트를 작성한다**

```ts
it('원문 공백과 문장부호를 보존하면서 token을 분리한다', () => {
  expect(segmentThaiSentence(makeSentence('ฉัน รักไทย!', [
    makeToken({ surface: 'ฉัน', startOffset: 0, endOffset: 3 }),
    makeToken({ surface: 'รักไทย', startOffset: 4, endOffset: 10 }),
  ]))).toEqual([
    { kind: 'TOKEN', text: 'ฉัน', tokenIndex: 0 },
    { kind: 'TEXT', text: ' ' },
    { kind: 'TOKEN', text: 'รักไทย', tokenIndex: 1 },
    { kind: 'TEXT', text: '!' },
  ]);
});

it('focus와 Enter로 피드백을 열고 음성을 재생한다', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    .mockResolvedValue(undefined);
  render(<InteractiveThaiSentence sentence={makeInteractiveSentence()} />);
  const token = screen.getByRole('button', { name: 'ฉัน 뜻과 발음 듣기' });
  token.focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByText('나')).toBeVisible();
  expect(play).toHaveBeenCalledOnce();
});
```

대표 expression badge만 보이는 사례, tap 한 번에 정보 표시와 재생, `play()` rejection이 `role="status"`에 노출되는 사례를 같은 파일에 추가한다.

- [ ] **Step 2: feature tests가 모듈 부재로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/features/explore-thai-content`

Expected: FAIL with missing modules.

- [ ] **Step 3: segmentation과 비모달 feedback trigger를 최소 구현한다**

```ts
/** 원문의 code point offset을 보존하는 표시 segment. */
export type ThaiSentenceSegment =
  | { kind: 'TEXT'; text: string }
  | { kind: 'TOKEN'; text: string; tokenIndex: number };

/** 원문과 token offset으로 손실 없는 표시 segment를 만든다. */
export function segmentThaiSentence(
  sentence: PublicThaiSentence,
): ThaiSentenceSegment[] {
  const codePoints = Array.from(sentence.originalText);
  const segments: ThaiSentenceSegment[] = [];
  let cursor = 0;
  for (const token of [...sentence.tokens].sort((a, b) => a.startOffset - b.startOffset)) {
    if (cursor < token.startOffset) {
      segments.push({ kind: 'TEXT', text: codePoints.slice(cursor, token.startOffset).join('') });
    }
    segments.push({
      kind: 'TOKEN',
      text: codePoints.slice(token.startOffset, token.endOffset).join(''),
      tokenIndex: token.position,
    });
    cursor = token.endOffset;
  }
  if (cursor < codePoints.length) {
    segments.push({ kind: 'TEXT', text: codePoints.slice(cursor).join('') });
  }
  return segments;
}
```

`InteractiveThaiSentence`는 token trigger와 대표 expression badge를 sibling으로 렌더링한다. 새 audio 재생 전 현재 audio를 `pause()`하고 `currentTime = 0`으로 되돌린다. `play()` Promise rejection은 한국어 오류 문구로 `aria-live="polite"`에 표시한다.

- [ ] **Step 4: feature tests와 web typecheck가 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/features/explore-thai-content && pnpm --filter @flex-thia/web typecheck`

Expected: PASS.

- [ ] **Step 5: 상호작용 feature를 커밋한다**

```bash
git add frontend/web/src/features/explore-thai-content
git commit -m "feat(web): add interactive Thai sentence"
```

### Task 8: 문제 본문·대화·듣기 대본·문장 주석

**Files:**
- Create: `frontend/web/src/pages/question-solving/ui/QuestionContent.tsx`
- Modify: `frontend/web/src/pages/question-solving/model/questionViewModel.ts`
- Create: `frontend/web/src/pages/question-solving/model/questionViewModel.test.ts`
- Modify: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPageView.tsx`
- Modify: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPage.test.tsx`

**Interfaces:**
- Consumes: Task 7의 `InteractiveThaiSentence`, `QuestionDetailResponse`.
- Produces: block-aware `QuestionContent`, 제출 전후 transcript reveal state.

- [ ] **Step 1: block 표시와 대본 공개의 실패 테스트를 작성한다**

```ts
it('화자별 대화와 문장 번호 주석을 렌더링한다', () => {
  renderQuestion(makeDialogueQuestion());
  expect(screen.getByText('A')).toBeVisible();
  expect(screen.getByText('B')).toBeVisible();
  expect(screen.getByRole('button', { name: '1번 문장 뜻과 발음 듣기' }))
    .toBeVisible();
  expect(screen.getByRole('complementary', { name: '문장별 주석' }))
    .toBeVisible();
});

it('듣기 대본은 제출 전 숨기고 제출 직후 자동 공개한다', async () => {
  renderQuestion(makeAudioThenRevealQuestion());
  expect(screen.queryByText('숨긴 대본')).not.toBeInTheDocument();
  await submitCorrectOption();
  expect(await screen.findByText('숨긴 대본')).toBeVisible();
});
```

좁은 viewport에서 `문장별 주석 열기` control이 있고 같은 목록을 보여주는 사례를 추가한다.

- [ ] **Step 2: question page tests가 현재 평탄화 UI 때문에 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/question-solving/model/questionViewModel.test.ts src/pages/question-solving/ui/QuestionSolvingPage.test.tsx`

Expected: FAIL with missing speaker/annotation/transcript behavior.

- [ ] **Step 3: block-aware view model과 QuestionContent를 구현한다**

```ts
/** 문제 block을 표시 정보 손실 없이 전달하는 view model. */
export interface QuestionBlockViewModel {
  id: string;
  kind: 'INSTRUCTION' | 'PASSAGE' | 'DIALOGUE' | 'QUESTION';
  position: number;
  sentences: QuestionDetailResponse['blocks'][number]['sentences'];
}

/** 문제 상세의 block 순서를 보존한다. */
export function toQuestionBlockViewModels(
  detail: QuestionDetailResponse,
): QuestionBlockViewModel[] {
  return [...detail.blocks]
    .sort((a, b) => a.position - b.position)
    .map((block) => ({
      id: block.id,
      kind: block.kind,
      position: block.position,
      sentences: [...block.sentences].sort((a, b) => a.position - b.position),
    }));
}
```

`QuestionContent`는 DIALOGUE에서 speaker별 행, 그 외에는 자연스러운 paragraph 흐름을 사용한다. 번호 trigger는 `InteractiveThaiSentence`와 같은 feedback/audio 정책을 사용한다. desktop annotation은 `<aside aria-label="문장별 주석">`, mobile은 기존 Sheet primitive를 사용한다. `AUDIO_THEN_REVEAL`은 `submitted` prop이 false일 때 audio만 보이고 true가 되면 본문을 즉시 표시한다.

- [ ] **Step 4: 문제 표시 focused tests가 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/question-solving/model/questionViewModel.test.ts src/pages/question-solving/ui/QuestionSolvingPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: 문제 본문 변경을 커밋한다**

```bash
git add frontend/web/src/pages/question-solving
git commit -m "feat(web): render interactive question content"
```

### Task 9: inline option 선택과 제출 후 해설

**Files:**
- Modify: `frontend/web/src/features/submit-answer/ui/SubmitAnswerForm.tsx`
- Modify: `frontend/web/src/features/submit-answer/ui/SubmitAnswerForm.test.tsx`
- Modify: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPageView.tsx`
- Modify: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPage.test.tsx`

**Interfaces:**
- Consumes: Task 4의 option `span`, Task 8의 `QuestionContent`, 제출 응답의 `correctOptionId`와 `explanationBlocks`.
- Produces: standard/inline 공통 radio selection, 선택·정답 상태 유지, interactive explanation.

- [ ] **Step 1: inline 선택과 제출 결과의 실패 테스트를 작성한다**

```ts
it('inline 범위를 문장 안에 표시하고 별도 radio로 선택한다', async () => {
  renderQuestion(makeInlineQuestion());
  expect(screen.getAllByTestId('inline-option-span')).toHaveLength(4);
  const radios = screen.getAllByRole('radio');
  expect(radios).toHaveLength(4);
  await userEvent.click(radios[1]!);
  expect(radios[1]).toBeChecked();
  expect(radios[1]!.querySelector('button')).toBeNull();
});

it('제출 뒤 선택지와 선택·정답 상태 및 상호작용 해설을 유지한다', async () => {
  renderQuestion(makeQuestionWithExplanation());
  await submitWrongOption();
  expect(screen.getByRole('radio', { name: /선택한 답/ })).toBeChecked();
  expect(screen.getByText('정답')).toBeVisible();
  expect(screen.getByRole('button', { name: 'เพราะ 뜻과 발음 듣기' }))
    .toBeVisible();
});
```

radio arrow key 이동, option wrapper 안에 token button이 중첩되지 않는 DOM assertion도 추가한다.

- [ ] **Step 2: 제출 form/page tests가 기존 결과 UI 때문에 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/features/submit-answer/ui/SubmitAnswerForm.test.tsx src/pages/question-solving/ui/QuestionSolvingPage.test.tsx`

Expected: FAIL with removed options or missing inline/explanation controls.

- [ ] **Step 3: option presentation을 template별로 분기하고 결과를 보존한다**

`SubmitAnswerFormProps.options`를 다음 구조로 바꾼다.

```ts
interface SubmitAnswerOption {
  id: string;
  label: string;
  span: {
    sentenceVersionId: string;
    startTokenIndex: number;
    endTokenIndex: number;
  } | null;
}
```

선택 control은 모두 native radio semantics를 사용한다. inline span은 `aria-describedby`로 radio와 연결된 비상호작용 `<mark data-testid="inline-option-span">`이고, token feedback trigger는 mark와 sibling이다. 제출 성공 뒤 form을 제거하지 않고 disabled 상태로 유지하며 selected option과 `response.correctOptionId`를 표시한다. `response.explanationBlocks`는 `QuestionContent`에 전달한다.

- [ ] **Step 4: 제출/inline tests와 web typecheck가 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/features/submit-answer/ui/SubmitAnswerForm.test.tsx src/pages/question-solving/ui/QuestionSolvingPage.test.tsx && pnpm --filter @flex-thia/web typecheck`

Expected: PASS.

- [ ] **Step 5: inline UI와 해설 변경을 커밋한다**

```bash
git add frontend/web/src/features/submit-answer frontend/web/src/pages/question-solving
git commit -m "feat(web): solve inline span questions"
```

### Task 10: 기능 브랜치 공용 export 조립과 집중 검증

**Files:**
- Modify: `shared/contracts/src/index.ts`
- Modify: `backend/domain/src/index.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `frontend/web/src/features/explore-thai-content/index.ts`

**Interfaces:**
- Consumes: Tasks 1–9의 새 공개 exports.
- Produces: 기존 package import 경로에서 접근 가능한 public API.

- [ ] **Step 1: package 공개 import 실패 테스트를 추가한다**

각 기존 package index test 또는 가장 가까운 contract/domain/database spec에서 다음 imports가 정의되는지 확인한다.

```ts
import {
  publicThaiSentenceSchema,
  type PublicThaiSentence,
} from '@flex-thia/contracts';
import {
  type QuestionOptionSpan,
  type ThaiTokenRole,
} from '@flex-thia/domain';
```

- [ ] **Step 2: package typecheck가 누락 export로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/contracts typecheck && pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/web typecheck`

Expected: FAIL with missing public exports.

- [ ] **Step 3: 필요한 export만 공용 index에 추가한다**

```ts
export * from './thai-content/sentences';
```

domain/database는 기존 wildcard가 새 type을 이미 공개하면 파일을 수정하지 않는다. `app.module.ts`, OpenAPI 공용 DTO, route source, route tree는 이 브랜치에서 변경하지 않는다.

- [ ] **Step 4: 기능 브랜치 전체 focused gate를 실행한다**

Run:

```bash
pnpm exec vitest run shared/contracts/src/thai-content shared/contracts/src/learning/questions.spec.ts shared/contracts/src/learning/vocabularies.spec.ts
pnpm exec vitest run backend/domain/src/thai-content backend/domain/src/questions/question-version.spec.ts backend/domain/src/content-import/content-draft.spec.ts
pnpm exec vitest run backend/database/src/queries/drizzle-learner-question.query.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts backend/database/src/repositories/drizzle-question-admin.repository.spec.ts backend/database/src/repositories/drizzle-question-publication.repository.spec.ts
pnpm exec vitest run backend/api/src/learning/learner-content.service.spec.ts
pnpm --filter @flex-thia/web exec vitest run src/features/explore-thai-content src/pages/question-solving src/features/submit-answer
pnpm structure:check
pnpm --filter @flex-thia/web architecture:check
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: 공용 export를 격리 커밋한다**

```bash
git add shared/contracts/src/index.ts backend/domain/src/index.ts backend/database/src/index.ts frontend/web/src/features/explore-thai-content/index.ts
git commit -m "chore(thai-content): wire learning interactions"
```

### Task 11: 통합 담당자의 migration·어휘 예문·생성 파일 조립

**Files:**
- Generate: `backend/database/drizzle/<next>_thai_learning_interactions.sql`
- Generate: `backend/database/drizzle/meta/<next>_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`
- Generate: `frontend/web/src/routeTree.gen.ts` only if route generation changes it.

**Interfaces:**
- Consumes: 병합된 Thai branch와 multiple-wordbooks branch.
- Produces: 실제 DB migration과 어휘 예문의 interactive sentence 연결.

- [ ] **Step 1: 병합 후 schema 차이와 어휘 예문 회귀 테스트를 작성한다**

```ts
it('어휘 상세 예문의 태국어 단어 피드백을 탐색한다', async () => {
  renderVocabularyDetail(makeVocabularyDetailWithInteractiveExample());
  expect(screen.getByRole('button', { name: 'ฉัน 뜻과 발음 듣기' }))
    .toBeVisible();
});
```

- [ ] **Step 2: 어휘 상세 test가 기존 정적 예문 UI로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`

Expected: FAIL with missing token feedback trigger.

- [ ] **Step 3: 어휘 예문을 InteractiveThaiSentence로 연결한다**

```tsx
<InteractiveThaiSentence
  key={example.sentenceVersionId}
  sentence={example}
  showTranslation
/>
```

복수 단어장 picker와 sibling section으로 유지하고 양쪽 feature 내부를 수정하지 않는다.

- [ ] **Step 4: Drizzle migration을 순차 생성하고 SQL을 검토한다**

Run: `pnpm --filter @flex-thia/database db:generate`

Expected: expression feedback columns, inline option span columns/check/FK만 포함한 새 migration과 snapshot이 생성되고 기존 table을 drop하지 않는다.

- [ ] **Step 5: 통합 focused gate가 통과하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts
pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx
pnpm --filter @flex-thia/database typecheck
pnpm --filter @flex-thia/web typecheck
pnpm structure:check
```

Expected: PASS.

- [ ] **Step 6: migration과 교차 브랜치 연결을 커밋한다**

```bash
git add backend/database/drizzle frontend/web/src/pages/vocabulary-detail frontend/web/src/routeTree.gen.ts
git commit -m "feat(thai-content): integrate learning interactions"
```

### Task 12: Wave 통합 전체 검증

**Files:**
- Verify only: repository-wide source and tests.

**Interfaces:**
- Consumes: Tasks 1–11.
- Produces: 다음 Wave가 사용할 수 있는 검증된 `main`.

- [ ] **Step 1: signed URL 장시간 체류 제한을 운영 문서에 기록한다**

`docs/superpowers/specs/2026-07-26-full-product-parallel-delivery-design.md`의 Wave 1 수용 기준에 “현재 5분 signed URL은 화면 장시간 체류 중 만료될 수 있으며, 자동 갱신은 후속 media 운영 Wave에서 처리한다”를 한 줄 추가한다.

- [ ] **Step 2: 저장소 전체 품질 gate를 실행한다**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm structure:check
pnpm --filter @flex-thia/web architecture:check
pnpm --filter @flex-thia/web coverage
pnpm --filter @flex-thia/web build
```

Expected: 모든 command exit 0. native watcher가 `EMFILE`이면 같은 command를 `CHOKIDAR_USEPOLLING=1`로 다시 실행하고 그 결과를 기록한다.

- [ ] **Step 3: 변경 범위와 금지 파일을 확인한다**

Run: `git diff --check && git status --short && git log --oneline --decorate -12`

Expected: whitespace error 없음, 의도하지 않은 package/lock 변경 없음, migration과 route tree는 Task 11 통합 커밋에만 존재.

- [ ] **Step 4: 전체 검증 기록을 커밋한다**

```bash
git add docs/superpowers/specs/2026-07-26-full-product-parallel-delivery-design.md
git commit -m "docs(thai-content): record interaction verification"
```
