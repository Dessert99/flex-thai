/** 관리자 TTS job voice snapshot과 항목 운영 상태를 표현한다 */
import type { TtsJobDetailResponse } from '@flex-thia/contracts';
import { RetryTtsItemsAction } from '@/features/retry-tts-items';
import { isApiError } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';

import type { TtsJobItemsSearch } from '../model/ttsJobItemsSearch';
import { TtsJobItemFilters } from './TtsJobItemFilters';
import { TtsJobItemPagination, TtsJobItemRecords } from './TtsJobItemRecords';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

interface Props {
  data: TtsJobDetailResponse | undefined;
  error: unknown;
  loading: boolean;
  onFilterChange: (patch: Partial<TtsJobItemsSearch>) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: TtsJobItemsSearch;
}

/** voice snapshot·실패 원인·retry·audio를 한 job 문맥에서 조립한다 */
export function AdminTtsJobDetailPageView({
  data,
  error,
  loading,
  onFilterChange,
  onPageChange,
  onRetry,
  search,
}: Props) {
  if (loading) {
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>
          TTS 작업 상세를 불러오고 있습니다.
        </p>
      </section>
    );
  }
  if (error !== null || data === undefined) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>
            {isNotFound(error)
              ? '요청한 TTS 작업을 찾을 수 없습니다.'
              : 'TTS 작업 상세를 불러오지 못했습니다.'}
          </p>
          <Button
            className='mt-cluster w-auto'
            onClick={onRetry}
            type='button'
            variant='outline'
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <section className='grid gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title'>TTS 작업 상세</h1>
        <Badge variant={data.status === 'FAILED' ? 'destructive' : 'secondary'}>
          {data.status}
        </Badge>
        <p>
          {data.voice.provider} / {data.voice.model} / {data.voice.voice}
        </p>
        <p className='text-caption text-subtle'>
          {data.voice.locale} · {data.voice.audioFormat} ·{' '}
          {data.voice.generationRevision}
        </p>
      </header>
      <TtsJobItemFilters
        onChange={onFilterChange}
        search={search}
      />
      <RetryTtsItemsAction
        items={data.items}
        jobId={data.id}
      />
      {data.items.length === 0 ? (
        <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
          <h2 className='text-title text-primary'>
            {hasItemFilters(search)
              ? '조건에 맞는 TTS 항목이 없습니다.'
              : 'TTS 항목이 없습니다.'}
          </h2>
          <p className='text-body text-subtle'>
            {hasItemFilters(search)
              ? '상태나 오류 코드 조건을 변경해 보세요.'
              : '이 작업에 포함된 항목이 없습니다.'}
          </p>
        </section>
      ) : (
        <>
          <TtsJobItemRecords items={data.items} />
          <TtsJobItemPagination
            onPageChange={onPageChange}
            page={data.itemPage}
          />
        </>
      )}
    </section>
  );
}

function hasItemFilters(search: TtsJobItemsSearch) {
  return search.status !== undefined || search.errorCode !== undefined;
}

function isNotFound(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === 404
  );
}
