/** 관리자 어휘 목록과 검색 결과 상태를 dense record로 표현한다 */
import { Link } from '@tanstack/react-router';
import type { AdminVocabularyListResponse } from '@flex-thia/contracts/admin/vocabularies';
import { Badge } from '@/shared/components/badge';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/table';
import type { AdminVocabularySearch } from '../../libs/vocabulary-management/adminVocabularySearch';
import { Skeleton } from '@/shared/components/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';

interface Props {
  data: AdminVocabularyListResponse | undefined;
  error: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: AdminVocabularySearch;
}

/** 계약이 반환한 표기와 count만 상세 링크와 함께 렌더링한다 */
export function VocabularyManagementPageView({
  data,
  error,
  loading,
  onPageChange,
  onRetry,
  search,
}: Props) {
  if (loading)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>관리 어휘를 불러오고 있습니다.</p>
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
    );
  }
  if (data.items.length === 0) {
    const filtered = Boolean(search.query || search.kind || search.status);
    return (
      <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
        <h2 className='text-title text-primary'>
          {filtered
            ? '조건에 맞는 어휘가 없습니다.'
            : '등록된 어휘가 없습니다.'}
        </h2>
      </section>
    );
  }
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>어휘 관리</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>표기</TableHead>
            <TableHead>종류</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>뜻/발음</TableHead>
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
              <TableCell>
                {item.meaningCount}/{item.pronunciationCount}
              </TableCell>
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
  );
}
