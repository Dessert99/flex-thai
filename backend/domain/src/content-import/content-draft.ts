/** canonical 입력을 current 참조로 해석해 어휘·문제 초안을 원자 저장한다 */
import { randomUUID } from 'node:crypto';

import {
  createVocabularyDraft,
  VocabularyDomainError,
} from '../vocabulary/vocabulary.js';
import type {
  ContentDraftRepository,
  ResolvedContentDraftAudit,
  ResolvedContentImportItem,
  ResolvedVocabularyDraftGraph,
} from './content-draft.repository.js';
import type {
  CanonicalDraftVocabularyInput,
  ContentDraftAuditContext,
  ContentDraftItemResult,
} from './content-import.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** 콘텐츠 초안 생성 실패를 호출자가 항목 오류로 저장할 stable code로 전달한다 */
export class ContentDraftError extends Error {
  constructor(
    readonly code:
      | 'IMPORT_REFERENCE_NOT_FOUND'
      | 'IMPORT_REFERENCE_MISMATCH'
      | 'IMPORT_DUPLICATE_VOCABULARY'
      | 'IMPORT_CONTENT_INVALID',
    readonly path: string,
  ) {
    super(code);
    this.name = 'ContentDraftError';
  }
}

/** vocabulary import item 하나의 위치·입력·audit 문맥 */
export interface CreateVocabularyDraftCommand {
  importId: string;
  sourceIndex: number;
  input: CanonicalDraftVocabularyInput;
  context: ContentDraftAuditContext;
}

const assertNonnegativeSourceIndex = (sourceIndex: number): void => {
  if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'sourceIndex');
  }
};

const assertUniqueNonemptyRefs = (
  refs: readonly string[],
  path: string,
): void => {
  if (
    refs.some((ref) => ref.length === 0) ||
    new Set(refs).size !== refs.length
  ) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', path);
  }
};

const createIdFactory = (generateId: () => string) => (): string => {
  const id = generateId();
  if (!UUID_PATTERN.test(id)) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'generatedId');
  }
  return id;
};

const createItem = (input: {
  id: string;
  importId: string;
  kind: ResolvedContentImportItem['kind'];
  sourceIndex: number;
  clientRef: string;
  targetId: string;
  referenceMap: Record<string, string>;
}): ResolvedContentImportItem => ({
  ...input,
  status: 'IMPORTED',
  errors: [],
});

const createAudit = (
  context: ContentDraftAuditContext,
  input: {
    action: ResolvedContentDraftAudit['action'];
    targetType: ResolvedContentDraftAudit['targetType'];
    targetId: string;
    importId: string;
    sourceIndex: number;
  },
): ResolvedContentDraftAudit => ({
  ...context,
  action: input.action,
  targetType: input.targetType,
  targetId: input.targetId,
  summary: {
    importId: input.importId,
    sourceIndex: input.sourceIndex,
  },
});

const assertVocabularyInput = (input: CanonicalDraftVocabularyInput): void => {
  if (input.meanings.length === 0) {
    throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'meanings');
  }
  assertUniqueNonemptyRefs(
    [input.clientRef, ...input.meanings.map(({ clientRef }) => clientRef)],
    'meanings',
  );
};

/** 어휘와 문제 import item을 독립 transaction으로 canonical DRAFT에 저장한다 */
export class ContentDraftService {
  private readonly newId: () => string;

  constructor(
    private readonly repository: ContentDraftRepository,
    generateId: () => string = randomUUID,
  ) {
    this.newId = createIdFactory(generateId);
  }

  async createVocabularyItem(
    command: CreateVocabularyDraftCommand,
  ): Promise<ContentDraftItemResult> {
    assertNonnegativeSourceIndex(command.sourceIndex);
    assertVocabularyInput(command.input);
    const vocabularyId = this.newId();
    let vocabulary;
    try {
      vocabulary = createVocabularyDraft({
        id: vocabularyId,
        thai: command.input.thai,
        kind: command.input.kind,
      });
    } catch (error) {
      if (error instanceof VocabularyDomainError) {
        throw new ContentDraftError('IMPORT_CONTENT_INVALID', 'thai');
      }
      throw error;
    }

    return this.repository.runInTransaction(async (transaction) => {
      if (
        await transaction.findVocabularyByNormalizedThai(
          vocabulary.normalizedThai,
        )
      ) {
        throw new ContentDraftError('IMPORT_DUPLICATE_VOCABULARY', 'thai');
      }

      const meanings = command.input.meanings.map((meaning) => ({
        id: this.newId(),
        vocabularyId,
        meaningKo: meaning.meaningKo,
        partOfSpeech: meaning.partOfSpeech,
        difficulty: meaning.difficulty ?? null,
        contextNote: meaning.contextNote ?? null,
      }));
      const graph: ResolvedVocabularyDraftGraph = {
        vocabulary,
        meanings,
      };
      // Object.fromEntries는 __proto__도 setter가 아닌 own data property로 만든다.
      const referenceMap = Object.fromEntries([
        [command.input.clientRef, vocabularyId],
        ...command.input.meanings.map(
          (meaning, index) => [meaning.clientRef, meanings[index]!.id] as const,
        ),
      ]);
      await transaction.saveVocabularyDraft({
        graph,
        item: createItem({
          id: this.newId(),
          importId: command.importId,
          kind: 'VOCABULARY',
          sourceIndex: command.sourceIndex,
          clientRef: command.input.clientRef,
          targetId: vocabularyId,
          referenceMap,
        }),
        audit: createAudit(command.context, {
          action: 'CONTENT_VOCABULARY_DRAFT_IMPORTED',
          targetType: 'VOCABULARY',
          targetId: vocabularyId,
          importId: command.importId,
          sourceIndex: command.sourceIndex,
        }),
      });
      return { targetId: vocabularyId, referenceMap };
    });
  }
}
