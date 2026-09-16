/** 학습자 단어 연습 설정 Page를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';
import { VocabularyPracticeSetupPageContainer } from '@/pages/vocabulary-practice-setup';

/** 생성된 세션을 진행 경로로 연결한다 */
export const Route = createFileRoute('/_authenticated/_learner/practice/')({
  component: VocabularyPracticeSetupRoute,
});

function VocabularyPracticeSetupRoute() {
  const navigate = Route.useNavigate();
  return (
    <VocabularyPracticeSetupPageContainer
      onCreated={(sessionId) =>
        void navigate({
          params: { sessionId },
          to: '/practice/$sessionId',
        })
      }
    />
  );
}
