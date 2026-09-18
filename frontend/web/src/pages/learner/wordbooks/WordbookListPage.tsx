import { WordbookActions } from '@/features/learning/components/manage-wordbook/WordbookActions';
import { WordbookForm } from '@/features/learning/components/manage-wordbook/WordbookForm';
import { useWordbookList } from '@/features/learning/hooks/wordbook-list/useWordbookList';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { WordbookListResponse } from '@flex-thia/contracts/learning/wordbooks';
import { Link } from '@tanstack/react-router';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function WordbookListPage() {
  const { wordbooks } = useWordbookList();

  if (wordbooks.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>단어장을 불러오고 있습니다.</p>
          </section>
        </>
      </Container>
    );
  }

  if (wordbooks.isError || wordbooks.data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>단어장을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void wordbooks.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <>
        <WordbookListContent items={wordbooks.data.items} />
      </>
    </Container>
  );
}
/** 단어장 생성 입력과 목록·빈 상태를 한 화면에 표현한다 */

interface WordbookListPageViewProps {
  items: WordbookListResponse['items'];
}

/** 단어장 이름·항목 수·상세 링크와 관리 행동을 표시한다 */
export function WordbookListContent({ items }: WordbookListPageViewProps) {
  return (
    <section
      aria-labelledby='wordbooks-title'
      className='grid gap-section'
    >
      <header className='grid gap-cluster'>
        <h1
          className='text-title text-primary'
          id='wordbooks-title'
        >
          내 단어장
        </h1>
        <WordbookForm />
      </header>
      {items.length === 0 ? (
        <p className='text-body text-subtle'>아직 단어장이 없습니다.</p>
      ) : (
        <ul className='grid gap-cluster'>
          {items.map((wordbook) => (
            <li key={wordbook.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{wordbook.name}</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-cluster'>
                  <p className='text-body text-subtle'>
                    {wordbook.itemCount}개 항목
                  </p>
                  <Link
                    to='/wordbooks/$wordbookId'
                    search={{ page: 1, pageSize: 20 }}
                    params={{ wordbookId: wordbook.id }}
                  >
                    {wordbook.name} 열기
                  </Link>
                  <WordbookActions
                    name={wordbook.name}
                    wordbookId={wordbook.id}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
