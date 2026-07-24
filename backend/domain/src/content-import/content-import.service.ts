/** canonical request hash와 항목별 독립 transaction을 조율해 동기 가져오기를 완료한다 */
import { createHash, randomUUID } from 'node:crypto';
import type { ContentDraftService } from './content-draft.js';
import { ContentDraftError } from './content-draft.js';
import type {
  CanonicalDraftQuestionInput,
  CanonicalDraftVocabularyInput,
  ContentDraftAuditContext,
} from './content-import.js';
import type {
  ContentImportDetail,
  ContentImportRepository,
  ContentImportStoredItem,
} from './content-import.repository.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type JsonPrimitive = boolean | null | number | string;
type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };

/** domain orchestration이 소비하는 검증 완료 schemaVersion 1 요청 */
export interface ContentImportRequest {
  schemaVersion: 1;
  vocabularies: CanonicalDraftVocabularyInput[];
  questions: CanonicalDraftQuestionInput[];
}

/** 관리자 요청자·멱등 key·audit 문맥을 canonical body와 묶는다 */
export interface ContentImportCommand {
  requestedBy: string;
  idempotencyKey: string;
  request: ContentImportRequest;
  context: ContentDraftAuditContext;
}

/** 같은 user/key에 다른 canonical body가 들어온 충돌을 stable code로 전달한다 */
export class ContentImportError extends Error {
  constructor(readonly code: 'CONTENT_IMPORT_IDEMPOTENCY_CONFLICT') {
    super(code);
    this.name = 'ContentImportError';
  }
}

type DraftCreator = Pick<
  ContentDraftService,
  'createQuestionItem' | 'createVocabularyItem'
>;

const canonicalJson = (value: JsonValue): string => {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('CONTENT_IMPORT_REQUEST_NOT_JSON');
    }
    return serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`);
  return `{${entries.join(',')}}`;
};

/** 객체 key는 정렬하고 배열 순서는 보존한 deterministic SHA-256을 계산한다 */
export const hashContentImportRequest = (
  request: ContentImportRequest,
): string =>
  createHash('sha256')
    .update(canonicalJson(request as unknown as JsonValue))
    .digest('hex');

const isContentDraftItemConflict = (
  error: unknown,
): error is { code: 'CONTENT_DRAFT_ITEM_CONFLICT' } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'CONTENT_DRAFT_ITEM_CONFLICT';

/** 같은 요청은 완료 결과를 replay하고 미완료 unique item만 순차 재개한다 */
export class ContentImportService {
  constructor(
    private readonly repository: ContentImportRepository,
    private readonly drafts: DraftCreator,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private newImportId(): string {
    const id = this.generateId();
    if (!UUID_PATTERN.test(id)) {
      throw new TypeError('CONTENT_IMPORT_GENERATED_ID_INVALID');
    }
    return id;
  }

  private async requireDetail(importId: string): Promise<ContentImportDetail> {
    const detail = await this.repository.findDetail(importId);
    if (!detail) {
      throw new Error('CONTENT_IMPORT_RESULT_MISSING');
    }
    return detail;
  }

  private async replayItemConflict(
    importId: string,
    kind: ContentImportStoredItem['kind'],
    sourceIndex: number,
    conflict: unknown,
  ): Promise<void> {
    const item = await this.repository.findItem(importId, kind, sourceIndex);
    if (!item) {
      throw conflict;
    }
  }

  private async processVocabulary(
    importId: string,
    sourceIndex: number,
    input: CanonicalDraftVocabularyInput,
    context: ContentDraftAuditContext,
  ): Promise<void> {
    if (await this.repository.findItem(importId, 'VOCABULARY', sourceIndex)) {
      return;
    }
    try {
      await this.drafts.createVocabularyItem({
        importId,
        sourceIndex,
        input,
        context,
      });
    } catch (error) {
      if (error instanceof ContentDraftError) {
        await this.repository.saveRejectedItem({
          importId,
          kind: 'VOCABULARY',
          sourceIndex,
          clientRef: input.clientRef,
          errors: [
            {
              path: error.path,
              code: error.code,
            },
          ],
        });
        return;
      }
      if (isContentDraftItemConflict(error)) {
        await this.replayItemConflict(
          importId,
          'VOCABULARY',
          sourceIndex,
          error,
        );
        return;
      }
      throw error;
    }
  }

  private async processQuestion(
    importId: string,
    sourceIndex: number,
    input: CanonicalDraftQuestionInput,
    context: ContentDraftAuditContext,
  ): Promise<void> {
    if (await this.repository.findItem(importId, 'QUESTION', sourceIndex)) {
      return;
    }
    try {
      await this.drafts.createQuestionItem({
        importId,
        sourceIndex,
        input,
        context,
      });
    } catch (error) {
      if (error instanceof ContentDraftError) {
        await this.repository.saveRejectedItem({
          importId,
          kind: 'QUESTION',
          sourceIndex,
          clientRef: input.clientRef,
          errors: [
            {
              path: error.path,
              code: error.code,
            },
          ],
        });
        return;
      }
      if (isContentDraftItemConflict(error)) {
        await this.replayItemConflict(importId, 'QUESTION', sourceIndex, error);
        return;
      }
      throw error;
    }
  }

  /** 어휘 전체를 먼저 처리한 뒤 문제를 처리하고 최초 완료만 audit과 commit한다 */
  async execute(command: ContentImportCommand): Promise<ContentImportDetail> {
    const requestHash = hashContentImportRequest(command.request);
    const record = await this.repository.claim({
      id: this.newImportId(),
      requestedBy: command.requestedBy,
      idempotencyKey: command.idempotencyKey,
      requestHash,
      vocabularyCount: command.request.vocabularies.length,
      questionCount: command.request.questions.length,
      createdAt: this.now(),
    });
    if (record.requestHash !== requestHash) {
      throw new ContentImportError('CONTENT_IMPORT_IDEMPOTENCY_CONFLICT');
    }
    if (record.status !== null) {
      return this.requireDetail(record.id);
    }

    for (const [sourceIndex, input] of command.request.vocabularies.entries()) {
      await this.processVocabulary(
        record.id,
        sourceIndex,
        input,
        command.context,
      );
    }
    for (const [sourceIndex, input] of command.request.questions.entries()) {
      await this.processQuestion(
        record.id,
        sourceIndex,
        input,
        command.context,
      );
    }
    await this.repository.complete({
      importId: record.id,
      completedAt: this.now(),
      context: command.context,
    });
    return this.requireDetail(record.id);
  }
}
