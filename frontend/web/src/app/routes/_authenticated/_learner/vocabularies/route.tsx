/** 어휘 목록 검색 계약과 하위 route 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { parseVocabularyListSearch } from '@/pages/vocabulary-list';

/** 어휘 URL 검색값을 route 진입 전에 검증한다 */
export const Route = createFileRoute('/_authenticated/_learner/vocabularies')({
  component: Outlet,
  validateSearch: parseVocabularyListSearch,
});
