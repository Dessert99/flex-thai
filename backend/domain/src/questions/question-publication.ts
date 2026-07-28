/** 문제 버전 게시·무효화와 문제 노출 상태를 한 transaction으로 전이한다 */
import { assertContentTtsReady } from '../media/tts-job.js';
import {
  type QuestionPublicationRepository,
  type QuestionPublicationTransaction,
  type QuestionRecord,
  type QuestionVersionRecord,
} from './question-publication.repository.js';
import {
  validateQuestionVersion,
  type QuestionValidationReport,
} from './question-version.js';

/** 문제 게시 수명 위반을 호출자가 안정적으로 분기할 code로 전달한다 */
export type QuestionPublicationErrorCode =
  | 'QUESTION_NOT_FOUND'
  | 'QUESTION_VERSION_NOT_FOUND'
  | 'QUESTION_VERSION_MISMATCH'
  | 'IMMUTABLE_VERSION'
  | 'QUESTION_VERSION_NOT_PUBLISHABLE'
  | 'QUESTION_STATE_CONFLICT'
  | 'QUESTION_RESTORE_NOT_ALLOWED';

/** 문제 게시 수명 위반을 안정적인 code로 전달한다 */
export class QuestionPublicationError extends Error {
  constructor(readonly code: QuestionPublicationErrorCode) {
    super(code);
    this.name = 'QuestionPublicationError';
  }
}

/** 감사 기록을 남기는 게시 수명 명령의 공통 요청 문맥이다 */
export interface QuestionPublicationCommandContext {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  occurredAt: Date;
}

/** 최신 참조 상태 검증과 감사에 필요한 버전을 지정한다 */
export interface ValidateQuestionVersionCommand extends QuestionPublicationCommandContext {
  versionId: string;
}

/** 초안 버전을 게시할 문제와 버전을 지정한다 */
export interface PublishQuestionVersionCommand extends QuestionPublicationCommandContext {
  questionId: string;
  versionId: string;
}

/** 현재 게시 버전을 무효화할 문제와 버전을 지정한다 */
export interface InvalidateQuestionVersionCommand extends QuestionPublicationCommandContext {
  questionId: string;
  versionId: string;
}

/** 문제 자체의 공개 상태를 변경할 대상을 지정한다 */
export interface QuestionVisibilityCommand extends QuestionPublicationCommandContext {
  questionId: string;
}

const assertQuestion = (question: QuestionRecord | null): QuestionRecord => {
  if (!question) {
    throw new QuestionPublicationError('QUESTION_NOT_FOUND');
  }
  return question;
};

const assertVersion = (
  version: QuestionVersionRecord | null,
): QuestionVersionRecord => {
  if (!version) {
    throw new QuestionPublicationError('QUESTION_VERSION_NOT_FOUND');
  }
  return version;
};

const assertVersionBelongsToQuestion = (
  question: QuestionRecord,
  version: QuestionVersionRecord,
): void => {
  if (version.questionId !== question.id) {
    throw new QuestionPublicationError('QUESTION_VERSION_MISMATCH');
  }
};

const validateInTransaction = async (
  transaction: QuestionPublicationTransaction,
  versionId: string,
  occurredAt: Date,
): Promise<QuestionValidationReport> => {
  const candidate = await transaction.loadValidationCandidate(versionId);
  if (!candidate) {
    throw new QuestionPublicationError('QUESTION_VERSION_NOT_FOUND');
  }
  const report = validateQuestionVersion(candidate);
  await transaction.saveValidation(versionId, report, occurredAt);
  return report;
};

/** 문제 버전 게시와 문제 노출 상태 전이를 수행한다 */
export class QuestionPublicationService {
  constructor(private readonly repository: QuestionPublicationRepository) {}

  /** DRAFT만 최신 참조 상태로 검증하고 결과를 저장한다 */
  async validateVersion(
    command: ValidateQuestionVersionCommand,
  ): Promise<QuestionValidationReport> {
    return this.repository.runInTransaction(async (transaction) => {
      const version = assertVersion(
        await transaction.loadVersion(command.versionId),
      );
      if (version.status !== 'DRAFT') {
        throw new QuestionPublicationError('IMMUTABLE_VERSION');
      }
      const report = await validateInTransaction(
        transaction,
        command.versionId,
        command.occurredAt,
      );
      await transaction.appendAuditLog({
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        action: 'QUESTION_VERSION_VALIDATED',
        targetType: 'QUESTION_VERSION',
        targetId: command.versionId,
        summary: {
          status: report.status,
          issueCount: report.issues.length,
        },
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
      return report;
    });
  }

  /** 초안 버전을 게시하고 참조 문장과 현재 버전을 함께 동결한다 */
  async publishVersion(command: PublishQuestionVersionCommand): Promise<void> {
    await this.repository.runInTransaction(
      async (transaction): Promise<void> => {
        const question = assertQuestion(
          await transaction.loadQuestion(command.questionId),
        );
        const version = assertVersion(
          await transaction.loadVersion(command.versionId),
        );
        assertVersionBelongsToQuestion(question, version);
        if (question.status !== 'DRAFT' && question.status !== 'PUBLISHED') {
          throw new QuestionPublicationError('QUESTION_STATE_CONFLICT');
        }
        if (version.status !== 'DRAFT') {
          throw new QuestionPublicationError('IMMUTABLE_VERSION');
        }

        assertContentTtsReady(
          await transaction.listRequiredTargets({
            questionId: question.id,
            versionId: version.id,
          }),
        );
        const report = await validateInTransaction(
          transaction,
          version.id,
          command.occurredAt,
        );
        // 게시용 검증 실패는 transaction 안에서 던져 저장한 검증 결과도 되돌린다.
        if (report.status === 'FAILED') {
          throw new QuestionPublicationError(
            'QUESTION_VERSION_NOT_PUBLISHABLE',
          );
        }
        if (
          question.currentPublishedVersionId &&
          question.currentPublishedVersionId !== version.id
        ) {
          const currentVersion = assertVersion(
            await transaction.loadVersion(question.currentPublishedVersionId),
          );
          assertVersionBelongsToQuestion(question, currentVersion);
          if (currentVersion.status !== 'PUBLISHED') {
            throw new QuestionPublicationError('QUESTION_STATE_CONFLICT');
          }
          await transaction.retireVersion(currentVersion.id, question.id);
        }
        await transaction.publishVersion(version.id, command.occurredAt);
        await transaction.setCurrentPublishedVersion(question.id, version.id);
        await transaction.freezeReferencedSentences(
          version.id,
          command.occurredAt,
        );
        await transaction.appendAuditLog({
          actorSub: command.actorSub,
          actorUserId: command.actorUserId,
          action: 'QUESTION_VERSION_PUBLISHED',
          targetType: 'QUESTION_VERSION',
          targetId: version.id,
          summary: { questionId: question.id },
          requestId: command.requestId,
          occurredAt: command.occurredAt,
        });
      },
    );
  }

  /** 현재 게시 버전을 무효화하고 노출 중인 문제를 함께 숨긴다 */
  async invalidateVersion(
    command: InvalidateQuestionVersionCommand,
  ): Promise<void> {
    await this.repository.runInTransaction(async (transaction) => {
      const question = assertQuestion(
        await transaction.loadQuestion(command.questionId),
      );
      const version = assertVersion(
        await transaction.loadVersion(command.versionId),
      );
      assertVersionBelongsToQuestion(question, version);
      if (
        (question.status !== 'PUBLISHED' && question.status !== 'HIDDEN') ||
        question.currentPublishedVersionId !== version.id ||
        version.status !== 'PUBLISHED'
      ) {
        throw new QuestionPublicationError('QUESTION_STATE_CONFLICT');
      }

      await transaction.invalidateVersion(version.id);
      if (question.status === 'PUBLISHED') {
        await transaction.hideQuestion(question.id);
      }
      await transaction.appendAuditLog({
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        action: 'QUESTION_VERSION_INVALIDATED',
        targetType: 'QUESTION_VERSION',
        targetId: version.id,
        summary: { questionId: question.id },
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
    });
  }

  /** 게시 중인 문제만 참조 보존 상태로 숨긴다 */
  async hideQuestion(command: QuestionVisibilityCommand): Promise<void> {
    await this.repository.runInTransaction(async (transaction) => {
      const question = assertQuestion(
        await transaction.loadQuestion(command.questionId),
      );
      if (question.status !== 'PUBLISHED') {
        throw new QuestionPublicationError('QUESTION_STATE_CONFLICT');
      }
      await transaction.hideQuestion(question.id);
      await transaction.appendAuditLog({
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        action: 'QUESTION_HIDDEN',
        targetType: 'QUESTION',
        targetId: question.id,
        summary: {},
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
    });
  }

  /** 현재 게시 버전이 유효한 숨긴 문제만 다시 공개한다 */
  async restoreQuestion(command: QuestionVisibilityCommand): Promise<void> {
    await this.repository.runInTransaction(async (transaction) => {
      const question = assertQuestion(
        await transaction.loadQuestion(command.questionId),
      );
      if (question.status !== 'HIDDEN' || !question.currentPublishedVersionId) {
        throw new QuestionPublicationError('QUESTION_RESTORE_NOT_ALLOWED');
      }
      const version = assertVersion(
        await transaction.loadVersion(question.currentPublishedVersionId),
      );
      assertVersionBelongsToQuestion(question, version);
      if (version.status !== 'PUBLISHED') {
        throw new QuestionPublicationError('QUESTION_RESTORE_NOT_ALLOWED');
      }
      await transaction.restoreQuestion(question.id);
      await transaction.appendAuditLog({
        actorSub: command.actorSub,
        actorUserId: command.actorUserId,
        action: 'QUESTION_RESTORED',
        targetType: 'QUESTION',
        targetId: question.id,
        summary: { currentPublishedVersionId: version.id },
        requestId: command.requestId,
        occurredAt: command.occurredAt,
      });
    });
  }
}
