# 콘텐츠 오류 신고 설계

- 작성일: 2026-07-26
- 상태: 구현 기준 확정
- 상위 설계:
  - `docs/superpowers/specs/2026-07-16-thai-flex-learning-service-design.md`
  - `docs/superpowers/specs/2026-07-26-full-product-parallel-delivery-design.md`

## 1. 목적

학습자가 문제·어휘·문장·음성·개념에서 발견한 오류를 같은 흐름으로
신고하고, 관리자가 원래 보던 콘텐츠와 버전을 재현해 담당자·상태·처리
이력을 관리한다.

제품 기능과 코드 이름은 일반적인 답안 `feedback`과 구분하기 위해
`ContentErrorReport`를 사용한다. 모듈 소유권 이름은 상위 아키텍처에 따라
`feedback`을 유지한다.

## 2. 범위

### 2.1 학습자

- 문제 상단, 어휘 상세, 문장 패널, 개념 상세에서 같은 신고 창을 연다.
- 음성 오류는 음성을 제공한 어휘 발음 또는 문장 문맥에서 신고한다.
- 현재 콘텐츠 종류·식별자·버전·위치·표시 내용을 자동 첨부한다.
- 다음 분류 중 하나와 1,000자 이하의 선택 설명을 제출한다.
  - 뜻·해석
  - 발음·성조
  - 음성
  - 정답·해설
  - 단어 분할
  - 기타
- 제출 성공 안내를 표시한다.

같은 사용자나 여러 사용자가 같은 대상을 같은 분류로 반복 신고할 수 있다.
중복은 서로 다른 관찰 기록이므로 차단하거나 자동 병합하지 않는다.

### 2.2 관리자

- 상태·분류·대상 종류·담당자로 신고를 필터링하고 페이지 단위로 조회한다.
- 신고 상세에서 제출 당시 snapshot, canonical reference, 설명, 신고자,
  담당자와 처리 이력을 확인한다.
- 담당자를 배정하거나 해제한다.
- 처리 상태를 허용된 전이로 변경한다.
- 대상 콘텐츠의 기존 관리자 수정·숨김·재검증 화면으로 이동한다.

대상 콘텐츠의 수정·숨김·재검증은 해당 소유 도메인의 기존 화면과 API가
수행한다. `feedback`은 deep-link만 제공하며 신고 생성이나 상태 변경으로
콘텐츠를 자동 변경하지 않는다.

### 2.3 제외 범위

- 학습자 신고 내역 화면
- 중복 판정·병합·자동 우선순위
- 신고 개수에 따른 자동 숨김
- 신고에서 직접 콘텐츠를 수정하는 편집기
- 이메일·푸시 알림
- 브라우저 또는 API E2E 테스트

## 3. 공개 용어와 상태

### 3.1 대상 종류

```ts
export type ContentErrorReportTargetKind =
  | 'QUESTION'
  | 'VOCABULARY'
  | 'SENTENCE'
  | 'AUDIO'
  | 'CONCEPT';
```

### 3.2 분류

```ts
export type ContentErrorReportCategory =
  | 'MEANING_TRANSLATION'
  | 'PRONUNCIATION_TONE'
  | 'AUDIO'
  | 'ANSWER_EXPLANATION'
  | 'TOKENIZATION'
  | 'OTHER';
```

### 3.3 상태와 전이

```ts
export type ContentErrorReportStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED';
```

새 신고의 상태는 항상 `OPEN`이다.

| 현재 | 허용되는 다음 상태 |
| --- | --- |
| `OPEN` | `IN_PROGRESS`, `RESOLVED`, `REJECTED` |
| `IN_PROGRESS` | `OPEN`, `RESOLVED`, `REJECTED` |
| `RESOLVED` | `OPEN` |
| `REJECTED` | `OPEN` |

같은 상태로의 변경은 잘못된 요청으로 거부한다. `RESOLVED`와 `REJECTED`는
terminal 상태이며 재개는 반드시 `OPEN`으로 전이한다. 담당자 배정 여부는
상태와 독립적이므로 모든 상태에서 배정·교체·해제가 가능하다.

## 4. 대상 입력, canonical reference와 snapshot

### 4.1 클라이언트 입력

클라이언트는 현재 공개 응답에 이미 포함된 origin 식별자만 전송한다.
signed audio URL, 사용자 ID, 상태, 담당자, canonical reference와 snapshot은
전송하지 않는다.

```ts
export type ContentErrorReportOrigin =
  | {
      kind: 'QUESTION';
      questionId: string;
      questionVersionId: string;
      blockId: string | null;
      sentenceVersionId: string | null;
    }
  | {
      kind: 'VOCABULARY';
      vocabularyId: string;
      meaningId: string | null;
      pronunciationId: string | null;
    }
  | {
      kind: 'SENTENCE';
      sentenceVersionId: string;
      tokenPosition: number | null;
    }
  | {
      kind: 'AUDIO';
      source:
        | { kind: 'VOCABULARY'; pronunciationId: string }
        | { kind: 'SENTENCE'; sentenceVersionId: string };
    }
  | {
      kind: 'CONCEPT';
      conceptId: string;
      conceptVersionId: string;
      blockId: string | null;
    };
```

### 4.2 서버 canonicalization

`ContentErrorReportTargetResolver`는 origin의 관계와 학습자 노출 가능성을
검증하고 서버가 신뢰할 canonical reference와 immutable snapshot을 만든다.
존재하지 않거나 관계가 맞지 않거나 학습자가 볼 수 없는 origin은
`CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE`로 거부한다.

```ts
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
```

- 문제는 논리 문제 ID와 불변 문제 버전 ID를 모두 기록한다.
- 문장은 서버가 문장 버전에서 논리 문장 ID와 버전 정보를 해석한다.
- 음성은 signed URL 대신 실제 `mediaAssetId`와 원래 발음·문장 문맥을
  기록한다.
- 개념은 개념 ID와 개념 버전 ID를 기록한다.
- 현재 어휘에는 별도 버전 테이블이 없으므로 `contentVersionId`는
  `null`이고 제출 당시 표기·뜻·발음 snapshot을 보존한다.

canonical reference와 snapshot은 신고 생성 뒤 수정하지 않는다. 콘텐츠가
나중에 숨겨지거나 새 버전으로 바뀌어도 관리자는 제출 당시 문맥을 확인할
수 있다.

## 5. 데이터 모델

### 5.1 `content_error_reports`

| 열 | 규칙 |
| --- | --- |
| `id` | UUID PK |
| `reporter_user_id` | `users.id`, RESTRICT |
| `target_kind` | 대상 종류 enum |
| `category` | 신고 분류 enum |
| `status` | 기본 `OPEN` |
| `assignee_user_id` | nullable `users.id`, RESTRICT |
| `description` | nullable `varchar(1000)` |
| `canonical_reference` | strict domain shape의 immutable `jsonb` |
| `snapshot` | strict domain shape의 immutable `jsonb` |
| `created_at` | 접수 시각 |
| `updated_at` | 마지막 workflow 변경 시각 |

목록용 index는 `(status, created_at DESC, id ASC)`,
`(assignee_user_id, status, created_at DESC)`,
`(target_kind, created_at DESC)`를 둔다. 중복을 막는 unique index는 두지
않는다.

### 5.2 `content_error_report_history`

| 열 | 규칙 |
| --- | --- |
| `id` | UUID PK |
| `report_id` | 신고 FK, CASCADE |
| `actor_user_id` | `users.id`, RESTRICT |
| `action` | `SUBMITTED`, `STATUS_CHANGED`, `ASSIGNEE_CHANGED` |
| `from_status`, `to_status` | 상태 변경이 아니면 nullable |
| `from_assignee_user_id`, `to_assignee_user_id` | 담당자 변경이 아니면 nullable |
| `created_at` | 변경 시각 |

신고 생성과 `SUBMITTED` history, 상태 변경과 history·`audit_logs`, 담당자
변경과 history·`audit_logs`는 각각 하나의 DB transaction으로 저장한다.
history는 append-only다.

## 6. 도메인 경계

```ts
export interface ContentErrorReportTargetResolver {
  resolve(
    origin: ContentErrorReportOrigin,
  ): Promise<{
    reference: ContentErrorReportCanonicalReference;
    snapshot: ContentErrorReportSnapshot;
  } | null>;
}

export interface ContentErrorReportAssigneeResolver {
  isAssignable(userId: string): Promise<boolean>;
}

export interface ContentErrorReportRepository {
  create(input: CreateContentErrorReportRecord): Promise<ContentErrorReport>;
  changeStatus(input: ChangeContentErrorReportStatusRecord): Promise<
    ContentErrorReport | null
  >;
  changeAssignee(input: ChangeContentErrorReportAssigneeRecord): Promise<
    ContentErrorReport | null
  >;
}

export interface ContentErrorReportQuery {
  list(query: AdminContentErrorReportListQuery): Promise<ContentErrorReportPage>;
  findById(reportId: string): Promise<ContentErrorReportDetail | null>;
}
```

`ContentErrorReportService`는 설명 trim과 1,000자 제한, target resolution,
초기 `OPEN`, 상태 전이, 담당자 변경을 담당한다. repository는 row lock,
동시 갱신 검사, history와 audit transaction을 담당한다.

관리자 deep-link는 canonical reference의 종류로 계산한다. 알려진 경로는
문제 `/admin/questions/{contentId}`, 어휘
`/admin/vocabularies/{contentId}`다. 문장·음성은 원래 소유 콘텐츠로,
개념은 concept-learning이 공개하는 관리자 상세 경로로 연결한다.

## 7. HTTP 계약

### 7.1 학습자

`POST /content-error-reports`

```ts
export interface CreateContentErrorReportRequest {
  origin: ContentErrorReportOrigin;
  category: ContentErrorReportCategory;
  description?: string;
}

export interface CreateContentErrorReportResponse {
  id: string;
  status: 'OPEN';
  createdAt: string;
}
```

인증된 `LEARNER` 이상만 호출한다. 서버는 현재 사용자 ID를 신고자로
사용한다.

### 7.2 관리자

- `GET /admin/content-error-reports`
- `GET /admin/content-error-reports/{reportId}`
- `PUT /admin/content-error-reports/{reportId}/status`
- `PUT /admin/content-error-reports/{reportId}/assignee`
- `DELETE /admin/content-error-reports/{reportId}/assignee`

관리자 목록 query는 `status`, `targetKind`, `category`, `assigneeUserId`,
`page`, `pageSize`를 지원하고 `createdAt DESC, id ASC`로 정렬한다.
상태 요청은 `{ status }`, 담당자 요청은 `{ assigneeUserId }`만 허용한다.
모든 관리자 경로는 `ADMIN`, ACTIVE 계정, TOTP 등록을 요구한다.

오류 code는 다음으로 고정한다.

- `CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE`
- `CONTENT_ERROR_REPORT_NOT_FOUND`
- `CONTENT_ERROR_REPORT_INVALID_TRANSITION`
- `CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE`
- `CONTENT_ERROR_REPORT_CONCURRENT_UPDATE`

## 8. 프론트엔드

`features/report-content-error`가 origin, 현재 화면에 표시할 target preview,
분류, 선택 설명, mutation과 성공 상태를 소유한다. 공용 modal은 기존
`shared/ui/dialog`, `select` 또는 접근 가능한 radio group, `textarea`,
`button`을 조합하고 포커스 복귀와 오류 안내를 보존한다.

`pages/content-error-report-management`는 관리자 목록·상세 read query와
필터, 상태·담당자 mutation, 이력, deep-link를 소유한다. 기존 문제·어휘·
문장·개념 화면에 trigger를 꽂는 작업과 관리자 navigation·route 등록은
통합 단계에서만 수행한다.

## 9. 소유권과 병렬 통합

기능 브랜치가 독점 소유한다.

- `shared/contracts/src/feedback/**`
- `backend/domain/src/feedback/**`
- `backend/database/src/schema/feedback.schema.ts`
- `backend/database/src/repositories/drizzle-content-error-report.repository.ts`
- `backend/database/src/queries/drizzle-content-error-report.query.ts`
- `backend/api/src/feedback/**`
- `frontend/web/src/features/report-content-error/**`
- `frontend/web/src/pages/content-error-report-management/**`

통합 담당자만 변경한다.

- 모든 workspace root `index.ts` barrel의 최종 합본
- `backend/api/src/app.module.ts`
- 공용 `backend/api/src/openapi/openapi.dto.ts`
- `backend/api/src/openapi/openapi.spec.ts`
- `backend/database/drizzle/**`
- `frontend/web/src/routeTree.gen.ts`
- learner/admin navigation
- TanStack file route
- 기존 문제·어휘·문장·개념 화면 연결

concept-learning이 아직 병합되지 않았으면 feedback branch는 concept
schema를 import하지 않는다. origin과 canonical reference 계약을 먼저
고정하고, concept resolver와 deep-link 연결은 두 기능을 순차 병합한
통합 단계에서 완성한다.

독립 typecheck에 필요한 feedback package export는 기능 브랜치의 별도
마지막 commit으로 추가하고 통합 담당자가 세 브랜치 export를 합친다.

## 10. 검증

- 계약·도메인·schema·repository·query·Controller 테스트를 RED/GREEN으로
  작성한다.
- 상태 전이 전체 표, terminal 재개, 담당자 배정·교체·해제, 중복 허용,
  1,000자 경계, immutable snapshot, 자동 콘텐츠 변경 부재를 검증한다.
- 프론트엔드는 modal 키보드 조작, target preview, 선택 설명, 제출 성공과
  API 오류, 관리자 상태·담당자 행동을 컴포넌트 테스트로 검증한다.
- OpenAPI 문서 테스트는 통합 단계에서 모든 활성 경로와 bearer security를
  검증한다.
- Playwright나 API E2E spec은 추가하지 않는다.
