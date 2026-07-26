/** 검증된 단어 연습 세션 UUID를 진행 Page에 연결한다 */
import { vocabularyPracticeSessionPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { VocabularyPracticeSessionPageContainer } from '@/pages/vocabulary-practice-session';

/** 학습자 세션 경로의 UUID를 계약으로 검증한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/practice/$sessionId',
)({
  component: VocabularyPracticeSessionRoute,
  parseParams: (params) => vocabularyPracticeSessionPathSchema.parse(params),
});

function VocabularyPracticeSessionRoute() {
  const { sessionId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <VocabularyPracticeSessionPageContainer
      onShowResult={(nextSessionId) =>
        void navigate({
          params: { sessionId: nextSessionId },
          to: '/practice/$sessionId/result',
        })
      }
      sessionId={sessionId}
    />
  );
}
