import { VocabularyExtractionStep3Page } from './VocabularyExtractionStep3Page';
import { Link } from '@tanstack/react-router';
import { useExtractionJob } from '@/features/vocabulary-extraction/hooks/vocabulary-extraction/useExtractionJob';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { VocabularyExtractionStep2Page } from './VocabularyExtractionStep2Page';
/** 저장된 작업을 URL로 복원하고 진행 화면과 결과를 조립한다. */
export function VocabularyExtractionJobPage({ jobId }: { jobId: string }) {
  const { query, retry, progress } = useExtractionJob(jobId);
  if (!progress)
    return (
      <Container className='max-w-3xl'>
        <h1 className='text-heading'>단어 추출</h1>
        <p className='my-cluster'>
          {query.isError
            ? '작업을 불러오지 못했어요. 연결 또는 접근 권한을 확인하세요.'
            : '작업을 불러오고 있어요.'}
        </p>
        <Button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          다시 불러오기
        </Button>
        <Link
          to='/admin/vocabulary-extraction'
          className='ml-cluster underline'
        >
          자료 입력으로 돌아가기
        </Link>
      </Container>
    );
  if (progress.status === 'complete')
    return (
      <VocabularyExtractionStep3Page
        key={jobId}
        jobId={jobId}
        sourceName={progress.sourceName}
      />
    );
  return (
    <div className='grid w-full gap-cluster'>
      {retry.isError && (
        <p
          role='alert'
          className='text-center text-danger'
        >
          재시도를 요청하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.
        </p>
      )}
      <VocabularyExtractionStep2Page
        progress={progress}
        onRetry={() => retry.mutate()}
        onReconnect={() => void query.refetch()}
        actionPending={retry.isPending || (query.isFetching && query.isError)}
      />
    </div>
  );
}
