/** 공개 문제의 출제 실적과 관리자 중요도로 다음 목표 어휘를 선정한다. */
export interface VocabularySelectionCandidate {
  vocabularyId: string;
  importanceWeight: number;
  targetQuestionCount: number;
}

/** 출제 점수 공식을 한곳에 두어 향후 지표와 계산식을 바꾸기 쉽게 한다. */
export const vocabularySelectionScore = (
  candidate: VocabularySelectionCandidate,
): number => candidate.importanceWeight / (1 + candidate.targetQuestionCount);

/** 같은 생성 묶음에서 선택한 횟수도 반영하고 한 문제에는 같은 어휘를 중복 선정하지 않는다. */
export const selectVocabularyForQuestions = (
  candidates: readonly VocabularySelectionCandidate[],
  questionCount: number,
  wordsPerQuestion: number,
): string[][] => {
  const counts = new Map(
    candidates.map((candidate) => [
      candidate.vocabularyId,
      candidate.targetQuestionCount,
    ]),
  );
  if (
    !Number.isSafeInteger(questionCount) ||
    questionCount < 1 ||
    !Number.isSafeInteger(wordsPerQuestion) ||
    wordsPerQuestion < 1 ||
    new Set(candidates.map((candidate) => candidate.vocabularyId)).size !==
      candidates.length ||
    candidates.length < wordsPerQuestion ||
    candidates.some(
      (candidate) =>
        !Number.isSafeInteger(candidate.importanceWeight) ||
        candidate.importanceWeight < 1 ||
        candidate.importanceWeight > 10 ||
        !Number.isSafeInteger(candidate.targetQuestionCount) ||
        candidate.targetQuestionCount < 0,
    )
  ) {
    throw new Error('VOCABULARY_SELECTION_INVALID');
  }
  return Array.from({ length: questionCount }, () => {
    const chosen = [...candidates]
      .sort(
        (a, b) =>
          vocabularySelectionScore({
            ...b,
            targetQuestionCount: counts.get(b.vocabularyId)!,
          }) -
            vocabularySelectionScore({
              ...a,
              targetQuestionCount: counts.get(a.vocabularyId)!,
            }) || a.vocabularyId.localeCompare(b.vocabularyId),
      )
      .slice(0, wordsPerQuestion);
    for (const candidate of chosen)
      counts.set(
        candidate.vocabularyId,
        counts.get(candidate.vocabularyId)! + 1,
      );
    return chosen.map((candidate) => candidate.vocabularyId);
  });
};
