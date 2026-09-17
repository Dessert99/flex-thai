import { Container } from '@/shared/components/layouts/Container';
/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { QuestionCandidateManagementPageContainer } from '@/features/content-production/components/question-candidate-management/QuestionCandidateManagementPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function QuestionCandidateManagementPage(
  props: ComponentProps<typeof QuestionCandidateManagementPageContainer>,
) {
  return (
    <Container className='max-w-content flex-1'>
      <QuestionCandidateManagementPageContainer {...props} />
    </Container>
  );
}
