import { VocabularyForm } from '@/features/learning/components/admin-vocabulary-detail/VocabularyForm';
import { VocabularyImportanceForm } from '@/features/learning/components/admin-vocabulary-detail/VocabularyImportanceForm';
import { VocabularyMergePanel } from '@/features/learning/components/admin-vocabulary-detail/VocabularyMergePanel';
import { VocabularyRelationManager } from '@/features/learning/components/admin-vocabulary-detail/VocabularyRelationManager';
import { VocabularyStateAction } from '@/features/learning/components/change-vocabulary-state/VocabularyStateAction';
import { useAdminVocabularyDetail } from '@/features/learning/hooks/admin-vocabulary-detail/useAdminVocabularyDetail';
import { mapVocabularyDetailToForm } from '@/features/learning/libs/admin-vocabulary-detail/mapVocabularyForm';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
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
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

/** 관리자 어휘 상세 route의 입력 */
export interface AdminVocabularyDetailPageContainerProps {
  vocabularyId: string;
}
export function AdminVocabularyDetailPage(
  pageInput: Parameters<typeof useAdminVocabularyDetail>[0],
) {
  const {
    vocabularyId,
    detail,
    discardMergePreview,
    merge,
    mergePreview,
    previewMerge,
    refresh,
    relation,
    replace,
    action,
  } = useAdminVocabularyDetail(pageInput);

  return (
    <Container className='max-w-content flex-1'>
      <>
        <AdminVocabularyDetailContent
          actions={
            detail.data && action ? (
              <VocabularyStateAction
                action={action}
                onConfirmed={() => void refresh()}
                vocabularyId={vocabularyId}
              />
            ) : null
          }
          data={detail.data}
          error={detail.isError}
          mergeMutating={previewMerge.isPending || merge.isPending}
          mergePreview={mergePreview}
          onCreateRelation={(payload) =>
            relation.mutate({
              kind: 'create',
              payload,
            })
          }
          onDeleteRelation={(relationId) =>
            relation.mutate({ kind: 'delete', relationId })
          }
          onMerge={(preview) => merge.mutate(preview)}
          onPreviewMerge={(representativeVocabularyId) =>
            previewMerge.mutate(representativeVocabularyId)
          }
          onRelationUpdate={(relationId, payload) =>
            relation.mutate({ kind: 'status', relationId, payload })
          }
          onRepresentativeChange={discardMergePreview}
          onReplace={(payload) => replace.mutate(payload)}
          onRetry={() => void detail.refetch()}
          replaceError={replace.isError}
          replacing={replace.isPending}
          relationMutating={relation.isPending}
        />
      </>
    </Container>
  );
}

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
export function AdminVocabularyDetailContent({
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
