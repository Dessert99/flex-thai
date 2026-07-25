/** 계약 문장을 표시 모드에 필요한 최소 View model로 변환한다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';

/** 문제 블록 문장의 대본·음성 표시 정보 */
export interface QuestionSentenceViewModel {
  audioUrl: string;
  hiddenInitially: boolean;
  id: string;
  originalText: string;
  translationKo: string;
}

/** 계약 순서를 보존하며 문장별 대본 공개 정책을 계산한다 */
export function toQuestionSentenceViewModels(
  detail: QuestionDetailResponse,
): QuestionSentenceViewModel[] {
  return detail.blocks.flatMap((block) =>
    block.sentences.map(({ sentence }) => ({
      audioUrl: sentence.audioUrl,
      hiddenInitially: block.displayMode === 'AUDIO_THEN_REVEAL',
      id: sentence.sentenceVersionId,
      originalText: sentence.originalText,
      translationKo: sentence.translationKo,
    })),
  );
}
