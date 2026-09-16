/** 어휘 상세·관련 문제 Query와 저장 cache 무효화를 조정한다 */
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { vocabularyDetailQueryOptions } from '../api/vocabularyDetailQueries';
import { VocabularyDetailPageView } from './VocabularyDetailPageView';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

/** 두 조회가 준비된 상세만 View에 전달한다 */
export function VocabularyDetailPageContainer({
  vocabularyId,
}: {
  vocabularyId: string;
}) {
  const queryClient = useQueryClient();
  const [detail, related] = useQueries({
    queries: vocabularyDetailQueryOptions(vocabularyId),
  });
  if (detail.isPending || related.isPending) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            어휘 상세를 불러오고 있습니다.
          </p>
        </section>
      </div>
    );
  }
  if (detail.isError || related.isError || detail.data === undefined) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>어휘 상세를 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={() => {
                void detail.refetch();
                void related.refetch();
              }}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <VocabularyDetailPageView
        detail={detail.data}
        onWordbookMembershipConfirmed={() => {
          void queryClient.invalidateQueries({
            queryKey: ['learner', 'vocabularies'],
          });
        }}
        relatedQuestions={related.data?.items ?? []}
      />
    </div>
  );
}
