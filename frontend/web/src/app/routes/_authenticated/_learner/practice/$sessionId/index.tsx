/** 단어 연습 세션 index를 진행 Page에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { VocabularyPracticeSessionPageContainer } from '@/pages/vocabulary-practice-session';

/** Outlet 부모가 검증한 세션 UUID로 진행 화면을 렌더링한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/practice/$sessionId/',
)({
  component: VocabularyPracticeSessionRoute,
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
