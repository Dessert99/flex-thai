# Backend MVP Stage 3 Question Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세 가지 선택형 문제 템플릿, 불변 문제 버전, 블록·선택지, 최신 콘텐츠 재검증, 원자적 게시·퇴역·무효화를 구현한다.

**Architecture:** `backend/domain/src/questions`가 문제 초안 검증, 상태 전이, transaction port와 게시 use case를 소유한다. `backend/database`는 question Drizzle schema와 transaction adapter를 구현하며, 게시 transaction 안에서 Stage 2의 media·vocabulary·thai-content 현재 상태를 다시 읽고 검증한 뒤 이전 버전 퇴역·새 버전 게시·문장 동결·현재 버전 교체·감사 기록을 함께 확정한다.

**Tech Stack:** Node.js 22, TypeScript, Vitest 4, PostgreSQL 16, Drizzle ORM 0.45, Drizzle Kit 0.31, pnpm 10

## Global Constraints

- 기준 설계: `docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`
- 선행 구현: `docs/superpowers/plans/2026-07-24-backend-mvp-stage-2-content-foundations.md`
- 문제 템플릿은 `STANDARD_CHOICE`, `PASSAGE_CHOICE`, `DIALOGUE_CHOICE`만 사용한다.
- 문제 상태는 `DRAFT`, `PUBLISHED`, `HIDDEN`; 버전 상태는 `DRAFT`, `PUBLISHED`, `RETIRED`, `INVALIDATED`만 사용한다.
- 검증 상태는 버전 수명과 분리해 `PENDING`, `PASSED`, `FAILED`를 사용한다.
- 게시된 문제 버전은 수정하지 않고 새 초안을 만들며, 새 버전 게시와 기존 버전 퇴역·현재 버전 교체는 한 transaction이다.
- 내용 결함 무효화는 해당 버전을 `INVALIDATED`로 만들고 문제를 같은 transaction에서 즉시 숨긴다.
- 게시 시 저장된 검증 결과만 신뢰하지 않고 같은 transaction에서 최신 문장 offset, 어휘 `PUBLISHED`, 음성 `READY`, 템플릿·선택지·정답 조건을 다시 검증한다.
- 현재 게시 버전은 같은 문제에 속하도록 composite FK를 사용한다.
- 선택지는 같은 문제 버전 안에서 위치가 유일하고 정답은 DB에서 최대 하나, 게시 transaction에서 정확히 하나를 보장한다.
- 게시에 참조한 문장 버전은 같은 transaction에서 `frozenAt`을 설정한다.
- 관리자 변경과 구조화 감사 기록은 같은 transaction에서 저장한다.
- 기존 Identity·Job·입력 upload schema와 `0000`~`0003` migration은 삭제하거나 의미를 변경하지 않는다.
- 공개 HTTP endpoint를 추가하지 않으므로 이 단계에는 Swagger operation이나 OpenAPI path를 추가하지 않는다.
- 브라우저·API E2E 테스트를 추가하지 않는다.
- 테스트 설명은 한국어이며 새 파일·변경 export는 `conventions/comment-convention.md`를 따른다.
- 새 라이브러리, seed 데이터, 추측성 Controller·query 모듈·빈 폴더를 추가하지 않는다.

---

## File Map

### 생성

- `backend/domain/src/questions/question-version.ts`
- `backend/domain/src/questions/question-version.spec.ts`
- `backend/domain/src/questions/question-publication.ts`
- `backend/domain/src/questions/question-publication.spec.ts`
- `backend/domain/src/questions/question-publication.repository.ts`
- `backend/database/src/schema/questions.schema.ts`
- `backend/database/src/schema/questions.schema.spec.ts`
- `backend/database/src/repositories/drizzle-question-publication.repository.ts`
- `backend/database/src/repositories/drizzle-question-publication.repository.spec.ts`
- `backend/database/drizzle/0004_question-publishing.sql`
- `backend/database/drizzle/meta/0004_snapshot.json`

### 수정

- `backend/domain/src/index.ts`
- `backend/database/src/schema/index.ts`
- `backend/database/src/schema/identity.schema.ts`
- `backend/database/src/schema/schema.spec.ts`
- `backend/database/src/index.ts`
- `backend/database/drizzle/meta/_journal.json`

---

### Task 1: 문제 버전 모델과 최신 콘텐츠 검증

**Files:**

- Create: `backend/domain/src/questions/question-version.ts`
- Create: `backend/domain/src/questions/question-version.spec.ts`
- Modify: `backend/domain/src/index.ts`

**Interfaces:**

- Consumes:
  - `MediaAsset`, `assertMediaAssetReady`
  - `ThaiSentenceVersionInput`, `validateThaiSentenceVersion`
  - Stage 2 `Vocabulary['status']`
- Produces:
  - `QuestionTemplate`, `QuestionBlockKind`, `QuestionDisplayMode`
  - `QuestionVersionValidationCandidate`
  - `QuestionValidationIssue`, `QuestionValidationReport`
  - `validateQuestionVersion(candidate)`

- [ ] **Step 1: 템플릿·정답·최신 콘텐츠 조건의 실패 테스트를 작성한다**

`backend/domain/src/questions/question-version.spec.ts`에 다음 동작을 각각
독립 한국어 `it`으로 작성한다.

```ts
/** 문제 버전의 구조와 최신 게시 의존성을 검증한다 */
import { describe, expect, it } from 'vitest';
import type { ReadyMediaAsset } from '../media/media-asset.js';
import {
  validateQuestionVersion,
  type QuestionVersionValidationCandidate,
} from './question-version.js';

const readyAudio = (id: string): ReadyMediaAsset => ({
  id,
  kind: 'AUDIO',
  storageKey: `audio/${id}`,
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 1,
  declaredSha256: 'a'.repeat(64),
  mimeType: 'audio/mpeg',
  sizeBytes: 1,
  sha256: 'a'.repeat(64),
  status: 'READY',
  readyAt: new Date('2026-07-24T00:00:00.000Z'),
});

const candidate = (): QuestionVersionValidationCandidate => ({
  id: 'version-id',
  questionId: 'question-id',
  difficulty: 3,
  typeVersion: {
    id: 'type-version-id',
    template: 'STANDARD_CHOICE',
    optionCount: 2,
  },
  blocks: [
    {
      id: 'question-block',
      kind: 'QUESTION',
      displayMode: 'TEXT',
      position: 0,
      sentences: [],
    },
  ],
  options: [
    {
      id: 'option-1',
      position: 0,
      isCorrect: true,
      sentence: {
        id: 'sentence-1',
        input: {
          originalText: 'กข',
          translationKo: '정답',
          pronunciationKo: '꼬 커',
          toneMarks: '- -',
          mediaAssetId: 'audio-1',
          tokens: [],
          expressions: [],
        },
        mediaAsset: readyAudio('audio-1'),
        referencedVocabularies: [],
        pronunciationMediaAssets: [],
      },
    },
    {
      id: 'option-2',
      position: 1,
      isCorrect: false,
      sentence: {
        id: 'sentence-2',
        input: {
          originalText: 'คง',
          translationKo: '오답',
          pronunciationKo: '커 응어',
          toneMarks: '- -',
          mediaAssetId: 'audio-2',
          tokens: [],
          expressions: [],
        },
        mediaAsset: readyAudio('audio-2'),
        referencedVocabularies: [],
        pronunciationMediaAssets: [],
      },
    },
  ],
});

describe('QuestionVersion 문제 버전 게시 검증', () => {
  it('STANDARD_CHOICE는 QUESTION 하나와 유형 버전의 선택지 수를 요구한다', () => {
    expect(validateQuestionVersion(candidate())).toEqual({
      status: 'PASSED',
      issues: [],
    });
  });

  it('정답 선택지가 두 개면 정확히 하나 규칙을 실패한다', () => {
    const input = candidate();
    input.options[1] = { ...input.options[1]!, isCorrect: true };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options',
      code: 'CORRECT_OPTION_COUNT_INVALID',
    });
  });

  it('숨긴 어휘나 준비되지 않은 음성을 참조하면 게시 검증을 실패한다', () => {
    const input = candidate();
    input.options[0]!.sentence.referencedVocabularies = [
      { id: 'vocabulary-id', status: 'HIDDEN' },
    ];

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'options.0.sentence.referencedVocabularies.0',
      code: 'VOCABULARY_NOT_PUBLISHED',
    });
  });

  it('지문형과 대화형은 각각 정확한 핵심 블록을 요구한다', () => {
    const input = candidate();
    input.typeVersion = {
      ...input.typeVersion,
      template: 'PASSAGE_CHOICE',
    };

    expect(validateQuestionVersion(input).issues).toContainEqual({
      path: 'blocks',
      code: 'QUESTION_TEMPLATE_INVALID',
    });
  });
});
```

- [ ] **Step 2: 새 질문 domain 모듈 부재로 RED인지 확인한다**

Run:

```bash
pnpm exec vitest run backend/domain/src/questions/question-version.spec.ts
```

Expected: FAIL with `Cannot find module './question-version.js'`

- [ ] **Step 3: 질문 검증 타입과 순수 함수를 최소 구현한다**

`question-version.ts`는 다음 계약을 구현한다.

```ts
/** 선택형 문제 버전의 구조와 최신 콘텐츠 게시 조건을 검증한다 */
import type { MediaAsset } from '../media/media-asset.js';
import { assertMediaAssetReady } from '../media/media-asset.js';
import type { ThaiSentenceVersionInput } from '../thai-content/thai-sentence-version.js';
import { validateThaiSentenceVersion } from '../thai-content/thai-sentence-version.js';

/** MVP 선택형 문제 템플릿 */
export type QuestionTemplate =
  | 'STANDARD_CHOICE'
  | 'PASSAGE_CHOICE'
  | 'DIALOGUE_CHOICE';

/** 문제 화면을 구성하는 블록 종류 */
export type QuestionBlockKind =
  | 'INSTRUCTION'
  | 'PASSAGE'
  | 'DIALOGUE'
  | 'QUESTION'
  | 'EXPLANATION';

/** 문장 텍스트와 음성의 초기 표시 방식 */
export type QuestionDisplayMode =
  | 'TEXT'
  | 'AUDIO'
  | 'TEXT_AND_AUDIO'
  | 'AUDIO_THEN_REVEAL';

/** 게시 검증이 확인할 공용 어휘 현재 상태 */
export interface ReferencedVocabularyState {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
}

/** 문장 입력과 게시 시점의 최신 참조 상태 */
export interface QuestionSentenceCandidate {
  id: string;
  input: ThaiSentenceVersionInput;
  mediaAsset: MediaAsset;
  referencedVocabularies: ReferencedVocabularyState[];
  pronunciationMediaAssets: MediaAsset[];
}

/** 검증할 문제 버전 전체 스냅샷 */
export interface QuestionVersionValidationCandidate {
  id: string;
  questionId: string;
  difficulty: number;
  typeVersion: {
    id: string;
    template: QuestionTemplate;
    optionCount: number;
  };
  blocks: Array<{
    id: string;
    kind: QuestionBlockKind;
    displayMode: QuestionDisplayMode;
    position: number;
    sentences: Array<{ speaker: string | null; sentence: QuestionSentenceCandidate }>;
  }>;
  options: Array<{
    id: string;
    position: number;
    isCorrect: boolean;
    sentence: QuestionSentenceCandidate;
  }>;
}

/** 문제 게시 불가 원인을 안정적인 path와 code로 보존한다 */
export interface QuestionValidationIssue {
  path: string;
  code:
    | 'DIFFICULTY_INVALID'
    | 'BLOCK_POSITION_INVALID'
    | 'OPTION_POSITION_INVALID'
    | 'OPTION_COUNT_INVALID'
    | 'CORRECT_OPTION_COUNT_INVALID'
    | 'QUESTION_TEMPLATE_INVALID'
    | 'DIALOGUE_SPEAKER_REQUIRED'
    | 'THAI_CONTENT_INVALID'
    | 'VOCABULARY_NOT_PUBLISHED'
    | 'MEDIA_ASSET_NOT_READY';
}

/** 관리자 검증 응답과 DB 저장이 공유하는 결정 규칙 보고서 */
export interface QuestionValidationReport {
  status: 'PASSED' | 'FAILED';
  issues: QuestionValidationIssue[];
}
```

검증 구현은 다음을 모두 한 번씩 검사한다.

- difficulty가 정수 1~5인지
- block과 option position이 배열 index와 같은지
- option 수가 `typeVersion.optionCount`와 같은지
- `isCorrect`가 정확히 하나인지
- `STANDARD_CHOICE`: `QUESTION` 정확히 하나, `PASSAGE`·`DIALOGUE` 없음
- `PASSAGE_CHOICE`: `PASSAGE`와 `QUESTION` 각각 정확히 하나, `DIALOGUE` 없음
- `DIALOGUE_CHOICE`: `DIALOGUE`와 `QUESTION` 각각 정확히 하나, `PASSAGE` 없음
- DIALOGUE 문장의 `speaker`가 공백이 아닌지
- 모든 block sentence와 option sentence에 대해
  `validateThaiSentenceVersion`, 문장 media `assertMediaAssetReady`,
  발음 media 전체 `assertMediaAssetReady`, 참조 어휘 전체 `PUBLISHED`

중첩 오류 path는 각각
`blocks.{blockIndex}.sentences.{sentenceIndex}`와
`options.{optionIndex}.sentence`를 prefix로 사용한다. 오류가 하나라도 있으면
`FAILED`, 없으면 `PASSED`를 반환한다.

- [ ] **Step 4: domain 테스트·typecheck를 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/domain/src/questions/question-version.spec.ts
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
```

Expected: focused 테스트와 domain 전체 테스트, typecheck가 exit 0

- [ ] **Step 5: 자체 검토 후 커밋한다**

Run:

```bash
git add backend/domain/src/questions/question-version.ts backend/domain/src/questions/question-version.spec.ts backend/domain/src/index.ts
git commit -m "feat: validate question version drafts"
```

---

### Task 2: 문제 게시 transaction port와 상태 수명

**Files:**

- Create: `backend/domain/src/questions/question-publication.repository.ts`
- Create: `backend/domain/src/questions/question-publication.ts`
- Create: `backend/domain/src/questions/question-publication.spec.ts`
- Modify: `backend/domain/src/index.ts`

**Interfaces:**

- Consumes:
  - Task 1 `validateQuestionVersion`
- Produces:
  - `QuestionRecord`, `QuestionVersionRecord`
  - `QuestionPublicationTransaction`, `QuestionPublicationRepository`
  - `QuestionPublicationService.validateVersion`
  - `QuestionPublicationService.publishVersion`
  - `QuestionPublicationService.invalidateVersion`
  - `QuestionPublicationService.hideQuestion`
  - `QuestionPublicationService.restoreQuestion`
  - `QuestionPublicationError`

- [ ] **Step 1: 원자적 게시·퇴역·무효화의 실패 테스트를 작성한다**

테스트용 transaction fake는 호출 이름을 배열에 기록한다. 다음 네 동작을
독립 테스트로 고정한다.

```ts
describe('QuestionPublicationService 문제 게시 수명', () => {
  it('게시 transaction에서 최신 상태를 재검증하고 이전 버전을 퇴역시킨다', async () => {
    const calls: string[] = [];
    const transaction = createPassingTransaction(calls);
    const service = createService(transaction);

    await service.publishVersion({
      questionId: 'question-id',
      versionId: 'draft-version-id',
      actorUserId: 'admin-id',
      requestId: 'request-id',
      occurredAt: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
      'retireVersion',
      'publishVersion',
      'setCurrentPublishedVersion',
      'freezeReferencedSentences',
      'appendAuditLog',
    ]);
  });

  it('최신 콘텐츠 재검증이 실패하면 어떤 상태 변경도 호출하지 않는다', async () => {
    const calls: string[] = [];
    const transaction = createFailingValidationTransaction(calls);
    const service = createService(transaction);

    await expect(
      service.publishVersion(publishCommand),
    ).rejects.toMatchObject({ code: 'QUESTION_VERSION_NOT_PUBLISHABLE' });
    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'loadValidationCandidate',
      'saveValidation',
    ]);
  });

  it('현재 게시 버전 무효화와 문제 숨김을 같은 transaction에 둔다', async () => {
    const calls: string[] = [];
    const service = createService(createPassingTransaction(calls));

    await service.invalidateVersion(invalidateCommand);

    expect(calls).toEqual([
      'loadQuestion',
      'loadVersion',
      'invalidateVersion',
      'hideQuestion',
      'appendAuditLog',
    ]);
  });

  it('유효한 현재 게시 버전이 없는 숨긴 문제는 복구하지 않는다', async () => {
    const service = createService(
      createHiddenInvalidatedTransaction(),
    );

    await expect(service.restoreQuestion(restoreCommand)).rejects.toMatchObject({
      code: 'QUESTION_RESTORE_NOT_ALLOWED',
    });
  });
});
```

- [ ] **Step 2: publication 모듈 부재 RED를 확인한다**

Run:

```bash
pnpm exec vitest run backend/domain/src/questions/question-publication.spec.ts
```

Expected: FAIL with module resolution error

- [ ] **Step 3: transaction port와 use case를 구현한다**

`question-publication.repository.ts`에 다음 record와 port를 정의한다.

```ts
/** 문제 게시 use case가 DB transaction에 요구하는 원자적 저장 계약을 정의한다 */
import type {
  QuestionValidationReport,
  QuestionVersionValidationCandidate,
} from './question-version.js';

/** 논리 문제의 노출 상태와 현재 게시 버전 */
export interface QuestionRecord {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  currentPublishedVersionId: string | null;
}

/** 불변 문제 버전의 수명과 최신 검증 결과 */
export interface QuestionVersionRecord {
  id: string;
  questionId: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED';
  validationStatus: 'PENDING' | 'PASSED' | 'FAILED';
  publishedAt: Date | null;
}

/** 한 PostgreSQL transaction 안에서만 사용할 문제 게시 저장 연산 */
export interface QuestionPublicationTransaction {
  loadQuestion(questionId: string): Promise<QuestionRecord | null>;
  loadVersion(versionId: string): Promise<QuestionVersionRecord | null>;
  loadValidationCandidate(
    versionId: string,
  ): Promise<QuestionVersionValidationCandidate | null>;
  saveValidation(
    versionId: string,
    report: QuestionValidationReport,
    validatedAt: Date,
  ): Promise<void>;
  retireVersion(versionId: string): Promise<void>;
  publishVersion(versionId: string, publishedAt: Date): Promise<void>;
  setCurrentPublishedVersion(
    questionId: string,
    versionId: string,
  ): Promise<void>;
  freezeReferencedSentences(versionId: string, frozenAt: Date): Promise<void>;
  invalidateVersion(versionId: string): Promise<void>;
  hideQuestion(questionId: string): Promise<void>;
  restoreQuestion(questionId: string): Promise<void>;
  appendAuditLog(input: {
    actorUserId: string;
    action: string;
    targetType: 'QUESTION' | 'QUESTION_VERSION';
    targetId: string;
    summary: Record<string, unknown>;
    requestId: string;
  }): Promise<void>;
}

/** 로컬 PostgreSQL과 Data API가 같은 transaction use case를 실행하게 한다 */
export interface QuestionPublicationRepository {
  runInTransaction<T>(
    work: (transaction: QuestionPublicationTransaction) => Promise<T>,
  ): Promise<T>;
}
```

`question-publication.ts`는 다음 규칙을 구현한다.

- `validateVersion(versionId, occurredAt)`은 transaction에서 version과
  candidate를 읽고 `validateQuestionVersion` 결과를 저장한 뒤 report 반환
- `publishVersion(command)`은 question·version 소유 관계와 `DRAFT` 상태를
  확인하고 candidate를 **transaction 안에서 다시 검증**해 report 저장
- report가 `FAILED`면 `QUESTION_VERSION_NOT_PUBLISHABLE`
- 기존 current version이 있으면 target과 다를 때 `retireVersion`
- `publishVersion` → `setCurrentPublishedVersion` →
  `freezeReferencedSentences` → audit 순서
- `invalidateVersion`은 target이 현재 `PUBLISHED` 버전일 때만
  invalidate → hide → audit
- `hideQuestion`은 `PUBLISHED`만 숨기고, `restoreQuestion`은 현재 버전이
  `PUBLISHED`일 때만 `HIDDEN`을 복구
- 모든 상태·not found 오류는 다음 code 중 하나인
  `QuestionPublicationError`로 전달:
  `QUESTION_NOT_FOUND`, `QUESTION_VERSION_NOT_FOUND`,
  `QUESTION_VERSION_MISMATCH`, `IMMUTABLE_VERSION`,
  `QUESTION_VERSION_NOT_PUBLISHABLE`, `QUESTION_STATE_CONFLICT`,
  `QUESTION_RESTORE_NOT_ALLOWED`

- [ ] **Step 4: publication 테스트와 domain 전체 검증을 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/domain/src/questions/question-publication.spec.ts
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
```

Expected: 모든 명령 exit 0

- [ ] **Step 5: 자체 검토 후 커밋한다**

Run:

```bash
git add backend/domain/src/questions backend/domain/src/index.ts
git commit -m "feat: define question publication lifecycle"
```

---

### Task 3: Questions Drizzle schema와 0004 migration

**Files:**

- Create: `backend/database/src/schema/questions.schema.ts`
- Create: `backend/database/src/schema/questions.schema.spec.ts`
- Modify: `backend/database/src/schema/identity.schema.ts`
- Modify: `backend/database/src/schema/index.ts`
- Modify: `backend/database/src/schema/schema.spec.ts`
- Create: `backend/database/drizzle/0004_question-publishing.sql`
- Create: `backend/database/drizzle/meta/0004_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`

**Interfaces:**

- Produces:
  - `questionTypes`, `questionTypeVersions`
  - `questions`, `questionVersions`
  - `questionBlocks`, `questionBlockSentences`, `questionOptions`
  - 질문 enum 7개
  - 구조화 감사 컬럼 `actorUserId`, `targetType`, `targetId`

- [ ] **Step 1: 핵심 관계와 제약을 고정하는 실패 테스트를 작성한다**

`questions.schema.spec.ts`는 `getTableConfig`로 다음을 exact assertion한다.

- `questionTypes.slug` unique
- `(questionTypeId, version)`, `(questionId, version)` unique
- `questions(id,currentPublishedVersionId)` →
  `questionVersions(questionId,id)` composite FK
- block, block sentence, option position unique
- `questionOptions(questionVersionId,id)` table-level unique
- `question_options_one_correct_per_version` partial unique index
- 모든 FK `onDelete: restrict`
- question version difficulty 1~5와 version 양수 check
- audit structured columns 존재

Run:

```bash
pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts
```

Expected: FAIL because question schema exports do not exist

- [ ] **Step 2: question schema를 구현한다**

`questions.schema.ts`는 다음 enum을 정의한다.

```ts
questionSkillEnum: ['READING', 'LISTENING']
questionTemplateEnum: ['STANDARD_CHOICE', 'PASSAGE_CHOICE', 'DIALOGUE_CHOICE']
questionStatusEnum: ['DRAFT', 'PUBLISHED', 'HIDDEN']
questionVersionStatusEnum: ['DRAFT', 'PUBLISHED', 'RETIRED', 'INVALIDATED']
questionValidationStatusEnum: ['PENDING', 'PASSED', 'FAILED']
questionBlockKindEnum: ['INSTRUCTION', 'PASSAGE', 'DIALOGUE', 'QUESTION', 'EXPLANATION']
questionDisplayModeEnum: ['TEXT', 'AUDIO', 'TEXT_AND_AUDIO', 'AUDIO_THEN_REVEAL']
```

테이블은 승인 ERD 컬럼을 다음과 같이 구현한다.

- `question_types`: UUID, unique slug, displayName, skill, timestamps
- `question_type_versions`: parent FK, positive version, template,
  positive optionCount, `decisionRules` jsonb, parent/version unique
- `questions`: status, nullable currentPublishedVersionId, timestamps,
  `(id,currentPublishedVersionId)` composite FK
- `question_versions`: questionId, positive version, typeVersionId,
  difficulty 1~5, status, validationStatus,
  `validationIssues: jsonb<QuestionValidationIssue[]>`, validatedAt,
  publishedAt, timestamps, `(questionId,version)` unique,
  `(questionId,id)` table-level unique
- `question_blocks`: questionVersionId, kind, displayMode, nonnegative
  position, version/position unique
- `question_block_sentences`: blockId, sentenceVersionId, nonnegative
  position, nullable speaker, block/position unique
- `question_options`: questionVersionId, sentenceVersionId, nonnegative
  position, isCorrect, version/position unique,
  `(questionVersionId,id)` table-level unique, `isCorrect=true` partial
  unique index on questionVersionId

모든 콘텐츠 FK는 `onDelete: 'restrict'`를 사용한다.

`identity.schema.ts`의 기존 `auditLogs`에는 다음 nullable additive 컬럼을
추가한다. 기존 `SYSTEM_BOOTSTRAP` row와 adapter를 깨지 않게 default나
non-null 전환을 하지 않는다.

```ts
actorUserId: uuid('actor_user_id').references(() => users.id, {
  onDelete: 'restrict',
}),
targetType: text('target_type'),
targetId: uuid('target_id'),
```

- [ ] **Step 3: schema 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/database/src/schema/questions.schema.spec.ts backend/database/src/schema/schema.spec.ts
pnpm --filter @flex-thia/database typecheck
```

Expected: schema tests와 typecheck exit 0

- [ ] **Step 4: generated 0004 migration을 만들고 clean DB에 적용한다**

Run:

```bash
pnpm --filter @flex-thia/database exec drizzle-kit generate --config drizzle.local.config.ts --name question-publishing
```

Expected:

- `0004_question-publishing.sql`, `0004_snapshot.json`, journal idx 4 생성
- 기존 `0000`~`0003`과 Stage 2 schema 의미 변화 없음
- destructive SQL 없음
- composite target UNIQUE가 FK보다 먼저 존재

본인이 만든 exact 임시 PostgreSQL 16 container만 사용해 clean
`0000`~`0004` migration을 적용하고 migration count 5, current version
composite FK, one-correct partial unique, option composite unique, audit
structured columns을 catalog에서 확인한 뒤 container를 제거한다. 기존 DB와
volume은 삭제하지 않는다.

- [ ] **Step 5: database 전체 검증 후 커밋한다**

Run:

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/database/src/schema backend/database/drizzle
git commit -m "feat: add question publishing schema"
```

Expected: 모든 검증 exit 0, 0004 additive migration만 추가

---

### Task 4: Drizzle 문제 게시 transaction adapter

**Files:**

- Create: `backend/database/src/repositories/drizzle-question-publication.repository.ts`
- Create: `backend/database/src/repositories/drizzle-question-publication.repository.spec.ts`
- Modify: `backend/database/src/index.ts`

**Interfaces:**

- Consumes:
  - Task 2 `QuestionPublicationRepository`, `QuestionPublicationTransaction`
  - Task 3 question schema
  - Stage 2 media/vocabulary/thai-content schema
- Produces:
  - `DrizzleQuestionPublicationRepository`

- [ ] **Step 1: transaction과 최신 validation candidate mapping 실패 테스트를 작성한다**

테스트는 fake Drizzle database의 `transaction` callback에 전달된 객체를
기록해 다음을 고정한다.

- `runInTransaction`이 callback 결과를 그대로 반환하고 예외를 삼키지 않음
- `loadQuestion`, `loadVersion` row를 domain record camelCase로 mapping
- `saveValidation`이 status·issues·validatedAt을 한 update로 저장
- `retireVersion`, `publishVersion`, `invalidateVersion`,
  `setCurrentPublishedVersion`, `hideQuestion`, `restoreQuestion`이 기대
  현재 상태를 `WHERE`에 포함하고 `.returning()` 0개면 안정적 adapter 오류
- `freezeReferencedSentences`가 block/option의 distinct sentence IDs만
  `frozenAt is null` 조건으로 update
- `appendAuditLog`가 actorUserId/targetType/targetId와 기존
  actorSub/target 호환 컬럼을 같은 insert에 기록

Run:

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-question-publication.repository.spec.ts
```

Expected: FAIL with module resolution error

- [ ] **Step 2: Drizzle adapter와 validation candidate loader를 구현한다**

`DrizzleQuestionPublicationRepository`는 `PgDatabase<PgQueryResultHKT,
typeof schema>`를 받고 `database.transaction` 안에서
`QuestionPublicationTransaction` 객체를 생성한다.

`loadValidationCandidate(versionId)`는 다음 현재 상태를 읽어 Task 1 입력으로
조립한다.

1. `question_versions`와 `question_type_versions`
2. block·block sentence·thai sentence version·문장 media
3. option·thai sentence version·문장 media
4. 각 distinct sentence version의 token vocabulary 상태
5. token pronunciation이 참조한 media 상태
6. expression vocabulary 상태와 kind

DB row의 media 상태를 `MediaAsset` union으로 mapping할 때 `READY` metadata가
불완전하면 `MediaAssetDomainError('MEDIA_ASSET_NOT_READY')`와 같은 게시 실패
원인으로 변환한다. token/expression row는 `ThaiSentenceVersionInput`을
position 순서로 복원한다. 같은 sentence를 block과 option이 함께 참조하면
candidate 객체를 한 번 조립해 재사용한다.

상태 변경 메서드는 모두 `.returning({ id })` 결과가 정확히 하나인지
검사하고 0개면 `QuestionPublicationPersistenceError`를 던진다.

- [ ] **Step 3: adapter focused 테스트와 database 전체 검증을 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/database/src/repositories/drizzle-question-publication.repository.spec.ts
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
```

Expected: 모든 명령 exit 0

- [ ] **Step 4: 실제 transaction rollback과 게시 결과를 clean PostgreSQL에서 검증한다**

본인이 만든 임시 PostgreSQL 16에 `0000`~`0004`를 적용한 뒤 최소 fixture를
삽입해 다음 repository integration check를 실행한다.

- 유효한 새 버전 게시: 이전 `PUBLISHED` → `RETIRED`, 새 버전 →
  `PUBLISHED`, question current 교체, 참조 문장 `frozenAt`, audit row가 모두
  commit
- 숨긴 vocabulary 또는 `UPLOADING` media로 바꾼 뒤 게시: use case가
  `QUESTION_VERSION_NOT_PUBLISHABLE`, 저장 validation `FAILED`를 포함한
  transaction 전체 rollback으로 원래 상태 유지
- 현재 버전 무효화: version `INVALIDATED`, question `HIDDEN`, audit가 함께
  commit

검증 뒤 본인이 만든 container만 제거한다.

- [ ] **Step 5: 공개 export와 전체 검증 후 커밋한다**

`backend/database/src/index.ts`에 다음 export를 추가한다.

```ts
/** 문제 검증·게시·무효화 transaction adapter를 공개한다 */
export * from './repositories/drizzle-question-publication.repository.js';
```

Run:

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/database/src/repositories backend/database/src/index.ts
git commit -m "feat: publish question versions transactionally"
```

Expected: 모든 검증 exit 0

---

## Stage 3 전체 검증

Task 4 리뷰 승인 뒤 Stage 3 시작 commit부터 전체 변경 리뷰를 수행하고
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

- structure, lint, typecheck, test, build 모두 exit 0
- Stage 3 변경 파일은 Prettier check 통과
- clean PostgreSQL에서 migration 5개와 question publish/invalidate
  transaction 검증 통과
- 공개 HTTP path 변화 없음
- 작업 트리 clean
