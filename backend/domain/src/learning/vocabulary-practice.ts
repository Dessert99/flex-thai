/** 단어 연습 source를 meaning 단위 문항으로 고정하고 답안 상태를 조정한다 */
import type {
  AnswerVocabularyPracticeInput,
  CreateVocabularyPracticeInput,
  MaterializedPracticeOption,
  MaterializedPracticeQuestion,
  MaterializedPracticeSession,
  PracticeAnswerRecord,
  PracticeMeaningCandidate,
  PracticeMode,
  PracticeSessionRecord,
  VocabularyPracticeRepository,
} from './vocabulary-practice.repository.js';

/** 전달 계층이 안정적으로 변환할 단어 연습 오류 code */
export type VocabularyPracticeDomainErrorCode =
  | 'PRACTICE_SOURCE_NOT_FOUND'
  | 'PRACTICE_SOURCE_INSUFFICIENT'
  | 'PRACTICE_SESSION_NOT_FOUND'
  | 'PRACTICE_OPTION_INVALID'
  | 'PRACTICE_SESSION_COMPLETED'
  | 'PRACTICE_QUESTION_ALREADY_ANSWERED'
  | 'PRACTICE_ANSWER_IDEMPOTENCY_CONFLICT';

/** 단어 연습 생성·조회·답안의 안정적인 업무 오류 */
export class VocabularyPracticeDomainError extends Error {
  constructor(readonly code: VocabularyPracticeDomainErrorCode) {
    super(code);
    this.name = 'VocabularyPracticeDomainError';
  }
}

/** 결정적 문항 생성에 필요한 저장소·ID·시각·shuffle 의존성 */
export interface VocabularyPracticeDependencies {
  repository: VocabularyPracticeRepository;
  createId: () => string;
  now: () => Date;
  shuffle: <T>(items: readonly T[]) => T[];
}

/** 답 제출 직후 내부 계층에 반환하는 feedback */
export interface PracticeAnswerFeedback {
  answer: PracticeAnswerRecord;
  correctOptionId: string;
  card: MaterializedPracticeQuestion['card'];
  sessionCompleted: boolean;
}

interface AssignedCandidate {
  candidate: PracticeMeaningCandidate;
  mode: PracticeMode;
}

const isAudioMode = (mode: PracticeMode): boolean =>
  mode === 'AUDIO_TO_THAI' || mode === 'AUDIO_TO_MEANING';

const answerLabel = (
  mode: PracticeMode,
  candidate: PracticeMeaningCandidate,
): string =>
  mode === 'THAI_TO_MEANING' || mode === 'AUDIO_TO_MEANING'
    ? candidate.meaningKo
    : candidate.thai;

const promptFor = (
  mode: PracticeMode,
  candidate: PracticeMeaningCandidate,
): MaterializedPracticeQuestion['prompt'] => {
  if (isAudioMode(mode)) {
    const pronunciation = candidate.pronunciations[0];
    if (!pronunciation) {
      throw new VocabularyPracticeDomainError('PRACTICE_SOURCE_INSUFFICIENT');
    }
    return { type: 'AUDIO', storageKey: pronunciation.storageKey };
  }
  return {
    type: 'TEXT',
    text: mode === 'THAI_TO_MEANING' ? candidate.thai : candidate.meaningKo,
  };
};

const assignCandidates = (
  candidates: PracticeMeaningCandidate[],
  modes: PracticeMode[],
): AssignedCandidate[] => {
  const assigned: AssignedCandidate[] = [];
  let modeCursor = 0;

  for (const candidate of candidates) {
    const modeOffset = modes.findIndex(
      (mode, index) =>
        index >= modeCursor &&
        (!isAudioMode(mode) || candidate.pronunciations.length > 0),
    );
    const wrappedOffset =
      modeOffset >= 0
        ? modeOffset
        : modes.findIndex(
            (mode) => !isAudioMode(mode) || candidate.pronunciations.length > 0,
          );
    if (wrappedOffset < 0) continue;
    const mode = modes[wrappedOffset];
    if (!mode) continue;
    assigned.push({ candidate, mode });
    modeCursor = (wrappedOffset + 1) % modes.length;
  }

  return assigned;
};

/** source 검증·문항 materialize·세션 조회·답안 제출을 제공한다 */
export class VocabularyPracticeService {
  private readonly repository: VocabularyPracticeRepository;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly shuffle: VocabularyPracticeDependencies['shuffle'];

  constructor(dependencies: VocabularyPracticeDependencies) {
    this.repository = dependencies.repository;
    this.createId = dependencies.createId;
    this.now = dependencies.now;
    this.shuffle = dependencies.shuffle;
  }

  /** 검증된 source를 snapshot 문항과 함께 한 번에 저장한다 */
  async create(
    input: CreateVocabularyPracticeInput,
  ): Promise<PracticeSessionRecord> {
    const source = await this.repository.loadSource(input);
    if (!source) {
      throw new VocabularyPracticeDomainError('PRACTICE_SOURCE_NOT_FOUND');
    }

    const sourceCandidates =
      input.order === 'RANDOM'
        ? this.shuffle(source.candidates)
        : [...source.candidates];
    const assignments = assignCandidates(
      sourceCandidates.slice(0, 100),
      input.modes,
    );
    const requestedCount =
      input.questionCount === 'ALL' ? assignments.length : input.questionCount;
    if (requestedCount === 0 || assignments.length < requestedCount) {
      throw new VocabularyPracticeDomainError('PRACTICE_SOURCE_INSUFFICIENT');
    }

    const sessionId = this.createId();
    const selectedAssignments = assignments.slice(0, requestedCount);
    const questions = selectedAssignments.map((assignment, index) =>
      this.materializeQuestion(
        sessionId,
        index + 1,
        assignment,
        sourceCandidates,
      ),
    );
    const session: MaterializedPracticeSession = {
      id: sessionId,
      userId: input.userId,
      sourceType: input.source.type,
      sourceWordbookId:
        input.source.type === 'WORDBOOK' ? input.source.wordbookId : null,
      sourceLabel: source.label,
      modes: [...input.modes],
      requestedQuestionCount:
        input.questionCount === 'ALL' ? null : input.questionCount,
      order: input.order,
      questionCount: questions.length,
      startedAt: this.now(),
      questions,
    };
    return this.repository.createSession(session);
  }

  /** 현재 사용자의 materialized 세션만 조회한다 */
  async get(userId: string, sessionId: string): Promise<PracticeSessionRecord> {
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) {
      throw new VocabularyPracticeDomainError('PRACTICE_SESSION_NOT_FOUND');
    }
    return session;
  }

  /** repository의 원자적 답안 상태를 즉시 feedback 또는 업무 오류로 바꾼다 */
  async answer(
    input: AnswerVocabularyPracticeInput,
  ): Promise<PracticeAnswerFeedback> {
    const result = await this.repository.submitAnswer({
      ...input,
      answeredAt: this.now(),
    });
    if (result.status === 'NOT_FOUND') {
      throw new VocabularyPracticeDomainError('PRACTICE_SESSION_NOT_FOUND');
    }
    if (result.status === 'INVALID_OPTION') {
      throw new VocabularyPracticeDomainError('PRACTICE_OPTION_INVALID');
    }
    if (result.status === 'COMPLETED') {
      throw new VocabularyPracticeDomainError('PRACTICE_SESSION_COMPLETED');
    }
    if (result.status === 'ALREADY_ANSWERED') {
      throw new VocabularyPracticeDomainError(
        'PRACTICE_QUESTION_ALREADY_ANSWERED',
      );
    }
    if (result.status === 'IDEMPOTENCY_CONFLICT') {
      throw new VocabularyPracticeDomainError(
        'PRACTICE_ANSWER_IDEMPOTENCY_CONFLICT',
      );
    }
    return {
      answer: result.answer,
      correctOptionId: result.question.correctOptionId,
      card: result.question.card,
      sessionCompleted: result.sessionCompleted,
    };
  }

  private materializeQuestion(
    sessionId: string,
    position: number,
    assignment: AssignedCandidate,
    candidates: PracticeMeaningCandidate[],
  ): MaterializedPracticeQuestion {
    const { candidate, mode } = assignment;
    const correctLabel = answerLabel(mode, candidate);
    const distractorLabels = [
      ...new Set(
        candidates
          .filter(
            (other) =>
              other.vocabularyId !== candidate.vocabularyId ||
              other.meaningId !== candidate.meaningId,
          )
          .map((other) => answerLabel(mode, other))
          .filter((label) => label !== correctLabel),
      ),
    ].slice(0, 3);
    if (distractorLabels.length < 3) {
      throw new VocabularyPracticeDomainError('PRACTICE_SOURCE_INSUFFICIENT');
    }

    const correctOption: MaterializedPracticeOption = {
      id: this.createId(),
      label: correctLabel,
    };
    const options = [
      correctOption,
      ...distractorLabels.map((label) => ({ id: this.createId(), label })),
    ];
    const shuffledOptions = this.shuffle(options);
    const pronunciation = isAudioMode(mode)
      ? (candidate.pronunciations[0] ?? null)
      : null;

    return {
      id: this.createId(),
      sessionId,
      position,
      vocabularyId: candidate.vocabularyId,
      meaningId: candidate.meaningId,
      pronunciationId: pronunciation?.id ?? null,
      mediaAssetId: pronunciation?.mediaAssetId ?? null,
      mode,
      prompt: promptFor(mode, candidate),
      options: shuffledOptions,
      correctOptionId: correctOption.id,
      card: candidate.card,
    };
  }
}
