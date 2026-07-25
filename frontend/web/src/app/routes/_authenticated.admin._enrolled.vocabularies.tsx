/** 관리자 어휘 검색 계약과 하위 route Outlet을 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { parseAdminVocabularySearch } from '@/pages/vocabulary-management';

/** 어휘 관리 URL 검색값을 공개 계약으로 검증한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabularies',
)({
  component: () => <Outlet />,
  validateSearch: parseAdminVocabularySearch,
});
