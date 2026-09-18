import { useContentProductionJobDetail } from '@/features/content-production/hooks/content-production-job-detail/useContentProductionJobDetail';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { ContentProductionJobDetailResponse } from '@flex-thia/contracts/content-production/content-production';
import { Link } from '@tanstack/react-router';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function ContentProductionJobDetailPage(
  pageInput: Parameters<typeof useContentProductionJobDetail>[0],
) {
  const { job, retry } = useContentProductionJobDetail(pageInput);

  if (job.isPending)
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>작업을 불러오고 있습니다.</p>
          </section>
        </>
      </Container>
    );

  if (job.isError || !job.data) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>작업을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void job.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <>
        <ContentProductionJobDetailContent
          job={job.data}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
      </>
    </Container>
  );
}
/** immutable snapshot과 item 공개 상태만 job 상세에 렌더링한다 */

interface ContentProductionJobDetailPageViewProps {
  job: ContentProductionJobDetailResponse;
  retrying?: boolean;
  onRetry: () => void;
}

/** private input key·provider result 없이 typed option과 공개 오류만 표시한다 */
export function ContentProductionJobDetailContent({
  job,
  retrying = false,
  onRetry,
}: ContentProductionJobDetailPageViewProps) {
  const retryable = job.items.some((item) => item.retryable);
  return (
    <section className='grid gap-section'>
      <header className='flex items-center justify-between'>
        <h1 className='text-title text-primary'>콘텐츠 제작 작업</h1>
        <Badge>{job.status}</Badge>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>
            {job.presetSnapshot.name} v{job.presetSnapshot.version}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            입력 {job.inputs.length}개 · 항목 {job.items.length}개
          </p>
          <p>
            성공 {job.counts.succeeded} · 검토 {job.counts.needsAttention} ·
            실패 {job.counts.failed}
          </p>
          {'suspectedDuplicateMaxCodePointDistance' in
          job.presetSnapshot.parameters ? (
            <p>
              중복 의심 거리{' '}
              {
                job.presetSnapshot.parameters
                  .suspectedDuplicateMaxCodePointDistance
              }
            </p>
          ) : null}
          {'questionCount' in job.presetSnapshot.parameters ? (
            <>
              <p>문제 수 {job.presetSnapshot.parameters.questionCount}</p>
              <p>
                유사도 기준 {job.presetSnapshot.parameters.similarityThreshold}
              </p>
              <p>
                신규 보조 어휘 한도{' '}
                {job.presetSnapshot.parameters.newAuxiliaryVocabularyLimit}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
      {job.items.map((item) => (
        <div
          className='flex justify-between border-b py-cluster'
          key={item.id}
        >
          <span>
            {item.status}
            {item.errorCode ? ` · ${item.errorCode}` : ''}
          </span>
          <span>attempt {item.attempt}</span>
        </div>
      ))}
      <div className='flex gap-cluster'>
        <Button
          disabled={!retryable || retrying}
          onClick={onRetry}
          type='button'
        >
          재시도
        </Button>
        <Button
          asChild
          variant='outline'
        >
          <Link
            to='/admin/content-production/candidates'
            search={{ jobId: job.id, page: 1, pageSize: 20 }}
          >
            후보 검수
          </Link>
        </Button>
      </div>
    </section>
  );
}
