/** 관리자 어휘의 usage·audio readiness·DRAFT form 상태를 표현한다 */
import type {
  AdminVocabularyDetailResponse,
  AdminVocabularyReplaceRequest,
} from '@flex-thia/contracts';
import type { ReactNode } from 'react';
import { Badge } from '@/shared/ui/badge';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { mapVocabularyDetailToForm } from '../model/mapVocabularyForm';
import { VocabularyForm } from './VocabularyForm';

interface Props {
  actions: ReactNode;
  data: AdminVocabularyDetailResponse | undefined;
  error: boolean;
  onReplace: (payload: AdminVocabularyReplaceRequest) => void;
  onRetry: () => void;
  replaceError: boolean;
  replacing: boolean;
}

/** 공개 상세의 child order를 보존하고 DRAFT만 교체 form을 표시한다 */
export function AdminVocabularyDetailPageView({
  actions,
  data,
  error,
  onReplace,
  onRetry,
  replaceError,
  replacing,
}: Props) {
  if (data === undefined && !error)
    return <PageLoading message='어휘 상세를 불러오고 있습니다.' />;
  if (error || data === undefined) {
    return (
      <PageError
        message='어휘 상세를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  return (
    <section className='grid gap-section'>
      <header className='grid gap-cluster'>
        <h1
          className='font-thai text-title text-primary'
          lang='th'
        >
          {data.thai}
        </h1>
        <div className='flex gap-cluster'>{actions}</div>
      </header>
      <div className='grid gap-cluster'>
        {data.pronunciations.map((pronunciation) => (
          <p key={pronunciation.id}>
            {pronunciation.pronunciationKo} ·{' '}
            <Badge
              variant={
                pronunciation.mediaStatus === 'READY'
                  ? 'secondary'
                  : 'destructive'
              }
            >
              {pronunciation.mediaStatus === 'READY'
                ? '음성 준비 완료'
                : `음성 ${pronunciation.mediaStatus}`}
            </Badge>
          </p>
        ))}
        <p>문장 버전 사용처 {data.usage.sentenceVersionIds.length}개</p>
        <p>문제 버전 사용처 {data.usage.questionVersionIds.length}개</p>
      </div>
      {data.status === 'DRAFT' ? (
        <VocabularyForm
          defaultValues={mapVocabularyDetailToForm(data)}
          disabled={replacing}
          onReplace={onReplace}
        />
      ) : null}
      {replaceError ? (
        <p className='text-body text-danger'>어휘 전체 교체에 실패했습니다.</p>
      ) : null}
    </section>
  );
}
