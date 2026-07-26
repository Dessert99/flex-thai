# Multiple Wordbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 `saved_vocabularies` 목록을 사용자 소유 복수 단어장으로 안전하게 전환하고 생성·이름 변경·삭제·검색·필터·페이지네이션·선택 항목 복사·이동·제거를 제공한다.

**Architecture:** `learning` 모듈에 `wordbooks`와 `wordbook_items`를 두고, 쓰기는 domain port를 구현하는 transaction repository가, 목록은 별도 read query가 담당한다. 공개 계약은 `shared/contracts`, HTTP와 media URL 조립은 `backend/api`, 화면 전용 조회 상태는 `pages`, 재사용 행동은 `features`가 소유한다. 기능 브랜치는 새 기능 파일과 직접 소유 파일만 변경하고 migration 생성물, route tree, root 조립, 공용 vocabulary detail 연결은 통합 담당자가 순서대로 반영한다.

**Tech Stack:** TypeScript 7, NestJS 11, Zod 4, PostgreSQL 16, Drizzle ORM 0.45, React 19, TanStack Query/Router, Tailwind CSS, shadcn, Vitest 4

## Global Constraints

- 같은 공용 어휘를 여러 단어장에 저장하되 공용 어휘 데이터를 사용자별로 복제하지 않는다.
- 새 단어장 이름은 trim 후 1~50자이며 한 사용자 안에서 exact 문자열이 중복될 수 없다.
- bulk 요청은 서로 다른 UUID 1~100개만 허용한다.
- 타 사용자 단어장은 존재 여부를 숨기기 위해 `404`로 처리한다.
- 추가는 현재 `PUBLISHED` 어휘만 허용하고, 기존 항목의 이동·복사·제거는 이후 어휘 상태와 무관하게 허용한다.
- 검색은 태국어 정규화 표기, 한국어 뜻, 한국어 발음을 대상으로 하고 종류·품사·난이도 필터와 페이지 번호 방식 페이지네이션을 제공한다.
- 목록 정렬은 `added_at DESC, vocabulary_id ASC`로 고정한다.
- 새 코드와 변경 코드는 `conventions/comment-convention.md`를 따르고 테스트 설명은 한국어로 작성한다.
- E2E runner·설정·spec을 추가하지 않는다.
- 새 패키지, 환경 변수, root/workspace `package.json`, `pnpm-lock.yaml`을 변경하지 않는다.
- 기능 브랜치는 `backend/database/drizzle/**`와 `frontend/web/src/routeTree.gen.ts`를 커밋하지 않는다.
- 기능 브랜치의 package 공개 `index.ts` 변경은 마지막 export 커밋으로 모으고, application root 조립은 통합 담당자만 수행한다.
- Wave 2가 소유하는 단어 연습 화면이나 session을 추측해 만들지 않으며, 이 계획은 후속 연습 기능이 소비할 `wordbookId`와 item 조회 계약까지만 제공한다.

---

## File Structure

### 기능 브랜치가 생성하는 파일

- `shared/contracts/src/learning/wordbooks.ts`: 단어장 요청·응답 Zod 계약과 공개 타입
- `shared/contracts/src/learning/wordbooks.spec.ts`: strict 입력·응답 계약 테스트
- `backend/domain/src/learning/wordbook.repository.ts`: 단어장 write port와 transaction 입력
- `backend/domain/src/learning/wordbook.ts`: 이름 규칙과 생성·변경·bulk use case
- `backend/domain/src/learning/wordbook.spec.ts`: 프레임워크 독립 업무 규칙 테스트
- `backend/database/src/repositories/drizzle-wordbook.repository.ts`: 소유권·lock·원자 이동 write adapter
- `backend/database/src/repositories/drizzle-wordbook.repository.spec.ts`: SQL shape와 PostgreSQL 동시성 테스트
- `backend/database/src/queries/drizzle-wordbook.query.ts`: 단어장 목록·상세 검색 read model
- `backend/database/src/queries/drizzle-wordbook.query.spec.ts`: 중복 없는 검색·페이지 projection 테스트
- `backend/api/src/learning/learner-wordbooks.service.ts`: DB projection의 media URL·공개 응답 조립
- `backend/api/src/learning/learner-wordbooks.service.spec.ts`: strict 공개 응답과 위임 테스트
- `backend/api/src/learning/learner-wordbooks.controller.ts`: 인증된 학습자 HTTP 경계
- `backend/api/src/learning/learner-wordbooks.controller.spec.ts`: guard·Zod·HTTP metadata 테스트
- `frontend/web/src/pages/wordbook-list/**`: 단어장 목록 화면과 서버 상태
- `frontend/web/src/pages/wordbook-detail/**`: 검색·필터·페이지·선택 화면과 서버 상태
- `frontend/web/src/features/manage-wordbook/**`: 생성·이름 변경·삭제 행동
- `frontend/web/src/features/manage-wordbook-items/**`: 복사·이동·제거 행동
- `frontend/web/src/features/save-vocabulary-to-wordbooks/**`: 어휘별 단어장 membership picker

### 기능 브랜치가 수정하는 파일

- `backend/database/src/schema/learning.schema.ts`
- `backend/database/src/schema/learning.schema.spec.ts`
- `backend/domain/src/learning/saved-content.repository.ts`
- `backend/domain/src/learning/saved-content.ts`
- `backend/domain/src/learning/saved-content.spec.ts`
- `backend/database/src/repositories/drizzle-learning.repository.ts`
- `backend/database/src/repositories/drizzle-learning.repository.spec.ts`
- `backend/database/src/queries/drizzle-learner-vocabulary.query.ts`
- `backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts`
- `shared/contracts/src/learning/vocabularies.ts`
- `shared/contracts/src/learning/vocabularies.spec.ts`
- `backend/domain/src/index.ts`: 기능 브랜치 마지막 공개 export 커밋
- `backend/database/src/index.ts`: 기능 브랜치 마지막 공개 export 커밋
- `shared/contracts/src/index.ts`: 기능 브랜치 마지막 공개 export 커밋

### 통합 담당자만 수정·생성하는 파일

- `backend/api/src/app.module.ts`
- `backend/api/src/learning/learning.module.ts`
- `backend/api/src/learning/learning.module.spec.ts`
- `backend/api/src/openapi/openapi.dto.ts`
- `backend/api/src/openapi/openapi.spec.ts`
- `backend/api/src/common/errors/domain-exception.filter.ts`
- `backend/api/src/common/errors/domain-exception.filter.spec.ts`
- `backend/database/seed/local.sql`
- `backend/database/drizzle/<generated-migration>.sql`
- `backend/database/drizzle/meta/<generated-snapshot>.json`
- `backend/database/drizzle/meta/_journal.json`
- `frontend/web/src/app/routes/_authenticated._learner.wordbooks.index.tsx`
- `frontend/web/src/app/routes/_authenticated._learner.wordbooks.$wordbookId.tsx`
- `frontend/web/src/app/routing/learnerNavigation.ts`
- `frontend/web/src/app/routing/redirectSearch.ts`
- `frontend/web/src/app/routing/routeReachability.test.ts`
- `frontend/web/src/app/routes/__root.tsx`
- `frontend/web/src/routeTree.gen.ts`
- `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`
- `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`

---

### Task 1: 공개 단어장 계약

**Files:**
- Create: `shared/contracts/src/learning/wordbooks.ts`
- Create: `shared/contracts/src/learning/wordbooks.spec.ts`

**Interfaces:**
- Consumes: 기존 `pageMetadataSchema`, 공용 어휘 summary 필드와 HTTP 정수 parsing 방식
- Produces: 아래 schema와 동명의 `z.infer` 타입

```ts
const httpIntegerSchema = (minimum: number, maximum: number) =>
  z.union([
    z.number(),
    z.string().regex(/^(?:0|[1-9]\d*)$/u).transform(Number),
  ]).pipe(z.number().safe().int().min(minimum).max(maximum));
const rejectDuplicateVocabularyIds = (
  value: { vocabularyIds: string[] },
  context: z.RefinementCtx,
) => {
  if (new Set(value.vocabularyIds).size !== value.vocabularyIds.length) {
    context.addIssue({
      code: 'custom',
      message: '같은 어휘를 중복 선택할 수 없습니다.',
      path: ['vocabularyIds'],
    });
  }
};
export const wordbookNameRequestSchema = z.object({
  name: z.string().trim().min(1).max(50),
}).strict();
export const wordbookIdPathSchema = z.object({ wordbookId: z.uuid() }).strict();
export const wordbookItemPathSchema = z.object({
  wordbookId: z.uuid(),
  vocabularyId: z.uuid(),
}).strict();
export const wordbookItemListQuerySchema = z.object({
  query: z.string().trim().min(1).optional(),
  kind: z.enum(['WORD', 'EXPRESSION']).optional(),
  partOfSpeech: z.string().trim().min(1).optional(),
  difficulty: httpIntegerSchema(1, 5).optional(),
  page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
  pageSize: httpIntegerSchema(1, 100).default(20),
}).strict();
export const wordbookBulkItemsRequestSchema = z.object({
  vocabularyIds: z.array(z.uuid()).min(1).max(100),
  targetWordbookId: z.uuid(),
}).strict().superRefine(rejectDuplicateVocabularyIds);
export const wordbookRemoveItemsRequestSchema = z.object({
  vocabularyIds: z.array(z.uuid()).min(1).max(100),
}).strict().superRefine(rejectDuplicateVocabularyIds);
export const wordbookSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  itemCount: z.number().safe().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export const wordbookListResponseSchema = z.object({
  items: z.array(wordbookSummarySchema),
}).strict();
export const wordbookResponseSchema = wordbookSummarySchema;
export const wordbookItemListResponseSchema = z.object({
  wordbook: wordbookSummarySchema,
  items: z.array(vocabularySummarySchema.extend({
    addedAt: z.iso.datetime(),
  })),
  page: pageMetadataSchema,
}).strict();
export const vocabularyWordbookMembershipResponseSchema = z.object({
  wordbookIds: z.array(z.uuid()),
}).strict();
```

- [ ] **Step 1: RED 계약 테스트를 작성한다**

`wordbooks.spec.ts`에 이름 trim, 기본 page, 검색 필터, UUID path, 중복 없는 1~100 bulk UUID, strict unknown-key 거부, ISO 시각과 private `storageKey` 거부를 각각 한국어 `it`으로 작성한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
pnpm exec vitest run shared/contracts/src/learning/wordbooks.spec.ts
```

Expected: FAIL — `./wordbooks.js` 또는 위 schema export를 찾지 못한다.

- [ ] **Step 3: 최소 GREEN 계약을 구현한다**

`wordbooks.ts`에 위 schema를 그대로 구현하고 각 schema의 `WordbookNameRequest`, `WordbookIdPath`, `WordbookItemPath`, `WordbookItemListQuery`, `WordbookBulkItemsRequest`, `WordbookRemoveItemsRequest`, `WordbookSummary`, `WordbookListResponse`, `WordbookResponse`, `WordbookItemListResponse`, `VocabularyWordbookMembershipResponse` 타입을 export한다.

- [ ] **Step 4: GREEN을 확인한다**

Run:

```bash
pnpm exec vitest run shared/contracts/src/learning/wordbooks.spec.ts
```

Expected: PASS.

- [ ] **Step 5: 작은 커밋을 만든다**

```bash
git add shared/contracts/src/learning/wordbooks.ts shared/contracts/src/learning/wordbooks.spec.ts
git commit -m "feat(contracts): define wordbook API contracts"
```

### Task 2: 단어장 domain port와 업무 규칙

**Files:**
- Create: `backend/domain/src/learning/wordbook.repository.ts`
- Create: `backend/domain/src/learning/wordbook.ts`
- Create: `backend/domain/src/learning/wordbook.spec.ts`

**Interfaces:**
- Consumes: UUID string, `Date`, trim 전 사용자 입력 이름
- Produces:

```ts
export interface WordbookRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface WordbookTransferInput {
  userId: string;
  sourceWordbookId: string;
  targetWordbookId: string;
  vocabularyIds: string[];
  transferredAt: Date;
}
export interface WordbookRemoveInput {
  userId: string;
  wordbookId: string;
  vocabularyIds: string[];
}
export interface WordbookRepository {
  create(userId: string, name: string, now: Date): Promise<WordbookRecord>;
  rename(
    userId: string,
    wordbookId: string,
    name: string,
    now: Date,
  ): Promise<WordbookRecord | null>;
  delete(userId: string, wordbookId: string): Promise<boolean>;
  addVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
    addedAt: Date,
  ): Promise<
    | 'ADDED'
    | 'ALREADY_EXISTS'
    | 'WORDBOOK_NOT_FOUND'
    | 'VOCABULARY_UNAVAILABLE'
  >;
  removeVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<boolean>;
  copyVocabularies(input: WordbookTransferInput): Promise<boolean>;
  moveVocabularies(input: WordbookTransferInput): Promise<boolean>;
  removeVocabularies(input: WordbookRemoveInput): Promise<boolean>;
}
export class WordbookDomainError extends Error {
  readonly code:
    | 'WORDBOOK_NAME_INVALID'
    | 'WORDBOOK_NOT_FOUND'
    | 'WORDBOOK_SAME_TARGET'
    | 'VOCABULARY_UNAVAILABLE';
}
export class WordbookService {
  constructor(repository: WordbookRepository, now?: () => Date);
  create(userId: string, name: string): Promise<WordbookRecord>;
  rename(userId: string, wordbookId: string, name: string): Promise<WordbookRecord>;
  delete(userId: string, wordbookId: string): Promise<void>;
  addVocabulary(userId: string, wordbookId: string, vocabularyId: string): Promise<void>;
  removeVocabulary(userId: string, wordbookId: string, vocabularyId: string): Promise<void>;
  copyVocabularies(userId: string, sourceWordbookId: string, targetWordbookId: string, vocabularyIds: string[]): Promise<void>;
  moveVocabularies(userId: string, sourceWordbookId: string, targetWordbookId: string, vocabularyIds: string[]): Promise<void>;
  removeVocabularies(userId: string, wordbookId: string, vocabularyIds: string[]): Promise<void>;
}
```

- [ ] **Step 1: RED domain 테스트를 작성한다**

fake repository로 이름 trim, 공백/51자 거부, 없는 단어장 404 code, source와 target 동일 거부, repository에 userId·고정 시각·선택 ID가 정확히 전달되는지를 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run backend/domain/src/learning/wordbook.spec.ts
```

Expected: FAIL — `WordbookService`가 없다.

- [ ] **Step 3: 최소 GREEN을 구현한다**

이름은 domain에서도 `trim()` 후 길이를 검사하고, repository의 `null`/`false`/`WORDBOOK_NOT_FOUND`/`VOCABULARY_UNAVAILABLE`를 같은 의미의 `WordbookDomainError`로 변환한다. copy/move에서 source와 target이 같으면 repository를 호출하지 않고 `WORDBOOK_SAME_TARGET`으로 실패시킨다. DB unique 경합에서만 생기는 이름 충돌은 adapter의 `WordbookPersistenceError('WORDBOOK_NAME_CONFLICT')`가 표현한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run backend/domain/src/learning/wordbook.spec.ts
```

Expected: PASS.

- [ ] **Step 5: 작은 커밋을 만든다**

```bash
git add backend/domain/src/learning/wordbook.repository.ts backend/domain/src/learning/wordbook.ts backend/domain/src/learning/wordbook.spec.ts
git commit -m "feat(domain): add wordbook use cases"
```

### Task 3: 단어장 schema

**Files:**
- Modify: `backend/database/src/schema/learning.schema.ts`
- Modify: `backend/database/src/schema/learning.schema.spec.ts`

**Interfaces:**
- Produces: `export const wordbooks`, `export const wordbookItems`

```ts
export const wordbooks = pgTable('wordbooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('wordbooks_user_name_unique').on(table.userId, table.name),
]);
export const wordbookItems = pgTable('wordbook_items', {
  wordbookId: uuid('wordbook_id').references(() => wordbooks.id, { onDelete: 'cascade' }).notNull(),
  vocabularyId: uuid('vocabulary_id').references(() => vocabularies.id, { onDelete: 'restrict' }).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ name: 'wordbook_items_pk', columns: [table.wordbookId, table.vocabularyId] }),
  index('wordbook_items_vocabulary_id_idx').on(table.vocabularyId),
  index('wordbook_items_page_idx').on(
    table.wordbookId,
    table.addedAt.desc(),
    table.vocabularyId.asc(),
  ),
]);
```

- [ ] **Step 1: RED schema 테스트를 작성한다**

정확한 column, unique, PK, index, `users RESTRICT`, `vocabularies RESTRICT`, `wordbooks CASCADE`를 Drizzle metadata로 검증한다. `savedVocabularies`는 migration 전 호환을 위해 아직 존재해야 한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/schema/learning.schema.spec.ts
```

Expected: FAIL — `wordbooks`/`wordbookItems`가 없다.

- [ ] **Step 3: 최소 GREEN schema를 구현한다**

위 두 table만 추가하고 기존 답안·저장 문제 schema를 변경하지 않는다. migration SQL과 snapshot은 생성하지 않는다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run backend/database/src/schema/learning.schema.spec.ts
```

Expected: PASS.

- [ ] **Step 5: 작은 커밋을 만든다**

```bash
git add backend/database/src/schema/learning.schema.ts backend/database/src/schema/learning.schema.spec.ts
git commit -m "feat(database): define wordbook tables"
```

### Task 4: 원자적 단어장 write repository

**Files:**
- Create: `backend/database/src/repositories/drizzle-wordbook.repository.ts`
- Create: `backend/database/src/repositories/drizzle-wordbook.repository.spec.ts`

**Interfaces:**
- Consumes: Task 2 `WordbookRepository`
- Produces: `export class DrizzleWordbookRepository implements WordbookRepository`

- [ ] **Step 1: RED 생성·변경·삭제 테스트를 작성한다**

fake Drizzle call 기록으로 create returning 1행, rename/delete의 `(user_id, id)` 조건, 같은 이름 unique violation의 `WordbookPersistenceError('WORDBOOK_NAME_CONFLICT')`, 삭제 0행의 `false`를 검증한다.

- [ ] **Step 2: 첫 RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts -t "단어장"
```

Expected: FAIL — repository가 없다.

- [ ] **Step 3: 생성·변경·삭제 최소 GREEN을 구현한다**

```ts
export class WordbookPersistenceError extends Error {
  constructor(
    readonly code: 'WORDBOOK_NAME_CONFLICT' | 'WORDBOOK_PERSISTENCE_CONFLICT',
    readonly operation: string,
  ) { super(`${code}:${operation}`); }
}
export class DrizzleWordbookRepository implements WordbookRepository {
  constructor(private readonly database: WordbookDatabase) {}
}
```

PostgreSQL unique constraint명 `wordbooks_user_name_unique`만 name conflict로 번역하고 나머지는 generic persistence conflict로 유지한다.

- [ ] **Step 4: 생성·변경·삭제 GREEN을 확인한다**

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts -t "단어장"
```

Expected: PASS.

- [ ] **Step 5: RED add/remove 테스트를 작성한다**

add가 한 transaction에서 owned wordbook row를 `FOR UPDATE`로 잠그고 `PUBLISHED` vocabulary를 확인한 뒤 `ON CONFLICT DO NOTHING`하는지, remove는 vocabulary 상태를 조회하지 않고 owned wordbook 아래 membership만 멱등 삭제하는지 검증한다.

- [ ] **Step 6: add/remove RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts -t "항목"
```

Expected: FAIL — add/remove transaction이 없다.

- [ ] **Step 7: add/remove 최소 GREEN을 구현한다**

wordbook이 없으면 `WORDBOOK_NOT_FOUND`, 어휘가 게시되지 않았으면 `VOCABULARY_UNAVAILABLE`, conflict면 `ALREADY_EXISTS`, insert되면 `ADDED`를 반환한다. remove는 소유 단어장이 없을 때만 `false`이고 이미 없는 membership은 성공으로 처리한다.

- [ ] **Step 8: add/remove GREEN을 확인한다**

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts -t "항목"
```

Expected: PASS.

- [ ] **Step 9: RED copy/move/remove 테스트를 작성한다**

두 단어장 row를 UUID 오름차순으로 `FOR UPDATE`하고 모두 같은 user 소유인지 확인한다. copy는 source membership만 `INSERT ... SELECT ... ON CONFLICT DO NOTHING`, move는 같은 transaction에서 copy 뒤 source delete, remove는 source delete만 수행하는지 검증한다.

- [ ] **Step 10: bulk RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts -t "복사|이동|선택 항목 제거"
```

Expected: FAIL — bulk 메서드가 없다.

- [ ] **Step 11: bulk 최소 GREEN을 구현한다**

없는 source/target은 `false`, 기존 target membership은 그대로 유지하며 source에서 실제 선택된 membership만 처리한다. move 중 insert/delete 어느 쪽이 실패해도 transaction이 rollback되게 한다.

- [ ] **Step 12: PostgreSQL 동시성 테스트를 작성하고 확인한다**

기존 env-gated 통합 테스트 패턴으로 동일 이름 동시 생성은 한 성공/한 conflict, A→B와 B→A 동시 이동은 deadlock 없이 종료, delete와 move 동시는 부분 이동이 없음을 검증한다.

```bash
WORDBOOK_REPOSITORY_TEST_DATABASE_URL="$DATABASE_URL" pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts
```

Expected: PostgreSQL 16 환경에서 PASS. env가 없으면 통합 describe만 skip되고 단위 테스트는 PASS.

- [ ] **Step 13: 작은 커밋을 만든다**

```bash
git add backend/database/src/repositories/drizzle-wordbook.repository.ts backend/database/src/repositories/drizzle-wordbook.repository.spec.ts
git commit -m "feat(database): persist wordbook operations atomically"
```

### Task 5: 단어장 검색 read model

**Files:**
- Create: `backend/database/src/queries/drizzle-wordbook.query.ts`
- Create: `backend/database/src/queries/drizzle-wordbook.query.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface WordbookItemListQuery {
  query?: string;
  kind?: 'WORD' | 'EXPRESSION';
  partOfSpeech?: string;
  difficulty?: number;
  page: number;
  pageSize: number;
}
export interface WordbookSummaryProjection {
  id: string;
  name: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface WordbookItemProjection extends LearnerVocabularySummaryProjection {
  addedAt: Date;
}
export class DrizzleWordbookQuery {
  constructor(database: WordbookDatabase);
  listWordbooks(userId: string): Promise<WordbookSummaryProjection[]>;
  listItems(
    userId: string,
    wordbookId: string,
    query: WordbookItemListQuery,
  ): Promise<{ wordbook: WordbookSummaryProjection; items: WordbookItemProjection[]; page: LearnerVocabularyPageMetadata } | null>;
  listMemberships(userId: string, vocabularyId: string): Promise<string[]>;
}
```

- [ ] **Step 1: RED 목록·membership 테스트를 작성한다**

단어장 목록이 user로 제한되고 itemCount가 0도 포함하며 `createdAt ASC, id ASC`로 정렬되는지, membership이 user 소유 단어장 ID만 반환하는지 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/queries/drizzle-wordbook.query.spec.ts
```

Expected: FAIL — query가 없다.

- [ ] **Step 3: 목록·membership 최소 GREEN을 구현한다**

단어장 count는 grouped subquery 또는 correlated count 한 번으로 계산하고 vocabulary row를 복제하지 않는다.

- [ ] **Step 4: 검색 RED 테스트를 작성한다**

태국어 입력은 `normalizeThaiSearchText`, 한국어 뜻·발음은 `ILIKE`, kind/partOfSpeech/difficulty는 같은 vocabulary에 적용한다. 여러 뜻·발음이 일치해도 total과 item은 한 어휘이며 선택된 어휘의 모든 뜻·READY 발음을 반환하는지 검증한다.

- [ ] **Step 5: 검색 RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/queries/drizzle-wordbook.query.spec.ts -t "검색|필터|페이지"
```

Expected: FAIL — listItems filter가 없다.

- [ ] **Step 6: 검색·페이지 최소 GREEN을 구현한다**

base ID page query와 child 뜻·발음 query를 분리해 join fan-out을 피하고, `PUBLISHED` 어휘만 화면에 반환한다. membership 자체는 숨김 어휘에도 남긴다.

- [ ] **Step 7: GREEN을 확인한다**

```bash
pnpm exec vitest run backend/database/src/queries/drizzle-wordbook.query.spec.ts
```

Expected: PASS.

- [ ] **Step 8: 작은 커밋을 만든다**

```bash
git add backend/database/src/queries/drizzle-wordbook.query.ts backend/database/src/queries/drizzle-wordbook.query.spec.ts
git commit -m "feat(database): query wordbooks with filters"
```

### Task 6: 기존 단일 saved vocabulary 경계 축소

**Files:**
- Modify: `backend/domain/src/learning/saved-content.repository.ts`
- Modify: `backend/domain/src/learning/saved-content.ts`
- Modify: `backend/domain/src/learning/saved-content.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-learning.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-learning.repository.spec.ts`
- Modify: `backend/database/src/queries/drizzle-learner-vocabulary.query.ts`
- Modify: `backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts`
- Modify: `shared/contracts/src/learning/vocabularies.ts`
- Modify: `shared/contracts/src/learning/vocabularies.spec.ts`

**Interfaces:**
- Saved question 메서드는 유지한다.
- `SavedContentRepository`/`SavedContentService`/`DrizzleLearningRepository`에서 vocabulary save/remove를 제거한다.
- `DrizzleLearnerVocabularyQuery.listSavedVocabularies`와 `savedVocabularyList*` 계약을 제거한다.
- 공용 목록/상세의 `saved`는 `EXISTS(wordbooks JOIN wordbook_items WHERE wordbooks.user_id = userId)` 의미로 유지한다.

- [ ] **Step 1: RED any-membership 테스트를 작성한다**

같은 vocabulary가 두 단어장에 있어도 공용 목록 row는 하나이고 `saved: true`, 다른 사용자 membership만 있으면 `false`인지 query 테스트를 바꾼다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts -t "저장 여부"
```

Expected: FAIL — 아직 `saved_vocabularies` join을 사용한다.

- [ ] **Step 3: 최소 GREEN query를 구현한다**

목록과 상세의 saved projection을 user-owned wordbook item `exists`로 교체하고 단일 saved 목록 method를 제거한다.

- [ ] **Step 4: 고아 API를 제거하고 관련 테스트를 맞춘다**

domain saved-content는 질문 저장만 남기고, old saved vocabulary Zod schema/type와 그 테스트를 제거한다. 기존 죽은 코드를 넓게 정리하지 않는다.

- [ ] **Step 5: GREEN을 확인한다**

```bash
pnpm exec vitest run backend/domain/src/learning/saved-content.spec.ts backend/database/src/repositories/drizzle-learning.repository.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts shared/contracts/src/learning/vocabularies.spec.ts
```

Expected: PASS.

- [ ] **Step 6: 작은 커밋을 만든다**

```bash
git add backend/domain/src/learning/saved-content.repository.ts backend/domain/src/learning/saved-content.ts backend/domain/src/learning/saved-content.spec.ts backend/database/src/repositories/drizzle-learning.repository.ts backend/database/src/repositories/drizzle-learning.repository.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts shared/contracts/src/learning/vocabularies.ts shared/contracts/src/learning/vocabularies.spec.ts
git commit -m "refactor(learning): replace saved vocabulary collection"
```

### Task 7: 단어장 HTTP service와 Controller

**Files:**
- Create: `backend/api/src/learning/learner-wordbooks.service.ts`
- Create: `backend/api/src/learning/learner-wordbooks.service.spec.ts`
- Create: `backend/api/src/learning/learner-wordbooks.controller.ts`
- Create: `backend/api/src/learning/learner-wordbooks.controller.spec.ts`

**Interfaces:**
- Consumes: `DrizzleWordbookQuery`, `WordbookService`, `MediaReadUrlProvider`, Task 1 계약
- Produces:

```ts
export interface LearnerWordbooksDependencies {
  query: Pick<DrizzleWordbookQuery, 'listWordbooks' | 'listItems' | 'listMemberships'>;
  wordbooks: WordbookService;
  mediaReadUrls: MediaReadUrlProvider;
  now?: () => Date;
}
export class LearnerWordbooksService {
  constructor(dependencies: LearnerWordbooksDependencies);
  listWordbooks(userId: string): Promise<WordbookListResponse>;
  create(userId: string, request: WordbookNameRequest): Promise<WordbookResponse>;
  rename(userId: string, wordbookId: string, request: WordbookNameRequest): Promise<WordbookResponse>;
  delete(userId: string, wordbookId: string): Promise<void>;
  listItems(userId: string, wordbookId: string, query: WordbookItemListQuery): Promise<WordbookItemListResponse>;
  addVocabulary(userId: string, wordbookId: string, vocabularyId: string): Promise<void>;
  removeVocabulary(userId: string, wordbookId: string, vocabularyId: string): Promise<void>;
  copyVocabularies(userId: string, sourceId: string, request: WordbookBulkItemsRequest): Promise<void>;
  moveVocabularies(userId: string, sourceId: string, request: WordbookBulkItemsRequest): Promise<void>;
  removeVocabularies(userId: string, sourceId: string, request: WordbookRemoveItemsRequest): Promise<void>;
  listMemberships(userId: string, vocabularyId: string): Promise<VocabularyWordbookMembershipResponse>;
}
```

- [ ] **Step 1: RED service 테스트를 작성한다**

Date를 ISO로 바꾸고 발음 storage key를 응답별 5분 URL로 한 번만 서명하며 strict schema 실패를 `LearnerPublicResponseError`로 바꾸는지, query null을 `WORDBOOK_NOT_FOUND` 404로 바꾸는지 검증한다.

- [ ] **Step 2: service RED를 확인한다**

```bash
pnpm exec vitest run backend/api/src/learning/learner-wordbooks.service.spec.ts
```

Expected: FAIL — service가 없다.

- [ ] **Step 3: 최소 GREEN service를 구현한다**

기존 `LearnerContentService` 내부 구현을 import하지 말고 응답 mapper를 이 파일 안에 작게 둔다. private storage key를 공개 계약에 전달하지 않는다.

- [ ] **Step 4: Controller RED 테스트를 작성한다**

다음 operation의 LEARNER guard, strict path/query/body parse, 현재 userId 전달, HTTP code를 검증한다.

```text
GET    /me/wordbooks
POST   /me/wordbooks                                  201
PATCH  /me/wordbooks/:wordbookId                      200
DELETE /me/wordbooks/:wordbookId                      204
GET    /me/wordbooks/:wordbookId/items
PUT    /me/wordbooks/:wordbookId/items/:vocabularyId  204
DELETE /me/wordbooks/:wordbookId/items/:vocabularyId  204
POST   /me/wordbooks/:wordbookId/items/copy           204
POST   /me/wordbooks/:wordbookId/items/move           204
POST   /me/wordbooks/:wordbookId/items/remove         204
GET    /me/vocabularies/:vocabularyId/wordbook-memberships
```

- [ ] **Step 5: Controller RED를 확인한다**

```bash
pnpm exec vitest run backend/api/src/learning/learner-wordbooks.controller.spec.ts
```

Expected: FAIL — Controller가 없다.

- [ ] **Step 6: 최소 GREEN Controller를 구현한다**

각 operation에 요청·응답·인증·400/401/403/404/409/500 Swagger metadata를 붙이고 Zod 계약만 단일 입력 원본으로 사용한다.

```ts
@Post('me/wordbooks/:wordbookId/items/move')
@HttpCode(204)
async moveVocabularies(
  @CurrentUser() user: AuthenticatedUser,
  @Param() rawPath: Record<string, unknown>,
  @Body() rawBody: unknown,
): Promise<void> {
  const path = wordbookIdPathSchema.parse(rawPath);
  const request = wordbookBulkItemsRequestSchema.parse(rawBody);
  await this.wordbooks.moveVocabularies(user.userId, path.wordbookId, request);
}
```

- [ ] **Step 7: API GREEN을 확인한다**

```bash
pnpm exec vitest run backend/api/src/learning/learner-wordbooks.service.spec.ts backend/api/src/learning/learner-wordbooks.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 8: 작은 커밋을 만든다**

```bash
git add backend/api/src/learning/learner-wordbooks.service.ts backend/api/src/learning/learner-wordbooks.service.spec.ts backend/api/src/learning/learner-wordbooks.controller.ts backend/api/src/learning/learner-wordbooks.controller.spec.ts
git commit -m "feat(api): expose learner wordbooks"
```

### Task 8: 단어장 목록 Page와 CRUD Feature

**Files:**
- Create: `frontend/web/src/pages/wordbook-list/api/wordbookListQueries.ts`
- Create: `frontend/web/src/pages/wordbook-list/ui/WordbookListPageContainer.tsx`
- Create: `frontend/web/src/pages/wordbook-list/ui/WordbookListPageView.tsx`
- Create: `frontend/web/src/pages/wordbook-list/ui/WordbookListPage.test.tsx`
- Create: `frontend/web/src/pages/wordbook-list/index.ts`
- Create: `frontend/web/src/features/manage-wordbook/api/wordbookMutations.ts`
- Create: `frontend/web/src/features/manage-wordbook/ui/WordbookForm.tsx`
- Create: `frontend/web/src/features/manage-wordbook/ui/WordbookActions.tsx`
- Create: `frontend/web/src/features/manage-wordbook/ui/WordbookActions.test.tsx`
- Create: `frontend/web/src/features/manage-wordbook/index.ts`

**Interfaces:**
- Produces:

```ts
export function wordbookListQueryOptions();
export async function createWordbook(name: string): Promise<WordbookResponse>;
export async function renameWordbook(wordbookId: string, name: string): Promise<WordbookResponse>;
export async function deleteWordbook(wordbookId: string): Promise<void>;
export function WordbookListPageContainer(): JSX.Element;
```

- [ ] **Step 1: RED UI 테스트를 작성한다**

빈 상태에서 “단어장 만들기”, 목록에서 이름·항목 수·상세 링크, 생성 trim, rename, 삭제 확인 Dialog, mutation 실패 시 기존 화면 유지와 인라인 오류를 사용자 관점으로 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/wordbook-list src/features/manage-wordbook
```

Expected: FAIL — page/feature가 없다.

- [ ] **Step 3: 최소 GREEN API와 UI를 구현한다**

TanStack Query key는 `['learner', 'wordbooks']`, mutation 성공 시 그 key를 invalidate한다. raw input/button 대신 기존 `Input`, `Button`, `Dialog`를 조합한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/wordbook-list src/features/manage-wordbook
```

Expected: PASS.

- [ ] **Step 5: 작은 커밋을 만든다**

```bash
git add frontend/web/src/pages/wordbook-list frontend/web/src/features/manage-wordbook
git commit -m "feat(web): add wordbook management page"
```

### Task 9: 단어장 상세 검색·선택·bulk 행동

**Files:**
- Create: `frontend/web/src/pages/wordbook-detail/api/wordbookDetailQueries.ts`
- Create: `frontend/web/src/pages/wordbook-detail/model/wordbookDetailSearch.ts`
- Create: `frontend/web/src/pages/wordbook-detail/ui/WordbookDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/wordbook-detail/ui/WordbookDetailPageView.tsx`
- Create: `frontend/web/src/pages/wordbook-detail/ui/WordbookDetailPage.test.tsx`
- Create: `frontend/web/src/pages/wordbook-detail/index.ts`
- Create: `frontend/web/src/features/manage-wordbook-items/api/wordbookItemMutations.ts`
- Create: `frontend/web/src/features/manage-wordbook-items/ui/WordbookItemActions.tsx`
- Create: `frontend/web/src/features/manage-wordbook-items/ui/WordbookItemActions.test.tsx`
- Create: `frontend/web/src/features/manage-wordbook-items/index.ts`

**Interfaces:**

```ts
export type WordbookDetailSearch = WordbookItemListQuery;
export function parseWordbookDetailSearch(search: Record<string, unknown>): WordbookDetailSearch;
export function wordbookDetailQueryOptions(wordbookId: string, search: WordbookDetailSearch);
export async function copyWordbookItems(sourceId: string, targetId: string, vocabularyIds: string[]): Promise<void>;
export async function moveWordbookItems(sourceId: string, targetId: string, vocabularyIds: string[]): Promise<void>;
export async function removeWordbookItems(sourceId: string, vocabularyIds: string[]): Promise<void>;
```

- [ ] **Step 1: RED search model 테스트를 작성한다**

URL query의 기본 page, trim 검색어, kind/품사/난이도, 알 수 없는 key와 잘못된 page 거부를 검증한다.

- [ ] **Step 2: RED 상세 컴포넌트 테스트를 작성한다**

검색 제출 시 page 1 reset, filter 변경, 이전/다음 page, 개별/현재 page 전체 선택, `aria-pressed` 선택 상태, 빈/로딩/오류 상태를 검증한다.

- [ ] **Step 3: RED bulk 테스트를 작성한다**

선택 없을 때 action disable, target 선택 후 copy/move, remove 확인, 성공 후 detail/list/membership invalidate와 selection 초기화, 실패 후 selection 유지와 오류 표시를 검증한다.

- [ ] **Step 4: RED를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/wordbook-detail src/features/manage-wordbook-items
```

Expected: FAIL — 상세 page와 행동이 없다.

- [ ] **Step 5: 최소 GREEN을 구현한다**

화면 전용 search/page/selection은 `pages/wordbook-detail`이 소유하고 mutation만 feature에 둔다. checkbox primitive를 새로 만들지 않고 기존 `Button`의 `aria-pressed`로 선택을 표현해 shared hot file과 package 변경을 피한다.

```tsx
<Button
  aria-pressed={selectedIds.has(item.id)}
  onClick={() => onSelectionChange(item.id)}
  type='button'
  variant='outline'
>
  {selectedIds.has(item.id) ? '선택 해제' : '선택'}
</Button>
```

- [ ] **Step 6: GREEN을 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/wordbook-detail src/features/manage-wordbook-items
```

Expected: PASS.

- [ ] **Step 7: 작은 커밋을 만든다**

```bash
git add frontend/web/src/pages/wordbook-detail frontend/web/src/features/manage-wordbook-items
git commit -m "feat(web): manage wordbook items"
```

### Task 10: 재사용 가능한 vocabulary membership picker

**Files:**
- Create: `frontend/web/src/features/save-vocabulary-to-wordbooks/api/vocabularyWordbookMutations.ts`
- Create: `frontend/web/src/features/save-vocabulary-to-wordbooks/ui/VocabularyWordbookPicker.tsx`
- Create: `frontend/web/src/features/save-vocabulary-to-wordbooks/ui/VocabularyWordbookPicker.test.tsx`
- Create: `frontend/web/src/features/save-vocabulary-to-wordbooks/index.ts`

**Interfaces:**

```ts
export function vocabularyWordbookMembershipQueryOptions(vocabularyId: string);
export async function addVocabularyToWordbook(wordbookId: string, vocabularyId: string): Promise<void>;
export async function removeVocabularyFromWordbook(wordbookId: string, vocabularyId: string): Promise<void>;
export function VocabularyWordbookPicker(props: {
  onConfirmed: (saved: boolean) => void;
  vocabularyId: string;
}): JSX.Element;
```

- [ ] **Step 1: RED picker 테스트를 작성한다**

단어장 목록과 membership을 읽어 여러 단어장 checked 상태를 표시하고, PUT/DELETE 성공 뒤에만 상태와 `onConfirmed(any membership)`을 변경하며 실패 시 상태 유지·오류 표시하는지 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/features/save-vocabulary-to-wordbooks
```

Expected: FAIL — picker가 없다.

- [ ] **Step 3: 최소 GREEN을 구현한다**

Dialog 안에서 기존 `Button` `aria-pressed` 목록을 사용하고 `['learner', 'wordbooks']`, vocabulary membership, vocabulary detail/list key를 성공 시 invalidate한다. vocabulary detail Page에는 아직 연결하지 않는다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/features/save-vocabulary-to-wordbooks
```

Expected: PASS.

- [ ] **Step 5: 작은 커밋을 만든다**

```bash
git add frontend/web/src/features/save-vocabulary-to-wordbooks
git commit -m "feat(web): add vocabulary wordbook picker"
```

### Task 11: 기능 브랜치 검증과 마지막 공개 export 커밋

**Files:**
- Modify: `backend/domain/src/index.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `shared/contracts/src/index.ts`

**Interfaces:**
- Produces: Task 1·2·4·5의 공개 export

- [ ] **Step 1: 공개 import RED를 확인한다**

```bash
pnpm typecheck
```

Expected: FAIL — `@flex-thia/contracts`, `@flex-thia/domain`, `@flex-thia/database` 공개 진입점에서 신규 항목을 찾지 못한다.

- [ ] **Step 2: 최소 export를 추가한다**

```ts
// shared/contracts/src/index.ts
export * from './learning/wordbooks.js';
// backend/domain/src/index.ts
export * from './learning/wordbook.repository.js';
export * from './learning/wordbook.js';
// backend/database/src/index.ts
export * from './repositories/drizzle-wordbook.repository.js';
export * from './queries/drizzle-wordbook.query.js';
```

- [ ] **Step 3: 기능 브랜치 focused gate를 실행한다**

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/web test
pnpm structure:check
CHOKIDAR_USEPOLLING=1 pnpm architecture:check
pnpm lint
pnpm typecheck
pnpm --filter @flex-thia/web build
```

Expected: 모두 PASS. route source가 아직 없으므로 routeTree 변경도 없다.

- [ ] **Step 4: 생성 금지 파일이 바뀌지 않았는지 확인한다**

```bash
git status --short
git diff -- backend/database/drizzle frontend/web/src/routeTree.gen.ts package.json pnpm-lock.yaml
```

Expected: 두 번째 명령 출력 없음.

- [ ] **Step 5: 마지막 조립 커밋을 만든다**

```bash
git add backend/domain/src/index.ts backend/database/src/index.ts shared/contracts/src/index.ts
git commit -m "chore(wordbooks): expose feature boundaries"
```

### Task 12: 통합 담당자 — API root 조립과 OpenAPI

**Files:**
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/learning/learning.module.ts`
- Modify: `backend/api/src/learning/learning.module.spec.ts`
- Modify: `backend/api/src/openapi/openapi.dto.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`

**Interfaces:**
- `LearningModuleOptions`에 `wordbookQuery: DrizzleWordbookQuery`, `wordbooks: WordbookService`를 추가한다.
- `LearnerWordbooksController`와 `LearnerWordbooksService`를 등록한다.

- [ ] **Step 1: RED 조립·오류 mapping 테스트를 작성한다**

LearningModule에 세 번째 Controller가 있고 service가 export되는지, domain의 `WORDBOOK_NOT_FOUND`/`VOCABULARY_UNAVAILABLE`는 404, persistence의 `WORDBOOK_NAME_CONFLICT`는 409, domain의 `WORDBOOK_SAME_TARGET`/`WORDBOOK_NAME_INVALID`는 400인지 검증한다.

- [ ] **Step 2: RED OpenAPI 기대값을 작성한다**

Task 7의 11개 operation과 DTO component, Bearer security, 성공·오류 status를 `learnerOperations` 기대값에 추가하고 old `/me/saved-vocabularies` 세 operation을 제거한다.

- [ ] **Step 3: RED를 확인한다**

```bash
pnpm exec vitest run backend/api/src/learning/learning.module.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts backend/api/src/openapi/openapi.spec.ts
```

Expected: FAIL — root 조립과 DTO가 없다.

- [ ] **Step 4: 최소 GREEN 조립을 구현한다**

`app.module.ts`에서 같은 database로 `DrizzleWordbookRepository`, `DrizzleWordbookQuery`, `WordbookService`를 한 번씩 만들고 `LearningModule.register`에 전달한다. DTO는 Task 1 Zod schema에서만 `createZodDto`로 만든다.

- [ ] **Step 5: GREEN을 확인한다**

```bash
pnpm exec vitest run backend/api/src/learning/learning.module.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts backend/api/src/openapi/openapi.spec.ts
pnpm --filter @flex-thia/api typecheck
```

Expected: PASS.

- [ ] **Step 6: 통합 커밋을 만든다**

```bash
git add backend/api/src/app.module.ts backend/api/src/learning/learning.module.ts backend/api/src/learning/learning.module.spec.ts backend/api/src/openapi/openapi.dto.ts backend/api/src/openapi/openapi.spec.ts backend/api/src/common/errors/domain-exception.filter.ts backend/api/src/common/errors/domain-exception.filter.spec.ts
git commit -m "chore(api): wire wordbook feature"
```

### Task 13: 통합 담당자 — additive migration과 seed

**Files:**
- Modify: `backend/database/seed/local.sql`
- Create/Modify: generated `backend/database/drizzle/**`

**Interfaces:**
- 기존 각 saved owner에게 이름 `저장한 어휘`의 legacy wordbook 하나
- 기존 `saved_at`을 새 `added_at`으로 보존

- [ ] **Step 1: schema 기준 migration을 생성한다**

```bash
pnpm --filter @flex-thia/database db:generate
```

Expected: `wordbooks`, `wordbook_items`, FK/unique/index를 추가하는 generated SQL과 snapshot이 생긴다.

- [ ] **Step 2: generated SQL에 backfill을 추가한다**

같은 migration transaction 안에서 다음 의미의 SQL을 generated create 문 뒤에 둔다.

```sql
insert into wordbooks (id, user_id, name, created_at, updated_at)
select gen_random_uuid(), user_id, '저장한 어휘', min(saved_at), max(saved_at)
from saved_vocabularies
group by user_id;

insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
select w.id, sv.vocabulary_id, sv.saved_at
from saved_vocabularies sv
join wordbooks w
  on w.user_id = sv.user_id
 and w.name = '저장한 어휘';
```

첫 migration에서 `saved_vocabularies`를 drop하지 않는다.

- [ ] **Step 3: 빈 DB migration을 검증한다**

```bash
pnpm --filter @flex-thia/database db:reset-seed:local
```

Expected: migration과 갱신한 seed가 성공하고 학습자에게 단어장과 항목이 보인다.

- [ ] **Step 4: 기존 DB copy migration을 검증한다**

migration 전 fixture에 서로 다른 사용자와 saved row를 넣은 뒤 적용하고 다음 SQL 결과가 모두 0인지 확인한다.

```sql
select count(*)
from saved_vocabularies sv
left join wordbooks w on w.user_id = sv.user_id and w.name = '저장한 어휘'
left join wordbook_items wi
  on wi.wordbook_id = w.id
 and wi.vocabulary_id = sv.vocabulary_id
 and wi.added_at = sv.saved_at
where wi.wordbook_id is null;
```

Expected: 0, 기존 row count와 새 legacy item count가 동일하다.

- [ ] **Step 5: destructive SQL을 확인한다**

```bash
rg -n "drop table|drop column|truncate|delete from saved_vocabularies" backend/database/drizzle
```

Expected: 이번 migration에 해당 구문이 없다.

- [ ] **Step 6: migration 통합 커밋을 만든다**

```bash
git add backend/database/seed/local.sql backend/database/drizzle
git commit -m "chore(database): migrate saved vocabulary data"
```

### Task 14: 통합 담당자 — routes, routeTree, navigation

**Files:**
- Create: `frontend/web/src/app/routes/_authenticated._learner.wordbooks.index.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.wordbooks.$wordbookId.tsx`
- Delete: `frontend/web/src/app/routes/_authenticated._learner.saved-vocabularies.tsx`
- Modify: `frontend/web/src/app/routing/learnerNavigation.ts`
- Modify: `frontend/web/src/app/routing/redirectSearch.ts`
- Modify: `frontend/web/src/app/routing/routeReachability.test.ts`
- Modify: `frontend/web/src/app/routes/__root.tsx`
- Modify: generated `frontend/web/src/routeTree.gen.ts`

- [ ] **Step 1: RED route source 테스트를 작성한다**

`/wordbooks`와 `/wordbooks/$wordbookId`를 learner reachability, safe redirect, route title에 추가하고 `/saved-vocabularies`를 제거한다.

- [ ] **Step 2: route source를 구현한다**

목록 route는 `WordbookListPageContainer`, 상세 route는 `wordbookId` path와 `parseWordbookDetailSearch`를 `WordbookDetailPageContainer`에 전달하며 navigate search는 replace로 수행한다.

- [ ] **Step 3: routeTree를 공식 plugin으로 재생성한다**

```bash
pnpm --filter @flex-thia/web build
```

Expected: generated routeTree에 두 wordbook route가 있고 saved route가 없다.

- [ ] **Step 4: route 테스트를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/app/routing
pnpm --filter @flex-thia/web typecheck
```

Expected: PASS.

- [ ] **Step 5: route 통합 커밋을 만든다**

```bash
git add frontend/web/src/app/routes frontend/web/src/app/routing frontend/web/src/routeTree.gen.ts
git commit -m "chore(web): wire wordbook routes"
```

### Task 15: 통합 담당자 — Thai 작업과 겹치는 vocabulary detail 연결

**Files:**
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`
- Delete: `frontend/web/src/features/toggle-saved-vocabulary/**`
- Delete: `frontend/web/src/pages/saved-vocabularies/**`

**Interfaces:**
- Consumes: `VocabularyWordbookPicker`
- 기존 detail `saved`는 어느 단어장에든 포함됐는지 표시하는 요약값으로만 사용한다.

- [ ] **Step 1: 최신 Thai interaction 변경 위에 rebase한다**

```bash
git rebase origin/main
```

Expected: 최신 vocabulary detail의 태국어 hover/focus/audio 동작이 보존된다.

- [ ] **Step 2: RED detail 테스트를 작성한다**

기존 태국어 상호작용 테스트를 유지하면서 “단어장에 추가”로 picker를 열고 여러 단어장의 membership을 변경해도 발음·뜻·음성 UI가 그대로 동작하는지 검증한다.

- [ ] **Step 3: RED를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-detail
```

Expected: FAIL — detail이 아직 `SavedVocabularyButton`을 사용한다.

- [ ] **Step 4: 최소 GREEN 연결을 구현한다**

`SavedVocabularyButton`만 `VocabularyWordbookPicker`로 교체하고 Thai interaction component 구조·props·스타일은 변경하지 않는다. old saved page/feature는 새 route가 연결된 뒤 삭제한다.

- [ ] **Step 5: GREEN과 고아 import 제거를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-detail src/features/save-vocabulary-to-wordbooks
rg -n "saved-vocabularies|SavedVocabularyButton|changeSavedVocabulary" frontend/web/src
```

Expected: 테스트 PASS, `rg` 출력 없음.

- [ ] **Step 6: 통합 커밋을 만든다**

```bash
git add frontend/web/src/pages/vocabulary-detail frontend/web/src/features/toggle-saved-vocabulary frontend/web/src/pages/saved-vocabularies
git commit -m "chore(web): connect vocabulary detail to wordbooks"
```

### Task 16: 통합 전체 검증

**Files:**
- Verify only

- [ ] **Step 1: migration과 생성 파일 상태를 확인한다**

```bash
git status --short
git diff --check
```

Expected: 예상한 파일만 변경됐고 whitespace 오류가 없다.

- [ ] **Step 2: 전체 품질 gate를 실행한다**

```bash
pnpm check
```

Expected: structure, format, architecture, lint, typecheck, unit/component tests, coverage, build가 모두 PASS.

- [ ] **Step 3: Steiger watcher 한도만 재현되면 검증 명령을 재실행한다**

```bash
CHOKIDAR_USEPOLLING=1 pnpm architecture:check
```

Expected: PASS. `EMFILE` 이외 실패에는 이 우회를 사용하지 않는다.

- [ ] **Step 4: migration 불변식을 다시 확인한다**

기존 DB copy에서 old count와 legacy item count가 같고, 한 사용자의 같은 vocabulary가 두 wordbook에 존재할 수 있으며, 같은 wordbook 중복은 PK로 거부되는지 SQL로 확인한다.

- [ ] **Step 5: 최종 검증 커밋은 만들지 않는다**

검증 중 코드 변경이 없으면 새 커밋을 만들지 않는다. 수정이 필요했다면 원인 소유 Task의 커밋을 보완하고 `pnpm check`를 처음부터 다시 실행한다.
