/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { ContentProductionJobDetailPageContainer } from '@/features/content-production/components/content-production-job-detail/ContentProductionJobDetailPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function ContentProductionJobDetailPage(
  props: ComponentProps<typeof ContentProductionJobDetailPageContainer>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <ContentProductionJobDetailPageContainer {...props} />
    </div>
  );
}
