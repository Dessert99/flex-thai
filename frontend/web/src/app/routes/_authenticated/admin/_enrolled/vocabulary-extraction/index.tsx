/** 관리자 단어 추출의 자료 입력 단계 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { VocabularyExtractionStep1Page } from '@/pages/admin/vocabulary-extraction/VocabularyExtractionStep1Page';
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabulary-extraction/',
)({ component: ExtractionInputRoute });
function ExtractionInputRoute() {
  const navigate = useNavigate();
  return (
    <VocabularyExtractionStep1Page
      onStarted={(id) =>
        void navigate({
          to: '/admin/vocabulary-extraction/$jobId',
          params: { jobId: id },
        })
      }
    />
  );
}
