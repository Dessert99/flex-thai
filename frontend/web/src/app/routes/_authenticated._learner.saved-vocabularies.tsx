/** 단일 저장 어휘 collection Page를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { SavedVocabulariesPageContainer } from '@/pages/saved-vocabularies';

/** 학습자 guard 아래에서 저장 목록을 렌더링한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/saved-vocabularies',
)({
  component: SavedVocabulariesPageContainer,
});
