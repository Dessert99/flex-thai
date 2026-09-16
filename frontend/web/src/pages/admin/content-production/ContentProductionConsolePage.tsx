/** 기능 화면을 조립하는 페이지 진입점 */
import { ContentProductionConsolePageContainer } from '@/features/content-production/components/content-production-console/ContentProductionConsolePageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function ContentProductionConsolePage() {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <ContentProductionConsolePageContainer />
    </div>
  );
}
