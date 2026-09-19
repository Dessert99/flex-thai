import { createFileRoute } from '@tanstack/react-router';
import { VocabularyExtractionStep3Page } from '@/pages/admin/vocabulary-extraction/VocabularyExtractionStep3Page';
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabulary-extraction/result-preview',
)({
  component: () => (
    <VocabularyExtractionStep3Page
      jobId='preview'
      sourceName='예시 독해 자료'
      preview
    />
  ),
});
