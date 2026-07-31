/** 해석된 관리자 문제 버전을 canonical 전체 교체 payload로 변환한다 */
import type {
  AdminQuestionDetailResponse,
  AdminQuestionVersionPayload,
} from '@flex-thia/contracts';

type Version = AdminQuestionDetailResponse['versions'][number];
type Sentence = Version['blocks'][number]['sentences'][number]['sentence'];

/** 구조화 편집 초기화 성공 또는 안전한 field path 오류 */
export type ToQuestionVersionPayloadResult =
  | { ok: true; payload: AdminQuestionVersionPayload }
  | { ok: false; path: string; message: string };

const mapSentence = (
  sentence: Sentence,
): AdminQuestionVersionPayload['blocks'][number]['sentences'][number]['sentence'] => ({
  originalText: sentence.originalText,
  translationKo: sentence.translationKo,
  pronunciationKo: sentence.pronunciationKo,
  toneMarks: sentence.toneMarks,
  mediaAssetId: sentence.mediaAssetId,
  tokens: sentence.tokens.map((token) => ({
    surface: token.surface,
    startOffset: token.startOffset,
    endOffset: token.endOffset,
    vocabulary: { id: token.vocabularyId },
    meaning: { id: token.meaningId },
    pronunciation: { id: token.pronunciationId },
    contextMeaningKo: token.contextMeaningKo,
    role: token.role,
  })),
  expressions: sentence.expressions.map((expression) => ({
    startTokenIndex: expression.startTokenIndex,
    endTokenIndex: expression.endTokenIndex,
    vocabulary: { id: expression.vocabularyId },
    meaning: { id: expression.meaningId },
    pronunciation: { id: expression.pronunciationId },
    contextMeaningKo: expression.contextMeaningKo,
    representative: expression.representative,
  })),
});

/** 현재 immutable graph의 ref를 보존해 구조화 form용 payload를 만든다 */
export function toQuestionVersionPayload(
  version: Version,
): ToQuestionVersionPayloadResult {
  const blocks: AdminQuestionVersionPayload['blocks'] = [];
  for (const block of version.blocks) {
    const sentences: AdminQuestionVersionPayload['blocks'][number]['sentences'] =
      [];
    for (const item of block.sentences) {
      sentences.push({
        speaker: item.speaker,
        sentence: mapSentence(item.sentence),
      });
    }
    blocks.push({
      kind: block.kind,
      displayMode: block.displayMode,
      sentences,
    });
  }

  const options: AdminQuestionVersionPayload['options'] = [];
  for (const [optionIndex, option] of version.options.entries()) {
    if (option.sentenceVersionId !== null) {
      options.push({
        clientRef: option.id,
        position: option.position,
        sentence: mapSentence(option.sentence),
        span: null,
      });
      continue;
    }
    const blockPosition = version.blocks.findIndex((block) =>
      block.sentences.some(
        ({ sentenceVersionId }) =>
          sentenceVersionId === option.span.sentenceVersionId,
      ),
    );
    const spanBlock = version.blocks[blockPosition];
    const sentencePosition =
      spanBlock === undefined
        ? -1
        : spanBlock.sentences.findIndex(
            ({ sentenceVersionId }) =>
              sentenceVersionId === option.span.sentenceVersionId,
          );
    if (blockPosition < 0 || sentencePosition < 0) {
      return {
        ok: false,
        path: `options.${optionIndex}.span`,
        message: '선택지 범위가 문제 본문 문장을 가리켜야 합니다.',
      };
    }
    options.push({
      clientRef: option.id,
      position: option.position,
      sentence: null,
      span: {
        blockPosition,
        sentencePosition,
        startTokenIndex: option.span.startTokenIndex,
        endTokenIndex: option.span.endTokenIndex,
      },
    });
  }

  return {
    ok: true,
    payload: {
      questionTypeSlug: version.questionType.slug,
      questionTypeVersion: version.questionType.version,
      difficulty: version.difficulty,
      topicSlug: version.topic.slug,
      tagSlugs: version.tags.map(({ slug }) => slug),
      blocks,
      options,
      correctOptionRef: version.correctOptionId,
    },
  };
}
