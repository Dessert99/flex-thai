/** 검증된 단어 연습 세션 UUID를 결과 Page에 연결한다 */
import { vocabularyPracticeSessionPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { VocabularyPracticeResultPageContainer } from '@/pages/vocabulary-practice-result';

/** 결과에서 같은 세션 진행 화면으로 돌아갈 수 있게 한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/practice/$sessionId/result',
)({
  component: VocabularyPracticeResultRoute,
  parseParams: (params) => vocabularyPracticeSessionPathSchema.parse(params),
});

function VocabularyPracticeResultRoute() {
  const { sessionId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <VocabularyPracticeResultPageContainer
      onContinue={(nextSessionId) =>
        void navigate({
          params: { sessionId: nextSessionId },
          to: '/practice/$sessionId',
        })
      }
      sessionId={sessionId}
    />
  );
}
