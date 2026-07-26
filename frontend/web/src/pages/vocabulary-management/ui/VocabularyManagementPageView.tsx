/** 관리자 어휘 목록과 검색 결과 상태를 dense record로 표현한다 */
import type { AdminVocabularyListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import type { AdminVocabularySearch } from '../model/adminVocabularySearch';

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
  if (loading) return <PageLoading message='관리 어휘를 불러오고 있습니다.' />;
  if (error || data === undefined) {
    return (
      <PageError
        message='관리 어휘 목록을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    const filtered = Boolean(search.query || search.kind || search.status);
    return (
      <PageEmpty
        title={
          filtered ? '조건에 맞는 어휘가 없습니다.' : '등록된 어휘가 없습니다.'
        }
      />
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
                <a
                  className='font-thai text-primary underline'
                  href={`/admin/vocabularies/${item.id}`}
                  lang='th'
                >
                  {item.thai}
                </a>
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
