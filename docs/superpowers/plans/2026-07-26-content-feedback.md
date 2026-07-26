# Content Error Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학습자가 다섯 콘텐츠 종류의 오류를 동일하게 신고하고 관리자가 immutable 제출 문맥, 담당자, 상태와 append-only 처리 이력을 관리하게 한다.

**Architecture:** `feedback` domain이 `ContentErrorReport` 상태 전이와 target resolver port를 소유하고, Drizzle adapter가 canonicalization·snapshot 조회와 workflow transaction을 구현한다. 학습자 modal은 공개 origin만 제출하고 서버가 신뢰 가능한 canonical reference를 만들며, 관리 화면은 소유 콘텐츠 화면으로 deep-link하고 콘텐츠 상태를 직접 변경하지 않는다.

**Tech Stack:** TypeScript, NestJS 11, Zod 4, PostgreSQL 16, Drizzle ORM, React 19, TanStack Query/Router, Tailwind CSS, shadcn, Vitest 4, Testing Library

## Global Constraints

- 제품 기능과 공개 타입 이름은 `ContentErrorReport`, 모듈 폴더는 `feedback`을 사용한다.
- 상태는 `OPEN`, `IN_PROGRESS`, `RESOLVED`, `REJECTED`만 사용한다.
- `OPEN`은 `IN_PROGRESS`, `RESOLVED`, `REJECTED`로, `IN_PROGRESS`는 `OPEN`, `RESOLVED`, `REJECTED`로 전이한다.
- `RESOLVED`와 `REJECTED`는 재개할 때만 `OPEN`으로 전이한다.
- 담당자는 모든 상태에서 배정·교체·해제할 수 있다.
- 설명은 trim 후 빈 문자열을 `null`로 저장하며 최대 1,000자다.
- 중복 신고를 허용하고 unique deduplication key를 만들지 않는다.
- canonical reference와 snapshot은 생성 뒤 수정하지 않는다.
- 어휘 `contentVersionId`는 현재 version table이 없으므로 `null`이고 snapshot을 필수 저장한다.
- 신고 생성·workflow 변경은 콘텐츠 수정·숨김·재검증을 자동 실행하지 않는다.
- 새 코드와 변경 코드는 `conventions/comment-convention.md`를 따르고 테스트 설명은 한국어로 작성한다.
- E2E runner·설정·browser/API E2E spec을 추가하지 않는다.
- 새 패키지, 환경 변수, package manifest와 lockfile을 변경하지 않는다.
- 기능 브랜치는 전용 경로만 소유하며 package root barrel은 자기 기능 export만 마지막 단독 commit으로 추가한다. AppModule, 공용 OpenAPI, migration, route tree, navigation과 기존 화면 연결은 수정하지 않는다.
- cross-workspace adapter를 검증하기 전에 통합 담당자가 필요한 root export만 먼저 연결하며, 기능 구현자는 임시 상대 경로나 중복 타입으로 우회하지 않는다.

---

## File Structure

### 기능 브랜치 전용 파일

- `shared/contracts/src/feedback/content-error-reports.ts`
- `shared/contracts/src/feedback/content-error-reports.spec.ts`
- `backend/domain/src/feedback/content-error-report.ts`
- `backend/domain/src/feedback/content-error-report.spec.ts`
- `backend/domain/src/feedback/content-error-report.repository.ts`
- `backend/domain/src/feedback/content-error-report.query.ts`
- `backend/domain/src/feedback/content-error-report.service.ts`
- `backend/domain/src/feedback/content-error-report.service.spec.ts`
- `backend/database/src/schema/feedback.schema.ts`
- `backend/database/src/schema/feedback.schema.spec.ts`
- `backend/database/src/repositories/drizzle-content-error-report.repository.ts`
- `backend/database/src/repositories/drizzle-content-error-report.repository.spec.ts`
- `backend/database/src/queries/drizzle-content-error-report.query.ts`
- `backend/database/src/queries/drizzle-content-error-report.query.spec.ts`
- `backend/api/src/feedback/content-error-report.service.ts`
- `backend/api/src/feedback/content-error-report.service.spec.ts`
- `backend/api/src/feedback/learner-content-error-reports.controller.ts`
- `backend/api/src/feedback/learner-content-error-reports.controller.spec.ts`
- `backend/api/src/feedback/admin-content-error-reports.controller.ts`
- `backend/api/src/feedback/admin-content-error-reports.controller.spec.ts`
- `backend/api/src/feedback/content-error-reports.module.ts`
- `backend/api/src/feedback/content-error-reports.module.spec.ts`
- `backend/api/src/feedback/content-error-report.openapi.dto.ts`
- `frontend/web/src/features/report-content-error/**`
- `frontend/web/src/pages/content-error-report-management/**`

### 통합 담당자 전용 파일

- `shared/contracts/src/index.ts`의 최종 합본
- `backend/domain/src/index.ts`의 최종 합본
- `backend/database/src/index.ts`의 최종 합본
- `backend/database/src/schema/index.ts`
- `backend/api/src/app.module.ts`
- `backend/api/src/openapi/openapi.dto.ts`
- `backend/api/src/openapi/openapi.spec.ts`
- `backend/database/drizzle/**`
- `frontend/web/src/app/routes/_authenticated.admin._enrolled.content-error-reports*.tsx`
- learner/admin navigation 파일
- `frontend/web/src/routeTree.gen.ts`
- 기존 문제·어휘·문장·개념 Page와 `InteractiveThaiSentence`

## Task 1: 공개 계약

**Files:**
- Create: `shared/contracts/src/feedback/content-error-reports.ts`
- Create: `shared/contracts/src/feedback/content-error-reports.spec.ts`

**Interfaces:**
- Produces:

```ts
export const contentErrorReportTargetKindSchema = z.enum([
  'QUESTION', 'VOCABULARY', 'SENTENCE', 'AUDIO', 'CONCEPT',
]);
export const contentErrorReportCategorySchema = z.enum([
  'MEANING_TRANSLATION',
  'PRONUNCIATION_TONE',
  'AUDIO',
  'ANSWER_EXPLANATION',
  'TOKENIZATION',
  'OTHER',
]);
export const contentErrorReportStatusSchema = z.enum([
  'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED',
]);
export const contentErrorReportOriginSchema: z.ZodType<ContentErrorReportOrigin>;
export const createContentErrorReportRequestSchema: z.ZodType<{
  origin: ContentErrorReportOrigin;
  category: ContentErrorReportCategory;
  description?: string;
}>;
export const createContentErrorReportResponseSchema: z.ZodType<{
  id: string;
  status: 'OPEN';
  createdAt: string;
}>;
export const adminContentErrorReportListQuerySchema: z.ZodType<{
  status?: ContentErrorReportStatus;
  targetKind?: ContentErrorReportTargetKind;
  category?: ContentErrorReportCategory;
  assigneeUserId?: string;
  page: number;
  pageSize: number;
}>;
export const contentErrorReportIdPathSchema: z.ZodType<{ reportId: string }>;
export const changeContentErrorReportStatusRequestSchema: z.ZodType<{
  status: ContentErrorReportStatus;
}>;
export const assignContentErrorReportRequestSchema: z.ZodType<{
  assigneeUserId: string;
}>;
export const adminContentErrorReportListResponseSchema: z.ZodType<AdminContentErrorReportListResponse>;
export const adminContentErrorReportDetailResponseSchema: z.ZodType<AdminContentErrorReportDetailResponse>;
```

- [ ] **Step 1: RED 계약 테스트를 작성한다**

`content-error-reports.spec.ts`에 다섯 origin discriminated union, 여섯 분류,
네 상태, 설명 1,000자 허용·1,001자 거부, description 생략, strict unknown
key 거부, 기본 page, UUID path와 history 응답을 한국어 테스트로 작성한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
pnpm exec vitest run --root . shared/contracts/src/feedback/content-error-reports.spec.ts
```

Expected: FAIL — 계약 모듈 또는 export가 없다.

- [ ] **Step 3: 최소 GREEN 계약을 구현한다**

origin은 설계 문서 4.1의 union을 그대로 구현한다. 설명 schema는
`z.string().trim().max(1000).optional()`이고 목록 응답은 기존
`pageMetadataSchema`와 동일한 page shape를 자체 정의해 root barrel 연결
전에도 전용 파일 테스트가 독립 실행되게 한다. detail에는 canonical
reference, snapshot, reporter, assignee nullable, history를 포함한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . shared/contracts/src/feedback/content-error-reports.spec.ts
pnpm --filter @flex-thia/contracts typecheck
```

Expected: 전용 테스트와 새 파일 typecheck가 모두 PASS.

## Task 2: 상태 모델과 port

**Files:**
- Create: `backend/domain/src/feedback/content-error-report.ts`
- Create: `backend/domain/src/feedback/content-error-report.spec.ts`
- Create: `backend/domain/src/feedback/content-error-report.repository.ts`
- Create: `backend/domain/src/feedback/content-error-report.query.ts`

**Interfaces:**
- Produces:

```ts
export type ContentErrorReportStatus =
  | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
export type ContentErrorReportTargetKind =
  | 'QUESTION' | 'VOCABULARY' | 'SENTENCE' | 'AUDIO' | 'CONCEPT';
export type ContentErrorReportCategory =
  | 'MEANING_TRANSLATION'
  | 'PRONUNCIATION_TONE'
  | 'AUDIO'
  | 'ANSWER_EXPLANATION'
  | 'TOKENIZATION'
  | 'OTHER';
export type ContentErrorReportHistoryAction =
  | 'SUBMITTED' | 'STATUS_CHANGED' | 'ASSIGNEE_CHANGED';
export type ContentErrorReportOrigin =
  | { kind: 'QUESTION'; questionId: string; questionVersionId: string; blockId: string | null; sentenceVersionId: string | null }
  | { kind: 'VOCABULARY'; vocabularyId: string; meaningId: string | null; pronunciationId: string | null }
  | { kind: 'SENTENCE'; sentenceVersionId: string; tokenPosition: number | null }
  | { kind: 'AUDIO'; source: { kind: 'VOCABULARY'; pronunciationId: string } | { kind: 'SENTENCE'; sentenceVersionId: string } }
  | { kind: 'CONCEPT'; conceptId: string; conceptVersionId: string; blockId: string | null };
export interface ContentErrorReportCanonicalReference {
  kind: ContentErrorReportTargetKind;
  contentId: string;
  contentVersionId: string | null;
  questionVersionId: string | null;
  sentenceVersionId: string | null;
  mediaAssetId: string | null;
  locationId: string | null;
}
export interface ContentErrorReportSnapshot {
  title: string;
  primaryText: string;
  secondaryText: string | null;
  versionLabel: string | null;
  locationLabel: string;
  audioAssetId: string | null;
}
export interface ResolvedContentErrorReportTarget {
  reference: ContentErrorReportCanonicalReference;
  snapshot: ContentErrorReportSnapshot;
}
export interface ContentErrorReport {
  id: string;
  reporterUserId: string;
  targetKind: ContentErrorReportTargetKind;
  category: ContentErrorReportCategory;
  status: ContentErrorReportStatus;
  assigneeUserId: string | null;
  description: string | null;
  canonicalReference: ContentErrorReportCanonicalReference;
  snapshot: ContentErrorReportSnapshot;
  createdAt: Date;
  updatedAt: Date;
}
export interface ContentErrorReportActor {
  userId: string;
  subject: string;
  requestId: string;
}
export interface CreateContentErrorReportInput {
  origin: ContentErrorReportOrigin;
  category: ContentErrorReportCategory;
  description?: string;
}
export interface CreateContentErrorReportRecord {
  reporterUserId: string;
  category: ContentErrorReportCategory;
  description: string | null;
  target: ResolvedContentErrorReportTarget;
  createdAt: Date;
}
export interface ChangeContentErrorReportStatusRecord {
  reportId: string;
  fromStatus: ContentErrorReportStatus;
  toStatus: ContentErrorReportStatus;
  expectedUpdatedAt: Date;
  actor: ContentErrorReportActor;
  changedAt: Date;
}
export interface ChangeContentErrorReportAssigneeRecord {
  reportId: string;
  fromAssigneeUserId: string | null;
  toAssigneeUserId: string | null;
  expectedUpdatedAt: Date;
  actor: ContentErrorReportActor;
  changedAt: Date;
}
export function normalizeContentErrorReportDescription(
  value: string | undefined,
): string | null;
export function assertContentErrorReportTransition(
  from: ContentErrorReportStatus,
  to: ContentErrorReportStatus,
): void;
export class ContentErrorReportDomainError extends Error {
  readonly code:
    | 'CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE'
    | 'CONTENT_ERROR_REPORT_NOT_FOUND'
    | 'CONTENT_ERROR_REPORT_INVALID_TRANSITION'
    | 'CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE'
    | 'CONTENT_ERROR_REPORT_CONCURRENT_UPDATE';
}
export interface ContentErrorReportTargetResolver {
  resolve(origin: ContentErrorReportOrigin): Promise<ResolvedContentErrorReportTarget | null>;
}
export interface ContentErrorReportAssigneeResolver {
  isAssignable(userId: string): Promise<boolean>;
}
export interface ContentErrorReportRepository {
  create(input: CreateContentErrorReportRecord): Promise<ContentErrorReport>;
  changeStatus(input: ChangeContentErrorReportStatusRecord): Promise<ContentErrorReport | null>;
  changeAssignee(input: ChangeContentErrorReportAssigneeRecord): Promise<ContentErrorReport | null>;
}
export interface ContentErrorReportQuery {
  list(query: AdminContentErrorReportListQuery): Promise<ContentErrorReportPage>;
  findById(reportId: string): Promise<ContentErrorReportDetail | null>;
}
```

`AdminContentErrorReportListQuery`, `ContentErrorReportPage`와
`ContentErrorReportDetail`은 Task 1 공개 응답과 같은 필드를 `Date` 기반
내부 read model로 정의한다. domain은 `@flex-thia/contracts`를 import하지
않는다.

- [ ] **Step 1: RED 상태 테스트를 작성한다**

허용 전이 8개, 금지 전이와 같은 상태, terminal에서 `OPEN` 재개, 설명 trim,
빈 설명 null, 1,000자 경계와 1,001자 오류를 table-driven 한국어 테스트로
작성한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/domain/src/feedback/content-error-report.spec.ts
```

Expected: FAIL — 모델 함수와 error가 없다.

- [ ] **Step 3: 최소 GREEN 모델과 port를 구현한다**

상태 전이를 명시적인 `Readonly<Record<Status, readonly Status[]>>`로 두고
port 입력에는 `expectedUpdatedAt`, actor user/sub/request ID와 변경 시각을
포함해 optimistic concurrency와 audit transaction을 가능하게 한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . backend/domain/src/feedback/content-error-report.spec.ts
```

Expected: PASS.

## Task 3: 신고와 관리자 workflow use case

**Files:**
- Create: `backend/domain/src/feedback/content-error-report.service.ts`
- Create: `backend/domain/src/feedback/content-error-report.service.spec.ts`

**Interfaces:**
- Consumes: Task 2의 resolver와 repository
- Produces:

```ts
export class ContentErrorReportService {
  constructor(
    repository: ContentErrorReportRepository,
    targetResolver: ContentErrorReportTargetResolver,
    assigneeResolver: ContentErrorReportAssigneeResolver,
    now?: () => Date,
  );
  create(reporterUserId: string, input: CreateContentErrorReportInput): Promise<ContentErrorReport>;
  changeStatus(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
    status: ContentErrorReportStatus,
  ): Promise<ContentErrorReport>;
  assign(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
    assigneeUserId: string,
  ): Promise<ContentErrorReport>;
  unassign(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
  ): Promise<ContentErrorReport>;
}
```

- [ ] **Step 1: RED service 테스트를 작성한다**

서버 resolver 결과만 저장, 초기 `OPEN`, reporter spoof 불가, 중복 요청 두
건 모두 create, target unavailable, 허용·금지 상태 전이, ACTIVE ADMIN
담당자만 배정, 배정·교체·해제를 검증한다. repository 입력에 기존
`updatedAt`이 전달되고 콘텐츠 변경 port가 아예 없음을 고정한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/domain/src/feedback/content-error-report.service.spec.ts
```

Expected: FAIL — service가 없다.

- [ ] **Step 3: 최소 GREEN service를 구현한다**

client origin은 resolver에만 전달하고 canonical reference/snapshot은 resolver
결과만 사용한다. 같은 assignee 재배정과 이미 미배정인 report 해제는
`CONTENT_ERROR_REPORT_INVALID_TRANSITION`으로 거부한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . backend/domain/src/feedback/content-error-report.service.spec.ts
```

Expected: PASS.

## Task 4: schema

**Files:**
- Create: `backend/database/src/schema/feedback.schema.ts`
- Create: `backend/database/src/schema/feedback.schema.spec.ts`

**Interfaces:**
- Produces: `contentErrorReportTargetKindEnum`,
  `contentErrorReportCategoryEnum`, `contentErrorReportStatusEnum`,
  `contentErrorReportHistoryActionEnum`, `contentErrorReports`,
  `contentErrorReportHistory`

- [ ] **Step 1: RED schema metadata 테스트를 작성한다**

정확한 enum, `varchar(1000)`, reporter/assignee/history actor FK의 RESTRICT,
history report FK의 CASCADE, 기본 `OPEN`, jsonb reference/snapshot, 목록
index와 dedup unique 부재를 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/database/src/schema/feedback.schema.spec.ts
```

Expected: FAIL — schema export가 없다.

- [ ] **Step 3: 최소 GREEN schema를 구현한다**

설계 5장의 두 테이블만 추가한다. concept schema나 다른 Wave 파일을
import하지 않고 canonical reference와 snapshot은 Task 2 domain type의
`jsonb().$type<...>()`로 선언한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . backend/database/src/schema/feedback.schema.spec.ts
```

Expected: PASS.

## Task 5: write repository와 target resolver

**Files:**
- Create: `backend/database/src/repositories/drizzle-content-error-report.repository.ts`
- Create: `backend/database/src/repositories/drizzle-content-error-report.repository.spec.ts`

**Interfaces:**
- Consumes: Task 2 ports, Task 4 schema, 기존 content tables와 `auditLogs`
- Produces:

```ts
export interface ConceptErrorReportTargetLookup {
  resolve(
    origin: Extract<ContentErrorReportOrigin, { kind: 'CONCEPT' }>,
  ): Promise<ResolvedContentErrorReportTarget | null>;
}
export class DrizzleContentErrorReportRepository
  implements ContentErrorReportRepository,
    ContentErrorReportTargetResolver,
    ContentErrorReportAssigneeResolver {
  constructor(
    database: DatabaseClient,
    conceptLookup?: ConceptErrorReportTargetLookup,
  );
}
```

**Integration prerequisite:** 이 Task의 `@flex-thia/domain` import를
실행하기 전에 통합 담당자가 Task 2 공개 항목을
`backend/domain/src/index.ts`에 연결한다. 기능 구현자는 root barrel을
수정하거나 상대 경로로 workspace 경계를 우회하지 않는다.

- [ ] **Step 1: RED adapter 테스트를 작성한다**

문제·어휘·문장·음성 origin 관계 검증, signed URL 미저장, 어휘 version null,
snapshot 문구 보존, 생성+SUBMITTED history transaction, 중복 두 건 생성,
`FOR UPDATE` 상태/담당자 변경, history+audit 원자 저장, stale
`expectedUpdatedAt` 충돌과 rollback을 검증한다.

concept resolver는 미병합 concept 파일을 추측하지 않고
`CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE` 결과를 반환하는 것이 아니라,
constructor로 주입하는 `ConceptErrorReportTargetLookup | undefined`가 있을
때만 resolve하도록 port를 둔다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/database/src/repositories/drizzle-content-error-report.repository.spec.ts
```

Expected: FAIL — adapter가 없다.

- [ ] **Step 3: 최소 GREEN adapter를 구현한다**

학습자 공개 대상과 origin 관계를 DB join으로 확인하고 snapshot을 한 번
만든다. 상태와 담당자 변경은 report row를 잠근 transaction 안에서
expected timestamp, update, history insert와 audit insert를 수행한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . backend/database/src/repositories/drizzle-content-error-report.repository.spec.ts
```

Expected: PASS.

## Task 6: 관리자 read query

**Files:**
- Create: `backend/database/src/queries/drizzle-content-error-report.query.ts`
- Create: `backend/database/src/queries/drizzle-content-error-report.query.spec.ts`

**Interfaces:**
- Produces: `DrizzleContentErrorReportQuery implements ContentErrorReportQuery`

- [ ] **Step 1: RED query 테스트를 작성한다**

상태·target kind·category·assignee 필터 조합, 무담당 필터 없이 전체 조회,
`createdAt DESC, id ASC`, stable page metadata, detail history 시간순,
삭제·숨김된 현재 콘텐츠와 무관한 snapshot 반환을 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/database/src/queries/drizzle-content-error-report.query.spec.ts
```

Expected: FAIL — query가 없다.

- [ ] **Step 3: 최소 GREEN query를 구현한다**

목록은 report와 reporter/assignee 표시 정보만 join하고 snapshot을 사용해
N+1을 피한다. 상세에서 history actor를 join하고 canonical reference를
그대로 반환한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . backend/database/src/queries/drizzle-content-error-report.query.spec.ts
```

Expected: PASS.

## Task 7: API facade, Controller와 module

**Files:**
- Create: `backend/api/src/feedback/content-error-report.service.ts`
- Create: `backend/api/src/feedback/content-error-report.service.spec.ts`
- Create: `backend/api/src/feedback/learner-content-error-reports.controller.ts`
- Create: `backend/api/src/feedback/learner-content-error-reports.controller.spec.ts`
- Create: `backend/api/src/feedback/admin-content-error-reports.controller.ts`
- Create: `backend/api/src/feedback/admin-content-error-reports.controller.spec.ts`
- Create: `backend/api/src/feedback/content-error-reports.module.ts`
- Create: `backend/api/src/feedback/content-error-reports.module.spec.ts`
- Create: `backend/api/src/feedback/content-error-report.openapi.dto.ts`

**Interfaces:**
- Produces: `ContentErrorReportHttpService`,
  `LearnerContentErrorReportsController`, `AdminContentErrorReportsController`,
  `ContentErrorReportsModule.register(options)`

**Integration prerequisite:** 이 Task의 테스트 전에 통합 담당자가 계약,
domain과 database 공개 항목을 각 root barrel에 연결한다.

- [ ] **Step 1: RED HTTP 테스트를 작성한다**

learner `POST /content-error-reports`가 CurrentUser ID를 전달하고 201 strict
응답을 반환하는지 검증한다. admin 다섯 operation이 Cognito,
ApplicationRole, AdminMfa guard와 ADMIN role을 요구하고 request ID actor
context, Zod parse, 404/409 domain mapping과 Swagger metadata를 갖는지
검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/api/src/feedback
```

Expected: FAIL — Controller와 module이 없다.

- [ ] **Step 3: 최소 GREEN HTTP 계층을 구현한다**

DTO는 전용 `content-error-report.openapi.dto.ts`에서 계약 schema를
`createZodDto` 기존 패턴으로 감싸 공용 `openapi.dto.ts`를 수정하지 않는다.
facade가 query detail을 먼저 읽어 domain service에 현재 report를 전달한다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm exec vitest run --root . backend/api/src/feedback
```

Expected: PASS.

## Task 8: 학습자 공통 신고 Feature

**Files:**
- Create: `frontend/web/src/features/report-content-error/api/contentErrorReportMutation.ts`
- Create: `frontend/web/src/features/report-content-error/ui/ContentErrorReportDialog.tsx`
- Create: `frontend/web/src/features/report-content-error/ui/ContentErrorReportDialog.test.tsx`
- Create: `frontend/web/src/features/report-content-error/index.ts`

**Interfaces:**
- Produces:

```ts
export interface ContentErrorReportPreview {
  title: string;
  metadata: string;
}
export interface ContentErrorReportDialogProps {
  origin: ContentErrorReportOrigin;
  preview: ContentErrorReportPreview;
  triggerLabel?: string;
}
export function ContentErrorReportDialog(
  props: ContentErrorReportDialogProps,
): React.JSX.Element;
```

- [ ] **Step 1: RED component 테스트를 작성한다**

trigger로 dialog 열기, 자동 첨부 preview 읽기, 여섯 분류 중 하나 필수,
설명 1,000자 입력, submit 중 disable, strict request body, 성공 안내와
focus 복귀, API 오류 유지·재시도를 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/features/report-content-error
```

Expected: FAIL — Feature가 없다.

- [ ] **Step 3: 최소 GREEN Feature를 구현한다**

기존 `Dialog`, form primitive와 `authenticatedRequest`를 조합한다. preview는
표시용이고 request에는 origin/category/description만 넣는다. history 링크는
추가하지 않는다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/features/report-content-error
pnpm --filter @flex-thia/web architecture:check
```

Expected: PASS.

## Task 9: 관리자 목록·상세 Page

**Files:**
- Create: `frontend/web/src/pages/content-error-report-management/api/contentErrorReportQueries.ts`
- Create: `frontend/web/src/pages/content-error-report-management/api/contentErrorReportMutations.ts`
- Create: `frontend/web/src/pages/content-error-report-management/model/contentErrorReportSearch.ts`
- Create: `frontend/web/src/pages/content-error-report-management/model/contentErrorReportTargetLink.ts`
- Create: `frontend/web/src/pages/content-error-report-management/ui/ContentErrorReportManagementPageContainer.tsx`
- Create: `frontend/web/src/pages/content-error-report-management/ui/ContentErrorReportManagementPageView.tsx`
- Create: `frontend/web/src/pages/content-error-report-management/ui/ContentErrorReportManagementPage.test.tsx`
- Create: `frontend/web/src/pages/content-error-report-management/index.ts`

**Interfaces:**
- Produces: `ContentErrorReportManagementPageContainer`,
  `toContentErrorReportTargetLink(reference): string | null`

- [ ] **Step 1: RED Page 테스트를 작성한다**

필터 query 직렬화, loading/empty/error, snapshot과 설명, 상태 전이 선택지,
담당자 배정·교체·해제, history, 문제·어휘 deep-link, 알 수 없는 미통합
concept link의 비활성 안내를 검증한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/content-error-report-management
```

Expected: FAIL — Page가 없다.

- [ ] **Step 3: 최소 GREEN Page를 구현한다**

현재 상태에 허용된 다음 상태만 표시하고 terminal에서는 `OPEN` 재개만
제공한다. mutation 성공 시 목록/detail query를 invalidate한다. deep-link는
콘텐츠를 변경하지 않는 일반 anchor다.

- [ ] **Step 4: GREEN을 확인한다**

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/content-error-report-management
pnpm --filter @flex-thia/web architecture:check
```

Expected: PASS.

## Task 10: 통합 담당자 조립

**Files:**
- Modify: `shared/contracts/src/index.ts`
- Modify: `backend/domain/src/index.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `backend/database/src/schema/index.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Generate: `backend/database/drizzle/<next-feedback-migration>.sql`
- Generate: `backend/database/drizzle/meta/<next-snapshot>.json`
- Modify: `backend/database/drizzle/meta/_journal.json`
- Create: TanStack learner/admin route files
- Modify: learner/admin navigation
- Generate: `frontend/web/src/routeTree.gen.ts`
- Modify: 기존 문제·어휘·문장·개념 화면과 해당 component tests

**Interfaces:**
- Consumes: Tasks 1–9의 공개 exports와 `ContentErrorReportsModule.register`
- Produces: 실제 application 경로, migration, 다섯 learner 진입점과 admin
  navigation

기능 브랜치는 Task 9 뒤 contracts/domain/database package root에 feedback
export만 추가한 마지막 단독 commit을 만들 수 있다. 통합 담당자는 이
append-only export를 먼저 합친다.

- [ ] **Step 1: RED 조립 테스트를 추가한다**

OpenAPI `ACTIVE_PATHS`에 6개 operation과 bearer security를 추가하고,
module spec, route reachability, 기존 네 콘텐츠 화면과 audio trigger,
concept-learning의 concept 화면 trigger 실패 테스트를 작성한다.

- [ ] **Step 2: RED를 확인한다**

```bash
pnpm exec vitest run --root . backend/api/src/openapi/openapi.spec.ts
pnpm --filter @flex-thia/web test
```

Expected: FAIL — root 조립·route·trigger가 없다.

- [ ] **Step 3: root export와 application 조립을 연결한다**

feedback exports를 각 root barrel에 한 번만 추가하고 AppModule에서 같은
database client로 repository/query/service를 조립한다. 기존 페이지에는
origin과 preview를 만드는 얇은 `ContentErrorReportDialog` 호출만 추가한다.
concept resolver와 route는 concept-learning이 공개한 실제 식별자·경로를
사용한다.

- [ ] **Step 4: migration과 route tree를 순차 생성한다**

```bash
pnpm --filter @flex-thia/database db:generate
pnpm --filter @flex-thia/web build
```

생성 migration에 feedback 두 테이블과 enum/index만 포함되는지 확인하고,
빈 DB 적용과 최신 DB upgrade를 각각 검증한다. 다른 Wave schema가 섞이면
생성하지 말고 병합 순서를 바로잡는다.

- [ ] **Step 5: 통합 GREEN을 확인한다**

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/api run swagger
pnpm --filter @flex-thia/web test
pnpm --filter @flex-thia/web architecture:check
```

Expected: PASS.

## Task 11: 전체 품질 게이트

**Files:**
- Verify only

**Interfaces:**
- Consumes: 통합 완료 source tree
- Produces: 병합 가능한 검증 증거

- [ ] **Step 1: 변경 범위와 금지 사항을 확인한다**

```bash
git diff --check
git status --short
rg -n \"playwright|describe\\.e2e|test\\.e2e\" shared/contracts/src/feedback backend/domain/src/feedback backend/database/src backend/api/src/feedback frontend/web/src/features/report-content-error frontend/web/src/pages/content-error-report-management
```

Expected: whitespace 오류와 새 E2E 파일이 없고, 기능 브랜치 단계에서는
통합 전용 파일 변경이 없다.

- [ ] **Step 2: 전체 품질 게이트를 실행한다**

```bash
pnpm structure:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @flex-thia/web architecture:check
pnpm --filter @flex-thia/web coverage
pnpm --filter @flex-thia/web build
```

Expected: 모두 exit code 0.

- [ ] **Step 3: 요구사항 회귀를 수동으로 대조한다**

테스트 이름과 diff에서 다섯 target, 여섯 category, 상태 전이 표, terminal
재개, 담당자 배정·해제, 1,000자 설명, 중복 허용, immutable snapshot,
어휘 nullable version, 자동 콘텐츠 변경 부재, learner history 화면 부재를
각각 확인한다. 브라우저/API E2E spec은 만들지 않는다.
