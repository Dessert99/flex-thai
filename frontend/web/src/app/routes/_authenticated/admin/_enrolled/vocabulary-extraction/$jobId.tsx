import { createFileRoute } from '@tanstack/react-router';
import { VocabularyExtractionJobPage } from '@/pages/admin/vocabulary-extraction/VocabularyExtractionJobPage';
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabulary-extraction/$jobId',
)({ component: ExtractionJobRoute });
function ExtractionJobRoute() {
  const { jobId } = Route.useParams();
  return <VocabularyExtractionJobPage jobId={jobId} />;
}
