/** 기존 콘텐츠 입력을 뜻별 단일 발음 저장 행으로 변환한다. */
export const vocabularyMeaningRows = <
  T extends { id: string; vocabularyId: string },
>(graph: {
  meanings: T[];
  pronunciations: Array<{
    id: string;
    vocabularyId: string;
    pronunciationKo: string;
    toneMarks: string;
  }>;
  meaningPronunciations: Array<{
    vocabularyId: string;
    meaningId: string;
    pronunciationId: string;
  }>;
}): Array<T & { pronunciationKo: string; toneMarks: string }> => {
  const pronunciations = new Map(
    graph.pronunciations.map((row) => [row.id, row]),
  );
  return graph.meanings.map((meaning) => {
    const links = graph.meaningPronunciations.filter(
      (link) => link.meaningId === meaning.id,
    );
    const pronunciation =
      links.length === 1
        ? pronunciations.get(links[0]!.pronunciationId)
        : undefined;
    if (
      !pronunciation ||
      pronunciation.vocabularyId !== meaning.vocabularyId ||
      links[0]!.vocabularyId !== meaning.vocabularyId
    ) {
      throw new Error(
        'Each vocabulary meaning must have exactly one pronunciation',
      );
    }
    return {
      ...meaning,
      pronunciationKo: pronunciation.pronunciationKo,
      toneMarks: pronunciation.toneMarks,
    };
  });
};
