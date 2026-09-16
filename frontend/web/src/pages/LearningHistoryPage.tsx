/** 기능 화면을 조립하는 페이지 진입점 */
import { LearningHistoryPageContainer } from '@/features/learning/components/learning-history/LearningHistoryPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function LearningHistoryPage() {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <LearningHistoryPageContainer />
    </div>
  );
}
