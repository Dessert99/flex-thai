/** 기능 화면을 조립하는 페이지 진입점 */
import { WordbookListPageContainer } from '@/features/learning/components/wordbook-list/WordbookListPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function WordbookListPage() {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <WordbookListPageContainer />
    </div>
  );
}
