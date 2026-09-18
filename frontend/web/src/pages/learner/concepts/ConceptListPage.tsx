import { useConceptList } from '@/features/learning/hooks/concept-list/useConceptList';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { ConceptCategory } from '@flex-thia/contracts/concepts/concepts';
import { Link } from '@tanstack/react-router';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function ConceptListPage(
  pageInput: Parameters<typeof useConceptList>[0],
) {
  const { category, data, error, loading, onCategoryChange, onRetry } =
    useConceptList(pageInput);

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <h1 className='text-title text-primary'>개념 학습</h1>
        <div
          aria-label='개념 영역'
          className='flex gap-cluster'
          role='tablist'
        >
          {[
            ['THAI_SCRIPT', '태국 문자'],
            ['GRAMMAR', '문법'],
          ].map(([value, label]) => (
            <button
              aria-selected={category === value}
              key={value}
              onClick={() => onCategoryChange(value as ConceptCategory)}
              role='tab'
              type='button'
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? (
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>개념을 불러오고 있습니다.</p>
          </section>
        ) : null}
        {error ? (
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>개념 목록을 불러오지 못했습니다.</p>
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
        ) : null}
        {!loading && !error && data?.items.length === 0 ? (
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>게시된 개념이 없습니다.</h2>
          </section>
        ) : null}
        {data?.items.length ? (
          <ul className='grid gap-cluster'>
            {data.items.map((item) => (
              <li key={item.id}>
                <Link
                  className='block rounded-panel border border-default p-page'
                  to='/concepts/$conceptId'
                  params={{ conceptId: item.id }}
                >
                  <h2 className='text-subtitle text-primary'>{item.title}</h2>
                  <p className='text-body text-subtle'>{item.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </Container>
  );
}
