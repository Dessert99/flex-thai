import { useContentImportDetail } from '@/features/content-production/hooks/content-import-detail/useContentImportDetail';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
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
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function ContentImportDetailPage(
  pageInput: Parameters<typeof useContentImportDetail>[0],
) {
  const { data, error, loading, onRetry } = useContentImportDetail(pageInput);

  if (loading) {
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            가져오기 결과를 불러오고 있습니다.
          </p>
        </section>
      </Container>
    );
  }

  if (error || data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>가져오기 결과를 불러오지 못했습니다.</p>
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

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <header className='space-y-cluster'>
          <h1 className='text-title text-primary'>가져오기 결과</h1>
          <p className='text-body text-subtle'>
            {new Date(data.completedAt).toLocaleString('ko-KR')}
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>처리 요약</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-cluster'>
            <Badge variant='outline'>어휘 {data.vocabularyCount}</Badge>

            <Badge variant='secondary'>가져옴 {data.importedCount}</Badge>
            <Badge variant='outline'>거절됨 {data.rejectedCount}</Badge>
          </CardContent>
        </Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>종류</TableHead>
              <TableHead>원본 순서</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>결과</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={`${item.kind}-${item.sourceIndex}`}>
                <TableCell>
                  {item.kind === 'VOCABULARY' ? '어휘' : '문제'}
                </TableCell>
                <TableCell>{item.sourceIndex + 1}</TableCell>
                <TableCell>
                  {item.status === 'IMPORTED' ? '가져옴' : '거절됨'}
                </TableCell>
                <TableCell>
                  {item.status === 'IMPORTED'
                    ? item.targetId
                    : item.errors.map(({ path, code }) => (
                        <span
                          className='block'
                          key={`${path}-${code}`}
                        >
                          {path} · {code}
                        </span>
                      ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </Container>
  );
}
