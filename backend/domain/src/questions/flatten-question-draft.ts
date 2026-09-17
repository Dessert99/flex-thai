/** 기존 가져오기 문장 graph를 현재 문제 본문과 어휘 사용 정보로 변환한다. */
import type { ResolvedQuestionDraftGraph } from '../content-import/content-draft.repository.js';
import type { QuestionAdminInput } from './question-admin.repository.js';
import type { QuestionVocabulary } from './question.js';
export const flattenQuestionDraft = (
  graph: ResolvedQuestionDraftGraph,
): QuestionAdminInput => {
  const byId = new Map(graph.sentences.map((item) => [item.version.id, item]));
  const used = new Set<string>();
  const blocks = [...graph.blocks].sort((a, b) => a.position - b.position);
  const textFor = (kinds: string[]) =>
    blocks
      .filter((block) => kinds.includes(block.kind))
      .flatMap((block) =>
        [...block.sentences]
          .sort((a, b) => a.position - b.position)
          .map((entry) => {
            const sentence = byId.get(entry.sentenceVersionId);
            if (!sentence)
              throw new Error('QUESTION_SENTENCE_REFERENCE_INVALID');
            if (block.kind !== 'EXPLANATION') used.add(entry.sentenceVersionId);
            return `${entry.speaker ? `${entry.speaker}: ` : ''}${sentence.version.originalText}`;
          }),
      )
      .join('\n');
  const passage = textFor(['PASSAGE', 'DIALOGUE']) || null;
  const prompt = textFor(['INSTRUCTION', 'QUESTION']);
  const explanation = textFor(['EXPLANATION']);
  const options = [...graph.options]
    .sort((a, b) => a.position - b.position)
    .map((option) => {
      const sentenceId =
        option.sentenceVersionId ?? option.spanSentenceVersionId;
      const sentence = sentenceId ? byId.get(sentenceId) : undefined;
      if (!sentence) throw new Error('QUESTION_OPTION_REFERENCE_INVALID');
      used.add(sentence.version.id);
      const text = option.sentenceVersionId
        ? sentence.version.originalText
        : [...sentence.tokens]
            .sort((a, b) => a.position - b.position)
            .slice(option.spanStartTokenIndex!, option.spanEndTokenIndex!)
            .map((token) => token.surface)
            .join('');
      return { id: option.id, text };
    });
  const usage = new Map<string, QuestionVocabulary>();
  const add = (vocabularyId: string, meaningId: string, target: boolean) => {
    const item = usage.get(vocabularyId);
    usage.set(vocabularyId, {
      vocabularyId,
      meaningId: item && item.meaningId !== meaningId ? null : meaningId,
      role: target || item?.role === 'TARGET' ? 'TARGET' : 'CONTEXT',
      occurrenceCount: (item?.occurrenceCount ?? 0) + 1,
    });
  };
  for (const sentenceId of used) {
    const sentence = byId.get(sentenceId)!;
    for (const token of sentence.tokens)
      add(token.vocabularyId, token.meaningId, token.role === 'TARGET');
    for (const expression of sentence.expressions)
      add(expression.vocabularyId, expression.meaningId, false);
  }
  const result = {
    typeVersionId: graph.version.typeVersionId,
    topicId: graph.version.topicId,
    tagIds: graph.tagIds,
    difficulty: graph.version.difficulty,
    passage,
    prompt,
    options,
    correctOptionId: graph.options.find((option) => option.isCorrect)?.id ?? '',
    explanation,
    vocabularies: [...usage.values()],
  };
  return result;
};
