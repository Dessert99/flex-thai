import { Container } from '@/shared/components/layouts/Container';
/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { ContentImportListPageContainer } from '@/features/content-production/components/content-import-list/ContentImportListPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function ContentImportListPage(
  props: ComponentProps<typeof ContentImportListPageContainer>,
) {
  return (
    <Container className='max-w-content flex-1'>
      <ContentImportListPageContainer {...props} />
    </Container>
  );
}
