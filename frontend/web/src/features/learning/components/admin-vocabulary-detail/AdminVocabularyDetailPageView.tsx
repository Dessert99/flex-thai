import type {
  AdminVocabularyDetailResponse,
  AdminVocabularyReplaceRequest,
} from '@flex-thia/contracts/admin/vocabularies';
import type {
  AdminVocabularyMergePreviewResponse,
  AdminVocabularyRelationCreateRequest,
  AdminVocabularyRelationUpdateRequest,
} from '@flex-thia/contracts/admin/vocabulary-relations';
import type { ReactNode } from 'react';
import { VocabularyImportanceForm } from './VocabularyImportanceForm';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Skeleton } from '@/shared/components/skeleton';
import { mapVocabularyDetailToForm } from '../../libs/admin-vocabulary-detail/mapVocabularyForm';
import { VocabularyForm } from './VocabularyForm';
import { VocabularyMergePanel } from './VocabularyMergePanel';
import { VocabularyRelationManager } from './VocabularyRelationManager';

interface Props {
  actions: ReactNode;
  data: AdminVocabularyDetailResponse | undefined;
  error: boolean;
  onReplace: (payload: AdminVocabularyReplaceRequest) => void;
  onCreateRelation: (payload: AdminVocabularyRelationCreateRequest) => void;
  onDeleteRelation: (relationId: string) => void;
  onMerge: (preview: AdminVocabularyMergePreviewResponse) => void;
  onPreviewMerge: (representativeVocabularyId: string) => void;
  onRelationUpdate: (
    relationId: string,
    payload: AdminVocabularyRelationUpdateRequest,
  ) => void;
  onRepresentativeChange: () => void;
  onRetry: () => void;
  replaceError: boolean;
  replacing: boolean;
  relationMutating: boolean;
  mergeMutating: boolean;
  mergePreview: AdminVocabularyMergePreviewResponse | null;
}

/** 공개 상세의 child order를 보존하고 DRAFT만 교체 form을 표시한다 */
export function AdminVocabularyDetailPageView({
  actions,
  data,
  error,
  onReplace,
  onCreateRelation,
  onDeleteRelation,
  onMerge,
  onPreviewMerge,
  onRelationUpdate,
  onRepresentativeChange,
  onRetry,
  replaceError,
  replacing,
  relationMutating,
  mergeMutating,
  mergePreview,
}: Props) {
  if (data === undefined && !error)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>어휘 상세를 불러오고 있습니다.</p>
      </section>
    );
  if (error || data === undefined) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>어휘 상세를 불러오지 못했습니다.</p>
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
          <p key={pronunciation.id}>{pronunciation.pronunciationKo} · </p>
        ))}
        <p>문장 버전 사용처 {data.usage.sentenceVersionIds.length}개</p>
        <p>
          공개 문제 등장 {data.usage.questionCount}개 · 출제 목표{' '}
          {data.usage.targetQuestionCount}개 · 총 등장{' '}
          {data.usage.occurrenceCount}회
        </p>
        {data.status !== 'MERGED' ? (
          <VocabularyImportanceForm
            key={`${data.id}:${data.importanceWeight}`}
            vocabularyId={data.id}
            importanceWeight={data.importanceWeight}
          />
        ) : null}
      </div>
      <VocabularyRelationManager
        detail={data}
        disabled={relationMutating || data.status === 'MERGED'}
        onCreate={onCreateRelation}
        onDelete={onDeleteRelation}
        onUpdate={onRelationUpdate}
      />
      {data.status !== 'MERGED' ? (
        <VocabularyMergePanel
          disabled={mergeMutating}
          onMerge={onMerge}
          onPreview={onPreviewMerge}
          onRepresentativeChange={onRepresentativeChange}
          preview={mergePreview}
          sourceVocabularyId={data.id}
        />
      ) : null}
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
