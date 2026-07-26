/** 계약 block을 표시 정보 손실 없이 문제 화면 View model로 변환한다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';

/** 문제 상세의 block과 문장 표시 정보를 보존한다 */
export interface QuestionBlockViewModel {
  id: string;
  kind: QuestionDetailResponse['blocks'][number]['kind'] | 'EXPLANATION';
  displayMode: QuestionDetailResponse['blocks'][number]['displayMode'];
  position: number;
  sentences: QuestionDetailResponse['blocks'][number]['sentences'];
}

/** 문제 상세 block과 내부 문장을 position 순서로 정렬한다 */
export function toQuestionBlockViewModels(
  detail: QuestionDetailResponse,
): QuestionBlockViewModel[] {
  return [...detail.blocks]
    .sort((left, right) => left.position - right.position)
    .map((block) => ({
      id: block.id,
      kind: block.kind,
      displayMode: block.displayMode,
      position: block.position,
      sentences: [...block.sentences].sort(
        (left, right) => left.position - right.position,
      ),
    }));
}
