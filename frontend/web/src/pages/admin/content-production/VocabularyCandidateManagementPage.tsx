import { Container } from '@/shared/components/layouts/Container';
/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { VocabularyCandidateManagementPageContainer } from '@/features/content-production/components/vocabulary-candidate-management/VocabularyCandidateManagementPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function VocabularyCandidateManagementPage(
  props: ComponentProps<typeof VocabularyCandidateManagementPageContainer>,
) {
  return (
    <Container className='max-w-content flex-1'>
      <VocabularyCandidateManagementPageContainer {...props} />
    </Container>
  );
}
