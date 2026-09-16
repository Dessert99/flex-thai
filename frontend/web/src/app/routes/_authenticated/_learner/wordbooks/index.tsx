/** 학습자 단어장 목록 Page를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';
import { WordbookListPage } from '@/pages/WordbookListPage';

/** 학습자 guard 아래에서 단어장 목록을 렌더링한다 */
export const Route = createFileRoute('/_authenticated/_learner/wordbooks/')({
  component: WordbookListPage,
});
