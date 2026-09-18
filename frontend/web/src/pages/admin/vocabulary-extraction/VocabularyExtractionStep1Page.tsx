/** 단어 추출 1단계의 페이지 너비와 헤더를 구성한다 */
import { VocabularyExtractionStep1 } from '@/features/content-production/components/vocabulary-extraction/VocabularyExtractionStep1';
import { Container } from '@/shared/components/layouts/Container';
export function VocabularyExtractionStep1Page() {
  return (
    <Container className='w-full max-w-3xl flex-1'>
      <div className='grid gap-section'>
        <header className='grid gap-cluster'>
          <p className='text-caption text-subtle'>관리자 / 단어 추출</p>
          <h1 className='text-heading'>단어 추출</h1>
          <p className='text-body text-subtle'>
            자료를 넣으면 새 단어와 새로운 뜻을 찾아요.
          </p>
        </header>
        <p
          aria-current='step'
          className='flex items-center gap-cluster text-caption'
        >
          <span className='flex size-avatar items-center justify-center rounded-control bg-brand text-primary-foreground'>
            1
          </span>
          <strong>자료 입력</strong>
        </p>
        <VocabularyExtractionStep1 />
      </div>
    </Container>
  );
}
