/** 학습자 문제 목록 URL 검색값과 하위 route 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { parseQuestionListSearch } from '@/pages/question-list';

/** API 계약 범위 밖의 문제 목록 검색값을 route 진입 전에 거부한다 */
export const Route = createFileRoute('/_authenticated/_learner/questions')({
  component: QuestionRoutes,
  validateSearch: parseQuestionListSearch,
});

function QuestionRoutes() {
  return <Outlet />;
}
