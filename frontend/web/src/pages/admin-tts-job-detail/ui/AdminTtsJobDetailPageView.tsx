/** 관리자 TTS job voice snapshot과 항목 운영 상태를 표현한다 */
import type { TtsJobDetailResponse } from '@flex-thia/contracts';
import { RetryTtsItemsAction } from '@/features/retry-tts-items';
import { isApiError } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import type { TtsJobItemsSearch } from '../model/ttsJobItemsSearch';
import { TtsJobItemFilters } from './TtsJobItemFilters';
import { TtsJobItemPagination, TtsJobItemRecords } from './TtsJobItemRecords';

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
    return <PageLoading message='TTS 작업 상세를 불러오고 있습니다.' />;
  }
  if (error !== null || data === undefined) {
    return (
      <PageError
        message={
          isNotFound(error)
            ? '요청한 TTS 작업을 찾을 수 없습니다.'
            : 'TTS 작업 상세를 불러오지 못했습니다.'
        }
        onRetry={onRetry}
      />
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
        <PageEmpty
          description={
            hasItemFilters(search)
              ? '상태나 오류 코드 조건을 변경해 보세요.'
              : '이 작업에 포함된 항목이 없습니다.'
          }
          title={
            hasItemFilters(search)
              ? '조건에 맞는 TTS 항목이 없습니다.'
              : 'TTS 항목이 없습니다.'
          }
        />
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
