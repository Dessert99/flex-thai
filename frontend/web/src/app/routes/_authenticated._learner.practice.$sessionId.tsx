/** 단어 연습 세션 UUID 검증과 진행·결과 하위 Outlet을 정의한다 */
import { vocabularyPracticeSessionPathSchema } from '@flex-thia/contracts';
import { createFileRoute, Outlet } from '@tanstack/react-router';

/** 진행과 결과가 같은 검증된 세션 UUID를 사용하게 한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/practice/$sessionId',
)({
  component: VocabularyPracticeSessionRoutes,
  parseParams: (params) => vocabularyPracticeSessionPathSchema.parse(params),
});

function VocabularyPracticeSessionRoutes() {
  return <Outlet />;
}
