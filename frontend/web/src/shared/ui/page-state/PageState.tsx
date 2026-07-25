/** 페이지의 로딩·빈 결과·복구 가능한 오류 상태를 일관되게 표현한다 */
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

interface PageLoadingProps {
  message?: string;
}

interface PageEmptyProps {
  action?: ReactNode;
  description?: string;
  title: string;
}

interface PageErrorProps {
  message: string;
  onRetry: () => void;
  requestId?: string;
}

/** 화면 데이터가 준비 중임을 보조 기술에도 알린다 */
export function PageLoading({
  message = '불러오는 중입니다.',
}: PageLoadingProps) {
  return (
    <section
      aria-live='polite'
      className='flex min-h-state flex-col justify-center gap-cluster p-page'
      role='status'
    >
      <Skeleton className='h-control w-full max-w-content' />
      <p className='text-body text-subtle'>{message}</p>
    </section>
  );
}

/** 결과가 없는 이유와 다음 행동을 분리해 안내한다 */
export function PageEmpty({ action, description, title }: PageEmptyProps) {
  return (
    <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
      <h2 className='text-title text-primary'>{title}</h2>
      {description ? (
        <p className='text-body text-subtle'>{description}</p>
      ) : null}
      {action}
    </section>
  );
}

/** 안전한 오류 설명과 사용자가 시작하는 재시도만 제공한다 */
export function PageError({ message, onRetry, requestId }: PageErrorProps) {
  return (
    <Alert
      className='rounded-panel border-danger bg-danger-surface'
      variant='destructive'
    >
      <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
      <AlertDescription className='flex flex-col gap-cluster text-danger'>
        <p>{message}</p>
        {requestId ? (
          <p className='text-caption'>요청 ID: {requestId}</p>
        ) : null}
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
