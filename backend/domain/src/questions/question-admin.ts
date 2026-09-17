/** 관리자가 현재 문제를 편집하고 공개 상태를 변경한다. */
import { randomUUID } from 'node:crypto';
import type {
  QuestionAdminInput,
  QuestionAdminRecord,
  QuestionAdminRepository,
} from './question-admin.repository.js';
import { assertQuestionContent, nextQuestionVersion } from './question.js';
export class QuestionAdminError extends Error {
  constructor(
    readonly code:
      | 'QUESTION_NOT_FOUND'
      | 'QUESTION_REFERENCE_MISMATCH'
      | 'QUESTION_CONTENT_INVALID'
      | 'QUESTION_VERSION_CONFLICT',
    readonly path?: string,
  ) {
    super(code);
    this.name = 'QuestionAdminError';
  }
}
interface Actor {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
}
const validate = (input: QuestionAdminInput): void => {
  assertQuestionContent(input);
  if (
    !Number.isInteger(input.difficulty) ||
    input.difficulty < 1 ||
    input.difficulty > 5 ||
    input.options.length > 10 ||
    new Set(input.tagIds).size !== input.tagIds.length ||
    new Set(input.vocabularies.map((item) => item.vocabularyId)).size !==
      input.vocabularies.length ||
    input.vocabularies.some(
      (item) =>
        !Number.isSafeInteger(item.occurrenceCount) ||
        item.occurrenceCount < 1 ||
        !['TARGET', 'CONTEXT'].includes(item.role),
    )
  ) {
    throw new QuestionAdminError('QUESTION_CONTENT_INVALID');
  }
};
export class QuestionAdminService {
  constructor(
    private readonly repository: QuestionAdminRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}
  async create(
    command: Actor & { input: QuestionAdminInput },
  ): Promise<QuestionAdminRecord> {
    validate(command.input);
    return this.repository.runInTransaction(async (transaction) => {
      if (!(await transaction.validateReferences(command.input)))
        throw new QuestionAdminError('QUESTION_REFERENCE_MISMATCH');
      const record: QuestionAdminRecord = {
        ...command.input,
        id: this.generateId(),
        version: 1,
        status: 'DRAFT',
        createdAt: command.occurredAt,
        updatedAt: command.occurredAt,
        publishedAt: null,
      };
      await transaction.saveQuestion(record);
      await transaction.appendAuditLog({
        ...command,
        action: 'QUESTION_CREATED',
        targetId: record.id,
        summary: { version: record.version },
      });
      return record;
    });
  }
  async update(
    command: Actor & {
      questionId: string;
      input: QuestionAdminInput;
      expectedVersion: number;
      expectedUpdatedAt: Date;
      requiresRetry: boolean;
    },
  ): Promise<QuestionAdminRecord> {
    validate(command.input);
    return this.repository.runInTransaction(async (transaction) => {
      const current = await transaction.loadQuestion(command.questionId);
      if (!current) throw new QuestionAdminError('QUESTION_NOT_FOUND');
      if (current.updatedAt.getTime() !== command.expectedUpdatedAt.getTime())
        throw new QuestionAdminError('QUESTION_VERSION_CONFLICT');
      if (!(await transaction.validateReferences(command.input)))
        throw new QuestionAdminError('QUESTION_REFERENCE_MISMATCH');
      // 정답 변경은 단순 오탈자 수정으로 처리할 수 없다.
      const requiresRetry =
        command.requiresRetry ||
        current.correctOptionId !== command.input.correctOptionId;
      const record = {
        ...current,
        ...command.input,
        version: nextQuestionVersion(
          current.version,
          command.expectedVersion,
          requiresRetry,
        ),
        updatedAt: new Date(
          Math.max(
            command.occurredAt.getTime(),
            current.updatedAt.getTime() + 1,
          ),
        ),
      };
      await transaction.saveQuestion(record);
      await transaction.appendAuditLog({
        ...command,
        action: 'QUESTION_UPDATED',
        targetId: record.id,
        summary: { version: record.version, requiresRetry },
      });
      return record;
    });
  }
  async changeStatus(
    command: Actor & {
      questionId: string;
      status: QuestionAdminRecord['status'];
      expectedUpdatedAt: Date;
    },
  ): Promise<void> {
    return this.repository.runInTransaction(async (transaction) => {
      const current = await transaction.loadQuestion(command.questionId);
      if (!current) throw new QuestionAdminError('QUESTION_NOT_FOUND');
      if (current.updatedAt.getTime() !== command.expectedUpdatedAt.getTime())
        throw new QuestionAdminError('QUESTION_VERSION_CONFLICT');
      if (command.status === 'PUBLISHED') {
        validate(current);
        if (!(await transaction.validateReferences(current)))
          throw new QuestionAdminError('QUESTION_REFERENCE_MISMATCH');
      }
      await transaction.saveQuestion({
        ...current,
        status: command.status,
        updatedAt: new Date(
          Math.max(
            command.occurredAt.getTime(),
            current.updatedAt.getTime() + 1,
          ),
        ),
        publishedAt:
          command.status === 'PUBLISHED'
            ? (current.publishedAt ?? command.occurredAt)
            : current.publishedAt,
      });
      await transaction.appendAuditLog({
        ...command,
        action: 'QUESTION_STATUS_CHANGED',
        targetId: current.id,
        summary: { status: command.status },
      });
    });
  }
}
