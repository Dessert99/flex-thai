import { Container } from '@/shared/components/layouts/Container';
/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { VocabularyPracticeSessionPageContainer } from '@/features/learning/components/vocabulary-practice-session/VocabularyPracticeSessionPageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function VocabularyPracticeSessionPage(
  props: ComponentProps<typeof VocabularyPracticeSessionPageContainer>,
) {
  return (
    <Container className='max-w-content flex-1'>
      <VocabularyPracticeSessionPageContainer {...props} />
    </Container>
  );
}
