/** 문제·버전 UUID가 유지되는 refresh-safe 전체 교체 route를 정의한다 */
import {
  adminQuestionIdPathSchema,
  adminQuestionVersionIdPathSchema,
} from '@flex-thia/contracts/admin/questions';
import { createFileRoute } from '@tanstack/react-router';
import { QuestionVersionReplacePage } from '@/pages/admin/questions/QuestionVersionReplacePage';

/** 두 path UUID를 모두 계약 검증한 뒤 replacement Page에 전달한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/questions/$questionId/versions/$versionId/replace',
)({
  component: QuestionVersionReplaceRoute,
  parseParams: (params) => ({
    ...adminQuestionIdPathSchema.parse(params),
    ...adminQuestionVersionIdPathSchema.parse(params),
  }),
});

function QuestionVersionReplaceRoute() {
  const { questionId, versionId } = Route.useParams();
  return (
    <QuestionVersionReplacePage
      questionId={questionId}
      versionId={versionId}
    />
  );
}
