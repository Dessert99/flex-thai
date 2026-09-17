/** MVP 문제 콘텐츠와 수정 버전, 공개·채점 경계를 정의한다. */
export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionVocabulary {
  vocabularyId: string;
  meaningId: string | null;
  role: 'TARGET' | 'CONTEXT';
  occurrenceCount: number;
}

export interface QuestionContent {
  passage: string | null;
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
}

export interface QuestionSnapshot extends QuestionContent {
  updatedAt: string;
  version: number;
  typeVersionId: string;
  difficulty: number;
}

export type QuestionLearningStatus =
  'UNANSWERED' | 'CORRECT' | 'INCORRECT' | 'UPDATED';

export class QuestionContentError extends Error {
  constructor(
    readonly code: 'QUESTION_CONTENT_INVALID' | 'QUESTION_VERSION_CONFLICT',
  ) {
    super(code);
    this.name = 'QuestionContentError';
  }
}

/** 선택지를 고정 ID로 식별하고 정답이 실제 선택지에 있는지 검사한다. */
export const assertQuestionContent = (content: QuestionContent): void => {
  if (
    !content.prompt.trim() ||
    !content.explanation.trim() ||
    content.options.length < 2 ||
    content.options.some((option) => !option.id || !option.text.trim()) ||
    new Set(content.options.map((option) => option.id)).size !==
      content.options.length ||
    !content.options.some((option) => option.id === content.correctOptionId)
  ) {
    throw new QuestionContentError('QUESTION_CONTENT_INVALID');
  }
};

/** 관리자가 재풀이 필요 여부를 지정하고 현재 버전을 확인해 수정 충돌을 막는다. */
export const nextQuestionVersion = (
  currentVersion: number,
  expectedVersion: number,
  requiresRetry: boolean,
): number => {
  if (currentVersion !== expectedVersion)
    throw new QuestionContentError('QUESTION_VERSION_CONFLICT');
  return currentVersion + (requiresRetry ? 1 : 0);
};

/** 현재 버전과 마지막 풀이를 비교하며 과거 채점 결과는 변경하지 않는다. */
export const questionLearningStatus = (
  version: number,
  latestAttempt: { questionVersion: number; isCorrect: boolean } | null,
): QuestionLearningStatus => {
  if (!latestAttempt) return 'UNANSWERED';
  if (latestAttempt.questionVersion !== version) return 'UPDATED';
  return latestAttempt.isCorrect ? 'CORRECT' : 'INCORRECT';
};
