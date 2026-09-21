import { useLatestSavedExtraction } from '@/features/vocabulary-extraction/hooks/vocabulary-extraction/useExtractionReview';
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
  const latest = useLatestSavedExtraction();
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

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <h1 className='text-title text-primary'>어휘 관리</h1>
        <RecentSavedVocabulary latest={latest} />
        <h2 className='text-title'>전체 단어</h2>
        {data.items.length === 0 && (
          <p className='text-subtle'>
            {search.query || search.kind || search.status
              ? '조건에 맞는 어휘가 없습니다.'
              : '등록된 어휘가 없습니다.'}
          </p>
        )}
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

function RecentSavedVocabulary({
  latest,
}: {
  latest: ReturnType<typeof useLatestSavedExtraction>;
}) {
  return (
    <section
      className='grid gap-section'
      aria-label='최근 저장한 단어'
    >
      <div className='grid gap-cluster'>
        <h2 className='text-title'>최근 저장한 단어</h2>
        <p className='text-caption text-subtle'>
          새 추출 결과를 최종 저장하면 이 목록이 바뀌어요. 이전 단어는 전체
          목록에 유지돼요.
        </p>
      </div>
      {latest.isPending && (
        <p role='status'>최근 저장 결과를 불러오고 있어요.</p>
      )}
      {latest.isError && (
        <div>
          <p>최근 저장 결과를 불러오지 못했어요.</p>
          <Button
            variant='outline'
            onClick={() => void latest.refetch()}
          >
            다시 불러오기
          </Button>
        </div>
      )}
      {latest.data?.receipt ? (
        <>
          <p className='text-caption text-subtle'>
            {latest.data.sourceName} ·{' '}
            {new Date(latest.data.receipt.savedAt).toLocaleString('ko-KR')}
          </p>
          {(['NEW_WORD', 'NEW_MEANING'] as const).map((kind) => {
            const items = (latest.data?.receipt.items ?? []).filter(
              (item) => item.classification === kind,
            );
            return (
              <section
                key={kind}
                className='grid gap-cluster'
              >
                <h3 className='font-semibold'>
                  {kind === 'NEW_WORD' ? '신규 단어' : '뜻 추가 단어'} ·{' '}
                  {new Set(items.map((item) => item.vocabularyId)).size}개
                </h3>
                <div className='grid grid-cols-1 gap-cluster sm:grid-cols-2'>
                  {items.map((item) => (
                    <Link
                      key={item.meaningId}
                      to='/admin/vocabularies/$vocabularyId'
                      params={{ vocabularyId: item.vocabularyId }}
                      search={{ page: 1, pageSize: 20 }}
                      className='flex min-w-none items-center gap-cluster rounded-control border border-default p-cluster transition-colors duration-feedback hover:bg-surface-muted focus-visible:outline focus-visible:outline-ring'
                    >
                      <span
                        lang='th'
                        className='font-thai max-w-word-label truncate font-semibold'
                      >
                        {item.thai}
                      </span>
                      <span>:</span>
                      <span className='min-w-none truncate'>
                        {item.meaningKo}
                      </span>
                    </Link>
                  ))}
                </div>
                {!items.length && (
                  <p className='text-caption text-subtle'>
                    해당하는 단어가 없어요.
                  </p>
                )}
              </section>
            );
          })}
        </>
      ) : (
        !latest.isPending &&
        !latest.isError && (
          <p className='text-subtle'>최종 저장한 추출 작업이 없어요.</p>
        )
      )}
    </section>
  );
}
