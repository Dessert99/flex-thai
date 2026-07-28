/** immutable snapshot과 item 공개 상태만 job 상세에 렌더링한다 */
import type { ContentProductionJobDetailResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

interface ContentProductionJobDetailPageViewProps {
  job: ContentProductionJobDetailResponse;
  retrying?: boolean;
  onRetry: () => void;
}

/** private input key·provider result 없이 typed option과 공개 오류만 표시한다 */
export function ContentProductionJobDetailPageView({
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
          <a href={`/admin/content-production/candidates?jobId=${job.id}`}>
            후보 검수
          </a>
        </Button>
      </div>
    </section>
  );
}
