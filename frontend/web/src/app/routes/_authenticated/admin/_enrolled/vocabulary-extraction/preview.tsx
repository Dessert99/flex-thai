/** 실제 작업과 분리된 추출 진행 화면 미리보기 */
import { createFileRoute } from '@tanstack/react-router';
import { useExtractionProgressPreview } from '@/features/vocabulary-extraction/hooks/vocabulary-extraction/useExtractionProgressPreview';
import { VocabularyExtractionStep2Page } from '@/pages/admin/vocabulary-extraction/VocabularyExtractionStep2Page';
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabulary-extraction/preview',
)({ component: ExtractionPreviewRoute });
function ExtractionPreviewRoute() {
  const state = useExtractionProgressPreview();
  return <VocabularyExtractionStep2Page {...state} />;
}
