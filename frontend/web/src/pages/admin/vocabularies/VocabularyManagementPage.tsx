import { useVocabularyManagement } from '@/features/learning/hooks/vocabulary-management/useVocabularyManagement';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/table';
import { Link } from '@tanstack/react-router';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function VocabularyManagementPage(
  pageInput: Parameters<typeof useVocabularyManagement>[0],
) {
  const { data, error, loading, onPageChange, onRetry, search } =
    useVocabularyManagement(pageInput);

  if (loading)
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            관리 어휘를 불러오고 있습니다.
          </p>
        </section>
      </Container>
    );

  if (error || data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>관리 어휘 목록을 불러오지 못했습니다.</p>
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
      </Container>
    );
  }

  if (data.items.length === 0) {
    const filtered = Boolean(search.query || search.kind || search.status);
    return (
      <Container className='max-w-content flex-1'>
        <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
          <h2 className='text-title text-primary'>
            {filtered
              ? '조건에 맞는 어휘가 없습니다.'
              : '등록된 어휘가 없습니다.'}
          </h2>
        </section>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <h1 className='text-title text-primary'>어휘 관리</h1>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>표기</TableHead>
              <TableHead>종류</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>뜻</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    className='font-thai text-primary underline'
                    to='/admin/vocabularies/$vocabularyId'
                    search={{ page: 1, pageSize: 20 }}
                    params={{ vocabularyId: item.id }}
                    lang='th'
                  >
                    {item.thai}
                  </Link>
                </TableCell>
                <TableCell>{item.kind === 'WORD' ? '단어' : '표현'}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.status === 'HIDDEN' ? 'destructive' : 'secondary'
                    }
                  >
                    {
                      {
                        DRAFT: '초안',
                        HIDDEN: '숨김',
                        MERGED: '병합됨',
                        PUBLISHED: '게시',
                      }[item.status]
                    }
                  </Badge>
                </TableCell>
                <TableCell>{item.meaningCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <nav
          className='flex justify-between'
          aria-label='관리자 어휘 페이지'
        >
          <Button
            disabled={data.page.page <= 1}
            onClick={() => onPageChange(data.page.page - 1)}
            type='button'
            variant='outline'
          >
            이전
          </Button>
          <Button
            disabled={data.page.page >= data.page.totalPages}
            onClick={() => onPageChange(data.page.page + 1)}
            type='button'
            variant='outline'
          >
            다음
          </Button>
        </nav>
      </section>
    </Container>
  );
}
