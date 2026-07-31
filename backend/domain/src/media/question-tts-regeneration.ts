/** 문제 버전 TTS 재생성의 소유권·멱등·동시 실행 결정을 정의한다 */

/** 문제 버전 TTS 재생성의 공개 결과 */
export interface QuestionTtsRegenerationResult {
  jobIds: string[];
  scheduledSentenceCount: number;
  reusedReadySentenceCount: number;
}

/** 문제 버전 TTS 재생성이 안정적으로 노출하는 실패 code */
export type QuestionTtsRegenerationErrorCode =
  | 'QUESTION_TTS_VERSION_NOT_FOUND'
  | 'QUESTION_TTS_IMMUTABLE_VERSION'
  | 'QUESTION_TTS_ALREADY_RUNNING'
  | 'QUESTION_TTS_IDEMPOTENCY_CONFLICT';

/** 문제 버전 TTS 재생성 실패를 API가 안정적으로 분기하게 한다 */
export class QuestionTtsRegenerationError extends Error {
  constructor(readonly code: QuestionTtsRegenerationErrorCode) {
    super(code);
    this.name = 'QuestionTtsRegenerationError';
  }
}

interface QuestionTtsRegenerationActor {
  actorUserId: string;
  actorSub: string;
  requestId: string;
}

interface QuestionTtsRegenerationReplay extends QuestionTtsRegenerationActor {
  questionId: string;
  versionId: string;
  result: QuestionTtsRegenerationResult;
}

/** 저장 상태에서 replay 또는 새 schedule만 허용한다 */
export const decideQuestionTtsRegeneration = (input: {
  questionId: string;
  versionId: string;
  actor: QuestionTtsRegenerationActor;
  version: {
    id: string;
    questionId: string;
    status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED';
  } | null;
  replay: QuestionTtsRegenerationReplay | null;
  activeJobIds: string[];
}):
  | { kind: 'REPLAY'; result: QuestionTtsRegenerationResult }
  | { kind: 'SCHEDULE' } => {
  if (
    input.version === null ||
    input.version.id !== input.versionId ||
    input.version.questionId !== input.questionId
  ) {
    throw new QuestionTtsRegenerationError('QUESTION_TTS_VERSION_NOT_FOUND');
  }
  if (input.version.status !== 'DRAFT') {
    throw new QuestionTtsRegenerationError('QUESTION_TTS_IMMUTABLE_VERSION');
  }
  if (input.replay !== null) {
    const exact =
      input.replay.questionId === input.questionId &&
      input.replay.versionId === input.versionId &&
      input.replay.actorUserId === input.actor.actorUserId &&
      input.replay.actorSub === input.actor.actorSub &&
      input.replay.requestId === input.actor.requestId;
    if (!exact) {
      throw new QuestionTtsRegenerationError(
        'QUESTION_TTS_IDEMPOTENCY_CONFLICT',
      );
    }
    return { kind: 'REPLAY', result: input.replay.result };
  }
  if (input.activeJobIds.length > 0) {
    throw new QuestionTtsRegenerationError('QUESTION_TTS_ALREADY_RUNNING');
  }
  return { kind: 'SCHEDULE' };
};
