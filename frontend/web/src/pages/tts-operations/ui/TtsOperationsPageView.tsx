/** 관리자 TTS 작업 page의 loading·error·empty·목록 상태를 표현한다 */
import type { TtsJobListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

interface TtsOperationsPageViewProps {
  data: TtsJobListResponse | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}

/** 같은 작업 page를 desktop table과 mobile record로 제공한다 */
export function TtsOperationsPageView({
  data,
  error,
  loading,
  onRetry,
}: TtsOperationsPageViewProps) {
  if (loading) return <PageLoading message='TTS 작업을 불러오고 있습니다.' />;
  if (error !== null || data === undefined) {
    return (
      <PageError
        message='TTS 작업을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    return <PageEmpty title='등록된 TTS 작업이 없습니다.' />;
  }
  return (
    <section className='grid gap-section'>
      <h1 className='text-title'>TTS 운영</h1>
      <div className='hidden md:block'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상태</TableHead>
              <TableHead>항목</TableHead>
              <TableHead>생성</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <JobStatus status={job.status} />
                </TableCell>
                <TableCell>
                  {job.counts.succeeded} 성공 / {job.counts.failed} 실패
                </TableCell>
                <TableCell>
                  <a href={`/admin/tts/jobs/${job.id}`}>{job.createdAt}</a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul
        aria-label='모바일 TTS 작업 목록'
        className='grid gap-cluster md:hidden'
      >
        {data.items.map((job) => (
          <li key={job.id}>
            <a href={`/admin/tts/jobs/${job.id}`}>
              <JobStatus status={job.status} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobStatus({
  status,
}: {
  status: TtsJobListResponse['items'][number]['status'];
}) {
  return (
    <Badge variant={status === 'FAILED' ? 'destructive' : 'secondary'}>
      {
        (
          {
            QUEUED: '대기',
            RUNNING: '실행 중',
            SUCCEEDED: '성공',
            PARTIALLY_FAILED: '일부 실패',
            FAILED: '실패',
          } as const
        )[status]
      }
    </Badge>
  );
}
