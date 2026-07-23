# Backend MVP Stage 2 Content Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문제·게시·학습 흐름이 의존할 변경 불가능한 음성 자산, 공용 어휘, 태국어 문장 버전의 domain 규칙과 Drizzle schema를 만든다.

**Architecture:** `backend/domain`에는 외부 기술을 모르는 상태 전이와 검증 함수만 두고, `backend/database`에는 `media`, `vocabulary`, `thai-content` 기능별 schema와 관계 무결성을 둔다. 기존 `normalizeThaiSearchText` 공개 export는 유지하면서 소유 위치만 `vocabulary`로 옮기고, 공개 HTTP endpoint는 이 단계에서 추가하지 않는다.

**Tech Stack:** Node.js 22, TypeScript, Vitest 4, PostgreSQL, Drizzle ORM 0.45, Drizzle Kit 0.31, pnpm 10

## Global Constraints

- 기준 설계: `docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`
- 백엔드 구조: `docs/development/backend-architecture.md`
- `MediaAsset`은 MVP에서 `AUDIO`만 지원하고 `UPLOADING`, `READY`, `REJECTED` 상태를 사용한다.
- `READY` 음성 자산은 덮어쓰지 않고 새 음성은 새 자산으로 만든다.
- 같은 `normalizedThai` 어휘는 하나만 존재하며 어휘 상태는 `DRAFT`, `PUBLISHED`, `HIDDEN`만 사용한다.
- 문장·문장 버전을 분리하고 동결된 문장 버전은 수정하지 않는다.
- 원문 offset은 Unicode code point 기준 시작 포함·끝 제외로 해석한다.
- 토큰은 공용 어휘와 그 어휘에 속한 뜻·발음을 함께 참조해야 한다.
- 겹치는 표현은 관리자 지정, 긴 표현, 먼저 시작하는 표현 순으로 대표 표현을 정한다.
- 기존 공개 가입·SMS·Job·입력 upload schema와 인프라 자원은 삭제하거나 수정하지 않는다.
- 공개 HTTP endpoint를 추가하지 않으므로 이 단계에는 Swagger operation이나 OpenAPI path를 추가하지 않는다.
- 브라우저·API E2E 테스트를 추가하지 않는다.
- 테스트의 `describe`, `it`, `test` 설명은 한국어로 작성한다.
- 새 파일과 변경 export는 `conventions/comment-convention.md`를 따른다.
- 새 라이브러리와 추측성 repository·Controller·빈 폴더는 추가하지 않는다.

---

## File Map

### 생성

- `backend/domain/src/media/media-asset.ts`
- `backend/domain/src/media/media-asset.spec.ts`
- `backend/domain/src/vocabulary/vocabulary.ts`
- `backend/domain/src/vocabulary/vocabulary.spec.ts`
- `backend/domain/src/thai-content/thai-sentence-version.ts`
- `backend/domain/src/thai-content/thai-sentence-version.spec.ts`
- `backend/database/src/schema/media.schema.ts`
- `backend/database/src/schema/vocabulary.schema.ts`
- `backend/database/src/schema/thai-content.schema.ts`
- `backend/database/src/schema/content-foundations.schema.spec.ts`
- `backend/database/drizzle/0003_content-foundations.sql`
- `backend/database/drizzle/meta/0003_snapshot.json`

### 이동

- `backend/domain/src/thai/normalize-thai-search-text.ts` → `backend/domain/src/vocabulary/normalize-thai-search-text.ts`
- `backend/domain/src/thai/normalize-thai-search-text.spec.ts` → `backend/domain/src/vocabulary/normalize-thai-search-text.spec.ts`

### 수정

- `backend/domain/src/index.ts`
- `backend/database/src/schema/index.ts`
- `backend/database/drizzle/meta/_journal.json`

---

### Task 1: MediaAsset 수명 규칙

**Files:**

- Create: `backend/domain/src/media/media-asset.ts`
- Create: `backend/domain/src/media/media-asset.spec.ts`
- Modify: `backend/domain/src/index.ts`

**Interfaces:**

- Produces:
  - `MediaAsset`
  - `MediaAssetStatus`
  - `MediaAssetDomainError`
  - `completeMediaAsset(asset, inspection, readyAt)`
  - `rejectMediaAsset(asset)`
  - `assertMediaAssetReady(asset)`

- [ ] **Step 1: READY 전이와 불변 조건의 실패 테스트를 작성한다**

```ts
/** 음성 자산의 완료·거절·게시 준비 상태를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertMediaAssetReady,
  completeMediaAsset,
  rejectMediaAsset,
  type MediaAsset,
} from './media-asset.js';

const uploadingAsset = (): MediaAsset => ({
  id: 'asset-id',
  kind: 'AUDIO',
  storageKey: 'audio/asset-id',
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 1024,
  declaredSha256: 'a'.repeat(64),
  mimeType: null,
  sizeBytes: null,
  sha256: null,
  status: 'UPLOADING',
  readyAt: null,
});

describe('MediaAsset', () => {
  it('선언 정보와 검사 정보가 같을 때만 READY로 전이한다', () => {
    const readyAt = new Date('2026-07-24T00:00:00.000Z');

    expect(
      completeMediaAsset(
        uploadingAsset(),
        {
          mimeType: 'audio/mpeg',
          sizeBytes: 1024,
          sha256: 'a'.repeat(64),
        },
        readyAt,
      ),
    ).toMatchObject({
      status: 'READY',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
      readyAt,
    });
  });

  it('검사 정보가 선언과 다르면 안정적인 오류를 반환한다', () => {
    expect(() =>
      completeMediaAsset(
        uploadingAsset(),
        {
          mimeType: 'audio/mpeg',
          sizeBytes: 1025,
          sha256: 'a'.repeat(64),
        },
        new Date(),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'MEDIA_INSPECTION_MISMATCH' }),
    );
  });

  it('READY 자산은 완료하거나 거절해 덮어쓸 수 없다', () => {
    const ready = completeMediaAsset(
      uploadingAsset(),
      {
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
      },
      new Date(),
    );

    expect(() => rejectMediaAsset(ready)).toThrowError(
      expect.objectContaining({ code: 'MEDIA_ASSET_IMMUTABLE' }),
    );
  });

  it('게시 준비 확인은 READY가 아닌 자산을 거부한다', () => {
    expect(() => assertMediaAssetReady(uploadingAsset())).toThrowError(
      expect.objectContaining({ code: 'MEDIA_ASSET_NOT_READY' }),
    );
  });
});
```

- [ ] **Step 2: media domain 테스트가 모듈 부재로 실패하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/domain/src/media/media-asset.spec.ts
```

Expected: FAIL with `Cannot find module './media-asset.js'`

- [ ] **Step 3: 최소 수명 규칙을 구현하고 공개한다**

```ts
/** 준비된 음성 파일의 변경 불가능한 수명 규칙을 정의한다 */
export type MediaAssetStatus = 'UPLOADING' | 'READY' | 'REJECTED';

/** private storage의 음성 object와 서버 검증 결과 */
export interface MediaAsset {
  id: string;
  kind: 'AUDIO';
  storageKey: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
  declaredSha256: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  status: MediaAssetStatus;
  readyAt: Date | null;
}

/** storage object를 서버가 다시 확인한 결과 */
export interface MediaAssetInspection {
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/** 음성 수명 규칙 위반을 안정적인 code로 전달한다 */
export class MediaAssetDomainError extends Error {
  constructor(
    readonly code:
      | 'MEDIA_ASSET_IMMUTABLE'
      | 'MEDIA_ASSET_NOT_UPLOADING'
      | 'MEDIA_ASSET_NOT_READY'
      | 'MEDIA_INSPECTION_MISMATCH',
  ) {
    super(code);
    this.name = 'MediaAssetDomainError';
  }
}

const assertUploading = (asset: MediaAsset): void => {
  if (asset.status === 'READY') {
    throw new MediaAssetDomainError('MEDIA_ASSET_IMMUTABLE');
  }
  if (asset.status !== 'UPLOADING') {
    throw new MediaAssetDomainError('MEDIA_ASSET_NOT_UPLOADING');
  }
};

/** 선언 정보와 실제 object가 일치할 때만 음성을 READY로 전이한다 */
export const completeMediaAsset = (
  asset: MediaAsset,
  inspection: MediaAssetInspection,
  readyAt: Date,
): MediaAsset => {
  assertUploading(asset);
  if (
    asset.declaredMimeType !== inspection.mimeType ||
    asset.declaredSizeBytes !== inspection.sizeBytes ||
    asset.declaredSha256.toLowerCase() !== inspection.sha256.toLowerCase()
  ) {
    throw new MediaAssetDomainError('MEDIA_INSPECTION_MISMATCH');
  }
  return {
    ...asset,
    mimeType: inspection.mimeType,
    sizeBytes: inspection.sizeBytes,
    sha256: inspection.sha256.toLowerCase(),
    status: 'READY',
    readyAt,
  };
};

/** 완료 검증에 실패한 업로드를 다시 게시 후보로 쓰지 못하게 종료한다 */
export const rejectMediaAsset = (asset: MediaAsset): MediaAsset => {
  assertUploading(asset);
  return { ...asset, status: 'REJECTED' };
};

/** 게시 규칙이 검증된 READY 음성만 참조하게 한다 */
export const assertMediaAssetReady = (asset: MediaAsset): void => {
  if (asset.status !== 'READY') {
    throw new MediaAssetDomainError('MEDIA_ASSET_NOT_READY');
  }
};
```

`backend/domain/src/index.ts` 끝에 다음 공개 export를 추가한다.

```ts
/** 음성 자산의 완료·거절·게시 준비 규칙을 공개한다 */
export * from './media/media-asset.js';
```

- [ ] **Step 4: media 테스트와 domain typecheck를 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/domain/src/media/media-asset.spec.ts
pnpm --filter @flex-thia/domain typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 5: 자체 검토 후 커밋한다**

Run:

```bash
git add backend/domain/src/media backend/domain/src/index.ts
git commit -m "feat: define media asset lifecycle"
```

---

### Task 2: 공용 어휘 정규화와 상태 전이

**Files:**

- Move: `backend/domain/src/thai/normalize-thai-search-text.ts` → `backend/domain/src/vocabulary/normalize-thai-search-text.ts`
- Move: `backend/domain/src/thai/normalize-thai-search-text.spec.ts` → `backend/domain/src/vocabulary/normalize-thai-search-text.spec.ts`
- Create: `backend/domain/src/vocabulary/vocabulary.ts`
- Create: `backend/domain/src/vocabulary/vocabulary.spec.ts`
- Modify: `backend/domain/src/index.ts`

**Interfaces:**

- Consumes:
  - Task 1의 `MediaAsset`, `assertMediaAssetReady`
- Produces:
  - 기존 공개 함수 `normalizeThaiSearchText(value)`
  - `Vocabulary`
  - `VocabularyDomainError`
  - `createVocabularyDraft(input)`
  - `publishVocabulary(vocabulary, pronunciationAssets)`
  - `hideVocabulary(vocabulary)`
  - `restoreVocabulary(vocabulary)`

- [ ] **Step 1: 정규화·중복 키·게시 상태의 실패 테스트를 작성한다**

기존 정규화 테스트를 새 경로로 이동하고 다음 테스트를 추가한다.

```ts
/** 공용 어휘의 생성·게시·숨김·복구 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '../media/media-asset.js';
import {
  createVocabularyDraft,
  hideVocabulary,
  publishVocabulary,
  restoreVocabulary,
} from './vocabulary.js';

const mediaAsset = (status: MediaAsset['status']): MediaAsset => ({
  id: 'asset-id',
  kind: 'AUDIO',
  storageKey: 'audio/asset-id',
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 1,
  declaredSha256: 'a'.repeat(64),
  mimeType: status === 'READY' ? 'audio/mpeg' : null,
  sizeBytes: status === 'READY' ? 1 : null,
  sha256: status === 'READY' ? 'a'.repeat(64) : null,
  status,
  readyAt: status === 'READY' ? new Date() : null,
});

describe('Vocabulary', () => {
  it('표시 태국어를 보존하고 정규화 표기를 중복 키로 만든다', () => {
    expect(
      createVocabularyDraft({
        id: 'vocabulary-id',
        thai: '  สวัสดี\u200B   ครับ  ',
        kind: 'EXPRESSION',
      }),
    ).toMatchObject({
      thai: '  สวัสดี\u200B   ครับ  ',
      normalizedThai: 'สวัสดี ครับ',
      status: 'DRAFT',
    });
  });

  it('모든 발음 음성이 READY일 때만 게시한다', () => {
    const draft = createVocabularyDraft({
      id: 'vocabulary-id',
      thai: 'สวัสดี',
      kind: 'WORD',
    });

    expect(publishVocabulary(draft, [mediaAsset('READY')]).status).toBe(
      'PUBLISHED',
    );
    expect(() =>
      publishVocabulary(draft, [mediaAsset('UPLOADING')]),
    ).toThrowError(
      expect.objectContaining({ code: 'VOCABULARY_AUDIO_NOT_READY' }),
    );
  });

  it('게시 어휘는 숨긴 뒤 복구할 수 있다', () => {
    const published = publishVocabulary(
      createVocabularyDraft({
        id: 'vocabulary-id',
        thai: 'สวัสดี',
        kind: 'WORD',
      }),
      [mediaAsset('READY')],
    );

    expect(restoreVocabulary(hideVocabulary(published)).status).toBe(
      'PUBLISHED',
    );
  });
});
```

- [ ] **Step 2: vocabulary domain 테스트가 모듈 부재로 실패하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/domain/src/vocabulary/vocabulary.spec.ts backend/domain/src/vocabulary/normalize-thai-search-text.spec.ts
```

Expected: FAIL with `Cannot find module './vocabulary.js'`

- [ ] **Step 3: 어휘 모델과 상태 전이를 최소 구현한다**

```ts
/** 공용 태국어 어휘의 정규화 키와 게시 상태 전이를 정의한다 */
import {
  assertMediaAssetReady,
  type MediaAsset,
} from '../media/media-asset.js';
import { normalizeThaiSearchText } from './normalize-thai-search-text.js';

/** 공용 어휘 또는 다단어 표현 */
export interface Vocabulary {
  id: string;
  thai: string;
  normalizedThai: string;
  kind: 'WORD' | 'EXPRESSION';
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
}

/** 어휘 상태 전이 위반을 안정적인 code로 전달한다 */
export class VocabularyDomainError extends Error {
  constructor(
    readonly code:
      | 'VOCABULARY_EMPTY'
      | 'VOCABULARY_AUDIO_NOT_READY'
      | 'VOCABULARY_STATE_CONFLICT',
  ) {
    super(code);
    this.name = 'VocabularyDomainError';
  }
}

/** 표시 원문을 보존하면서 정확 중복 판정용 표기를 계산한다 */
export const createVocabularyDraft = (input: {
  id: string;
  thai: string;
  kind: Vocabulary['kind'];
}): Vocabulary => {
  const normalizedThai = normalizeThaiSearchText(input.thai);
  if (!normalizedThai) {
    throw new VocabularyDomainError('VOCABULARY_EMPTY');
  }
  return { ...input, normalizedThai, status: 'DRAFT' };
};

/** 발음이 있고 모든 음성이 준비된 초안만 게시한다 */
export const publishVocabulary = (
  vocabulary: Vocabulary,
  pronunciationAssets: readonly MediaAsset[],
): Vocabulary => {
  if (vocabulary.status !== 'DRAFT') {
    throw new VocabularyDomainError('VOCABULARY_STATE_CONFLICT');
  }
  if (pronunciationAssets.length === 0) {
    throw new VocabularyDomainError('VOCABULARY_AUDIO_NOT_READY');
  }
  try {
    pronunciationAssets.forEach(assertMediaAssetReady);
  } catch {
    throw new VocabularyDomainError('VOCABULARY_AUDIO_NOT_READY');
  }
  return { ...vocabulary, status: 'PUBLISHED' };
};

/** 게시된 어휘를 참조 보존 상태로 숨긴다 */
export const hideVocabulary = (vocabulary: Vocabulary): Vocabulary => {
  if (vocabulary.status !== 'PUBLISHED') {
    throw new VocabularyDomainError('VOCABULARY_STATE_CONFLICT');
  }
  return { ...vocabulary, status: 'HIDDEN' };
};

/** 숨긴 어휘를 다시 공개한다 */
export const restoreVocabulary = (vocabulary: Vocabulary): Vocabulary => {
  if (vocabulary.status !== 'HIDDEN') {
    throw new VocabularyDomainError('VOCABULARY_STATE_CONFLICT');
  }
  return { ...vocabulary, status: 'PUBLISHED' };
};
```

`backend/domain/src/index.ts`의 기존 `./thai/normalize-thai-search-text.js`
export를 다음 두 export로 교체한다.

```ts
/** 태국어 어휘의 정확 중복과 검색을 위한 정규화를 공개한다 */
export * from './vocabulary/normalize-thai-search-text.js';

/** 공용 어휘의 생성·게시·숨김·복구 규칙을 공개한다 */
export * from './vocabulary/vocabulary.js';
```

- [ ] **Step 4: vocabulary 테스트와 domain 전체 검증을 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/domain/src/vocabulary
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
```

Expected: 세 명령 모두 exit 0

- [ ] **Step 5: 이동과 어휘 domain을 커밋한다**

Run:

```bash
git add backend/domain/src/index.ts backend/domain/src/thai backend/domain/src/vocabulary
git commit -m "feat: define vocabulary lifecycle"
```

---

### Task 3: 태국어 문장 버전과 Unicode offset 검증

**Files:**

- Create: `backend/domain/src/thai-content/thai-sentence-version.ts`
- Create: `backend/domain/src/thai-content/thai-sentence-version.spec.ts`
- Modify: `backend/domain/src/index.ts`

**Interfaces:**

- Produces:
  - `ThaiSentenceVersionInput`
  - `ThaiContentValidationIssue`
  - `validateThaiSentenceVersion(input)`
  - `resolveRepresentativeExpressions(expressions)`
  - `assertThaiSentenceVersionMutable(frozenAt)`
  - `ThaiContentDomainError`

- [ ] **Step 1: code point offset과 표현 대표 선택의 실패 테스트를 작성한다**

```ts
/** 문장 버전의 Unicode offset·표현 범위·동결 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertThaiSentenceVersionMutable,
  resolveRepresentativeExpressions,
  validateThaiSentenceVersion,
  type ThaiSentenceVersionInput,
} from './thai-sentence-version.js';

const sentence = (): ThaiSentenceVersionInput => ({
  originalText: 'ก😀ข',
  translationKo: '번역',
  pronunciationKo: '발음',
  toneMarks: '성조',
  mediaAssetId: 'media-id',
  tokens: [
    {
      position: 0,
      surface: 'ก',
      startOffset: 0,
      endOffset: 1,
      vocabularyId: 'vocabulary-1',
      meaningId: 'meaning-1',
      pronunciationId: 'pronunciation-1',
      contextMeaningKo: '뜻',
      role: 'TARGET',
    },
    {
      position: 1,
      surface: '😀',
      startOffset: 1,
      endOffset: 2,
      vocabularyId: 'vocabulary-2',
      meaningId: 'meaning-2',
      pronunciationId: 'pronunciation-2',
      contextMeaningKo: '표정',
      role: 'SUPPORTING',
    },
  ],
  expressions: [],
});

describe('ThaiSentenceVersion', () => {
  it('offset을 UTF-16 code unit이 아니라 Unicode code point로 해석한다', () => {
    expect(validateThaiSentenceVersion(sentence())).toEqual([]);
  });

  it('원문 범위와 surface가 다르면 경로가 있는 오류를 반환한다', () => {
    const input = sentence();
    input.tokens[1] = { ...input.tokens[1]!, surface: 'ข' };

    expect(validateThaiSentenceVersion(input)).toContainEqual({
      path: 'tokens.1.surface',
      code: 'TOKEN_SURFACE_MISMATCH',
    });
  });

  it('겹치는 표현은 관리자 지정, 길이, 시작 위치 순으로 대표를 고른다', () => {
    expect(
      resolveRepresentativeExpressions([
        {
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'short',
          adminSelected: true,
        },
        {
          startTokenIndex: 0,
          endTokenIndex: 3,
          vocabularyId: 'long',
          adminSelected: false,
        },
        {
          startTokenIndex: 4,
          endTokenIndex: 5,
          vocabularyId: 'separate',
          adminSelected: false,
        },
      ]),
    ).toEqual([
      expect.objectContaining({ vocabularyId: 'short', representative: true }),
      expect.objectContaining({ vocabularyId: 'long', representative: false }),
      expect.objectContaining({
        vocabularyId: 'separate',
        representative: true,
      }),
    ]);
  });

  it('동결된 문장 버전은 수정할 수 없다', () => {
    expect(() =>
      assertThaiSentenceVersionMutable(new Date()),
    ).toThrowError(
      expect.objectContaining({ code: 'THAI_SENTENCE_VERSION_IMMUTABLE' }),
    );
  });
});
```

- [ ] **Step 2: thai-content 테스트가 모듈 부재로 실패하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/domain/src/thai-content/thai-sentence-version.spec.ts
```

Expected: FAIL with `Cannot find module './thai-sentence-version.js'`

- [ ] **Step 3: 문장 검증과 표현 대표 선택을 최소 구현한다**

```ts
/** 태국어 문장 스냅샷의 Unicode 범위와 동결 불변 조건을 정의한다 */
export interface ThaiTokenOccurrenceInput {
  position: number;
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
  contextMeaningKo: string;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING';
}

/** 여러 토큰에 걸친 공용 표현 범위 */
export interface ThaiExpressionOccurrenceInput {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabularyId: string;
  adminSelected: boolean;
}

/** 표시할 태국어 문장의 불변 버전 입력 */
export interface ThaiSentenceVersionInput {
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
  tokens: ThaiTokenOccurrenceInput[];
  expressions: ThaiExpressionOccurrenceInput[];
}

/** 가져오기와 게시 검증이 공유하는 경로 기반 문장 오류 */
export interface ThaiContentValidationIssue {
  path: string;
  code:
    | 'TOKEN_POSITION_INVALID'
    | 'TOKEN_RANGE_INVALID'
    | 'TOKEN_RANGE_OVERLAP'
    | 'TOKEN_SURFACE_MISMATCH'
    | 'EXPRESSION_RANGE_INVALID';
}

/** 동결된 문장 버전의 변경 시도를 안정적인 code로 전달한다 */
export class ThaiContentDomainError extends Error {
  constructor(readonly code: 'THAI_SENTENCE_VERSION_IMMUTABLE') {
    super(code);
    this.name = 'ThaiContentDomainError';
  }
}

/** code point 기준 토큰 범위와 원문 복원 가능성을 모두 검사한다 */
export const validateThaiSentenceVersion = (
  input: ThaiSentenceVersionInput,
): ThaiContentValidationIssue[] => {
  const codePoints = Array.from(input.originalText);
  const issues: ThaiContentValidationIssue[] = [];
  let previousEnd = 0;
  input.tokens.forEach((token, index) => {
    if (token.position !== index) {
      issues.push({
        path: `tokens.${index}.position`,
        code: 'TOKEN_POSITION_INVALID',
      });
    }
    if (
      token.startOffset < 0 ||
      token.endOffset <= token.startOffset ||
      token.endOffset > codePoints.length
    ) {
      issues.push({
        path: `tokens.${index}`,
        code: 'TOKEN_RANGE_INVALID',
      });
      return;
    }
    if (token.startOffset < previousEnd) {
      issues.push({
        path: `tokens.${index}`,
        code: 'TOKEN_RANGE_OVERLAP',
      });
    }
    if (
      codePoints.slice(token.startOffset, token.endOffset).join('') !==
      token.surface
    ) {
      issues.push({
        path: `tokens.${index}.surface`,
        code: 'TOKEN_SURFACE_MISMATCH',
      });
    }
    previousEnd = Math.max(previousEnd, token.endOffset);
  });
  input.expressions.forEach((expression, index) => {
    if (
      expression.startTokenIndex < 0 ||
      expression.endTokenIndex <= expression.startTokenIndex ||
      expression.endTokenIndex > input.tokens.length
    ) {
      issues.push({
        path: `expressions.${index}`,
        code: 'EXPRESSION_RANGE_INVALID',
      });
    }
  });
  return issues;
};

const overlaps = (
  left: ThaiExpressionOccurrenceInput,
  right: ThaiExpressionOccurrenceInput,
): boolean =>
  left.startTokenIndex < right.endTokenIndex &&
  right.startTokenIndex < left.endTokenIndex;

const comparePriority = (
  left: ThaiExpressionOccurrenceInput,
  right: ThaiExpressionOccurrenceInput,
): number =>
  Number(right.adminSelected) - Number(left.adminSelected) ||
  right.endTokenIndex -
    right.startTokenIndex -
    (left.endTokenIndex - left.startTokenIndex) ||
  left.startTokenIndex - right.startTokenIndex;

/** 겹침 연결군마다 관리자 지정·길이·시작 위치 우선순위로 대표 하나를 고른다 */
export const resolveRepresentativeExpressions = (
  expressions: readonly ThaiExpressionOccurrenceInput[],
): Array<ThaiExpressionOccurrenceInput & { representative: boolean }> => {
  const representatives = new Set<number>();
  const visited = new Set<number>();
  expressions.forEach((_, startIndex) => {
    if (visited.has(startIndex)) return;
    const group: number[] = [];
    const queue = [startIndex];
    visited.add(startIndex);
    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      expressions.forEach((candidate, candidateIndex) => {
        if (
          !visited.has(candidateIndex) &&
          overlaps(expressions[current]!, candidate)
        ) {
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      });
    }
    const winner = [...group].sort((left, right) =>
      comparePriority(expressions[left]!, expressions[right]!),
    )[0]!;
    representatives.add(winner);
  });
  return expressions.map((expression, index) => ({
    ...expression,
    representative: representatives.has(index),
  }));
};

/** 문제 게시로 동결된 문장 스냅샷의 수정을 차단한다 */
export const assertThaiSentenceVersionMutable = (
  frozenAt: Date | null,
): void => {
  if (frozenAt) {
    throw new ThaiContentDomainError('THAI_SENTENCE_VERSION_IMMUTABLE');
  }
};
```

`backend/domain/src/index.ts` 끝에 다음 공개 export를 추가한다.

```ts
/** 태국어 문장 버전의 Unicode offset·표현·동결 규칙을 공개한다 */
export * from './thai-content/thai-sentence-version.js';
```

- [ ] **Step 4: thai-content 테스트와 domain 전체 검증을 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/domain/src/thai-content/thai-sentence-version.spec.ts
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
```

Expected: 세 명령 모두 exit 0

- [ ] **Step 5: 자체 검토 후 커밋한다**

Run:

```bash
git add backend/domain/src/thai-content backend/domain/src/index.ts
git commit -m "feat: validate thai sentence versions"
```

---

### Task 4: 콘텐츠 기반 Drizzle schema와 migration

**Files:**

- Create: `backend/database/src/schema/media.schema.ts`
- Create: `backend/database/src/schema/vocabulary.schema.ts`
- Create: `backend/database/src/schema/thai-content.schema.ts`
- Create: `backend/database/src/schema/content-foundations.schema.spec.ts`
- Modify: `backend/database/src/schema/index.ts`
- Create: `backend/database/drizzle/0003_content-foundations.sql`
- Create: `backend/database/drizzle/meta/0003_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`

**Interfaces:**

- Consumes:
  - 기존 `users`, Job/upload schema는 변경 없이 유지
  - Task 1~3의 상태·종류·관계 이름
- Produces:
  - `mediaAssets`
  - `vocabularies`
  - `vocabularyMeanings`
  - `vocabularyPronunciations`
  - `vocabularyMeaningPronunciations`
  - `thaiSentences`
  - `thaiSentenceVersions`
  - `tokenOccurrences`
  - `expressionOccurrences`
  - 위 테이블과 enum을 포함한 `0003_content-foundations.sql`

- [ ] **Step 1: 핵심 컬럼·unique·composite FK를 고정하는 실패 테스트를 작성한다**

```ts
/** 음성·어휘·문장 schema의 게시 보존과 소유 관계를 검증한다 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  expressionOccurrences,
  mediaAssets,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
} from './index.js';

describe('콘텐츠 기반 데이터베이스 schema', () => {
  it('음성 자산은 선언 정보와 실제 검증 정보 및 READY 시각을 분리한다', () => {
    expect(Object.keys(getTableColumns(mediaAssets))).toEqual(
      expect.arrayContaining([
        'storageKey',
        'declaredMimeType',
        'declaredSizeBytes',
        'declaredSha256',
        'mimeType',
        'sizeBytes',
        'sha256',
        'status',
        'readyAt',
      ]),
    );
  });

  it('어휘 정규화 표기에 유일 제약을 둔다', () => {
    const config = getTableConfig(vocabularies);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      'vocabularies_normalized_thai_unique',
    );
  });

  it('뜻·발음 연결과 토큰은 같은 어휘 소유권을 복합 FK로 고정한다', () => {
    expect(
      getTableConfig(vocabularyMeaningPronunciations).foreignKeys,
    ).toHaveLength(2);
    expect(getTableConfig(tokenOccurrences).foreignKeys.length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('문장 버전 번호와 표현 대표 여부를 보존한다', () => {
    expect(Object.keys(getTableColumns(thaiSentenceVersions))).toEqual(
      expect.arrayContaining(['sentenceId', 'version', 'frozenAt']),
    );
    expect(Object.keys(getTableColumns(expressionOccurrences))).toContain(
      'representative',
    );
  });
});
```

- [ ] **Step 2: database schema 테스트가 새 export 부재로 실패하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/database/src/schema/content-foundations.schema.spec.ts
```

Expected: FAIL because the new schema exports do not exist

- [ ] **Step 3: media schema를 구현한다**

```ts
/** 게시 콘텐츠가 참조하는 변경 불가능한 음성 object를 저장한다 */
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** MVP media 종류 */
export const mediaAssetKindEnum = pgEnum('media_asset_kind', ['AUDIO']);

/** 음성 object 검증 상태 */
export const mediaAssetStatusEnum = pgEnum('media_asset_status', [
  'UPLOADING',
  'READY',
  'REJECTED',
]);

/** 선언 metadata와 서버 검증 metadata를 분리한 private 음성 자산 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: mediaAssetKindEnum('kind').default('AUDIO').notNull(),
    storageKey: text('storage_key').notNull(),
    declaredMimeType: text('declared_mime_type').notNull(),
    declaredSizeBytes: bigint('declared_size_bytes', { mode: 'number' }).notNull(),
    declaredSha256: text('declared_sha256').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    sha256: text('sha256'),
    status: mediaAssetStatusEnum('status').default('UPLOADING').notNull(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('media_assets_storage_key_unique').on(table.storageKey),
    index('media_assets_sha256_status_idx').on(table.sha256, table.status),
    check(
      'media_assets_declared_size_positive',
      sql`${table.declaredSizeBytes} > 0`,
    ),
    check(
      'media_assets_declared_sha256_length',
      sql`char_length(${table.declaredSha256}) = 64`,
    ),
  ],
);
```

- [ ] **Step 4: vocabulary schema를 구현한다**

```ts
/** 공용 어휘의 뜻·발음과 동일 어휘 소유 관계를 저장한다 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mediaAssets } from './media.schema.js';

/** 공용 어휘 종류 */
export const vocabularyKindEnum = pgEnum('vocabulary_kind', [
  'WORD',
  'EXPRESSION',
]);

/** 공용 어휘 공개 상태 */
export const vocabularyStatusEnum = pgEnum('vocabulary_status', [
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
]);

/** 정확 중복을 정규화 표기로 차단하는 공용 어휘 */
export const vocabularies = pgTable(
  'vocabularies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    thai: text('thai').notNull(),
    normalizedThai: text('normalized_thai').notNull(),
    kind: vocabularyKindEnum('kind').notNull(),
    status: vocabularyStatusEnum('status').default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabularies_normalized_thai_unique').on(
      table.normalizedThai,
    ),
  ],
);

/** 공용 어휘의 한국어 뜻 */
export const vocabularyMeanings = pgTable(
  'vocabulary_meanings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    meaningKo: text('meaning_ko').notNull(),
    partOfSpeech: text('part_of_speech').notNull(),
    difficulty: integer('difficulty'),
    contextNote: text('context_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_meanings_id_vocabulary_unique').on(
      table.id,
      table.vocabularyId,
    ),
    check(
      'vocabulary_meanings_difficulty_range',
      sql`${table.difficulty} is null or ${table.difficulty} between 1 and 5`,
    ),
  ],
);

/** 공용 어휘의 한국어 발음·성조·준비 음성 */
export const vocabularyPronunciations = pgTable(
  'vocabulary_pronunciations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    pronunciationKo: text('pronunciation_ko').notNull(),
    toneMarks: text('tone_marks').notNull(),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('vocabulary_pronunciations_id_vocabulary_unique').on(
      table.id,
      table.vocabularyId,
    ),
  ],
);

/** 한 어휘 안의 뜻과 발음 다대다 연결 */
export const vocabularyMeaningPronunciations = pgTable(
  'vocabulary_meaning_pronunciations',
  {
    vocabularyId: uuid('vocabulary_id').notNull(),
    meaningId: uuid('meaning_id').notNull(),
    pronunciationId: uuid('pronunciation_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'vocabulary_meaning_pronunciations_pk',
      columns: [table.meaningId, table.pronunciationId],
    }),
    foreignKey({
      name: 'vocabulary_meaning_pronunciations_meaning_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'vocabulary_meaning_pronunciations_pronunciation_fk',
      columns: [table.pronunciationId, table.vocabularyId],
      foreignColumns: [
        vocabularyPronunciations.id,
        vocabularyPronunciations.vocabularyId,
      ],
    }).onDelete('restrict'),
  ],
);
```

- [ ] **Step 5: thai-content schema를 구현한다**

```ts
/** 재사용 문장과 불변 버전의 토큰·표현 출현을 저장한다 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mediaAssets } from './media.schema.js';
import {
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
} from './vocabulary.schema.js';

/** 문장 토큰이 문제에서 맡는 역할 */
export const tokenOccurrenceRoleEnum = pgEnum('token_occurrence_role', [
  'TARGET',
  'REQUIRED',
  'SUPPORTING',
]);

/** 여러 문제 버전이 재사용할 문장의 논리 정체성 */
export const thaiSentences = pgTable('thai_sentences', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 실제 표시 내용과 음성을 보존하는 문장 스냅샷 */
export const thaiSentenceVersions = pgTable(
  'thai_sentence_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sentenceId: uuid('sentence_id')
      .references(() => thaiSentences.id, { onDelete: 'restrict' })
      .notNull(),
    version: integer('version').notNull(),
    originalText: text('original_text').notNull(),
    translationKo: text('translation_ko').notNull(),
    pronunciationKo: text('pronunciation_ko').notNull(),
    toneMarks: text('tone_marks').notNull(),
    mediaAssetId: uuid('media_asset_id')
      .references(() => mediaAssets.id, { onDelete: 'restrict' })
      .notNull(),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('thai_sentence_versions_sentence_version_unique').on(
      table.sentenceId,
      table.version,
    ),
    check(
      'thai_sentence_versions_version_positive',
      sql`${table.version} > 0`,
    ),
  ],
);

/** 문장 안 한 번의 토큰 출현과 선택된 공용 뜻·발음 */
export const tokenOccurrences = pgTable(
  'token_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    position: integer('position').notNull(),
    surface: text('surface').notNull(),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    vocabularyId: uuid('vocabulary_id').notNull(),
    meaningId: uuid('meaning_id').notNull(),
    pronunciationId: uuid('pronunciation_id').notNull(),
    contextMeaningKo: text('context_meaning_ko').notNull(),
    role: tokenOccurrenceRoleEnum('role').notNull(),
  },
  (table) => [
    uniqueIndex('token_occurrences_sentence_position_unique').on(
      table.sentenceVersionId,
      table.position,
    ),
    foreignKey({
      name: 'token_occurrences_vocabulary_fk',
      columns: [table.vocabularyId],
      foreignColumns: [vocabularies.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'token_occurrences_meaning_vocabulary_fk',
      columns: [table.meaningId, table.vocabularyId],
      foreignColumns: [vocabularyMeanings.id, vocabularyMeanings.vocabularyId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'token_occurrences_pronunciation_vocabulary_fk',
      columns: [table.pronunciationId, table.vocabularyId],
      foreignColumns: [
        vocabularyPronunciations.id,
        vocabularyPronunciations.vocabularyId,
      ],
    }).onDelete('restrict'),
    check('token_occurrences_position_nonnegative', sql`${table.position} >= 0`),
    check(
      'token_occurrences_offset_range',
      sql`${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset}`,
    ),
  ],
);

/** 여러 토큰에 걸친 공용 표현과 대표 선택 결과 */
export const expressionOccurrences = pgTable(
  'expression_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sentenceVersionId: uuid('sentence_version_id')
      .references(() => thaiSentenceVersions.id, { onDelete: 'restrict' })
      .notNull(),
    startTokenIndex: integer('start_token_index').notNull(),
    endTokenIndex: integer('end_token_index').notNull(),
    vocabularyId: uuid('vocabulary_id')
      .references(() => vocabularies.id, { onDelete: 'restrict' })
      .notNull(),
    representative: boolean('representative').default(false).notNull(),
  },
  (table) => [
    index('expression_occurrences_sentence_idx').on(table.sentenceVersionId),
    check(
      'expression_occurrences_token_range',
      sql`${table.startTokenIndex} >= 0 and ${table.endTokenIndex} > ${table.startTokenIndex}`,
    ),
  ],
);
```

- [ ] **Step 6: schema export와 검증을 통과시킨다**

`backend/database/src/schema/index.ts`에 다음 export를 추가한다.

```ts
/** 변경 불가능한 음성 자산 schema를 공개한다 */
export * from './media.schema.js';

/** 공용 어휘·뜻·발음 schema를 공개한다 */
export * from './vocabulary.schema.js';

/** 태국어 문장 버전·토큰·표현 schema를 공개한다 */
export * from './thai-content.schema.js';
```

Run:

```bash
pnpm exec vitest run backend/database/src/schema/content-foundations.schema.spec.ts backend/database/src/schema/schema.spec.ts
pnpm --filter @flex-thia/database typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 7: 이름이 고정된 additive migration을 생성하고 검사한다**

Run:

```bash
pnpm --filter @flex-thia/database exec drizzle-kit generate --config drizzle.local.config.ts --name content-foundations
rg -n "CREATE TABLE|FOREIGN KEY|normalized_thai|media_assets|thai_sentence_versions" backend/database/drizzle/0003_content-foundations.sql
```

Expected:

- `backend/database/drizzle/0003_content-foundations.sql`과
  `backend/database/drizzle/meta/0003_snapshot.json` 생성
- 기존 테이블의 `DROP TABLE`, `DROP COLUMN`, enum 삭제가 없음
- media, vocabulary, thai-content 테이블과 composite FK가 포함됨

- [ ] **Step 8: database 전체 테스트·typecheck 후 커밋한다**

Run:

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
git diff --check
git add backend/database/src/schema backend/database/drizzle
git commit -m "feat: add content foundation schema"
```

Expected: 테스트와 typecheck가 exit 0이고 additive migration만 커밋됨

---

## Stage 2 전체 검증

Task 4 리뷰 승인 뒤 다음 명령을 새로 실행한다.

```bash
pnpm structure:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git status --short
```

Expected:

- structure, format, lint, typecheck, test, build 모두 exit 0
- `git status --short`에는 관련 없는 사용자 변경이 없음
- 공개 HTTP path 변화가 없으므로 OpenAPI document의 활성 path 집합이 변하지 않음

전체 변경 리뷰는 이 계획의 시작 commit부터 Task 4의 마지막 commit까지
검토하며, Critical/Important 지적을 수정하고 재검토한 뒤 3단계 계획으로
넘어간다.
