/** 관리자 문제 상세 Query를 불변 버전 inspection View에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { adminQuestionDetailQueryOptions } from '../api/adminQuestionDetailQueries';
import { AdminQuestionDetailPageView } from './AdminQuestionDetailPageView';

interface AdminQuestionDetailPageContainerProps {
  questionId: string;
}

/** route가 검증한 문제 UUID의 서버 상세 상태를 소유한다 */
export function AdminQuestionDetailPageContainer({
  questionId,
}: AdminQuestionDetailPageContainerProps) {
  const detail = useQuery(adminQuestionDetailQueryOptions(questionId));
  return (
    <AdminQuestionDetailPageView
      data={detail.data}
      error={detail.error}
      loading={detail.isPending}
      onRetry={() => void detail.refetch()}
    />
  );
}
