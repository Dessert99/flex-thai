/** 관리자 콘텐츠 가져오기 입력과 처리 이력을 한 화면에 표현한다 */
import type { ContentImportListResponse } from '@flex-thia/contracts';
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
import type { ContentImportCommand } from '../api/contentImportQueries';
import { ContentImportForm } from './ContentImportForm';

interface ContentImportListPageViewProps {
  data: ContentImportListResponse | undefined;
  importError: unknown;
  importing: boolean;
  importSucceeded: boolean;
  listError: boolean;
  loading: boolean;
  onImport: (command: ContentImportCommand) => void;
  onImportReset: () => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

/** partial failure를 정상 처리 결과로 유지하고 상세 이력으로 연결한다 */
export function ContentImportListPageView({
  data,
  importError,
  importing,
  importSucceeded,
  listError,
  loading,
  onImport,
  onImportReset,
  onPageChange,
  onRetry,
}: ContentImportListPageViewProps) {
  return (
    <section className='grid gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title text-primary'>콘텐츠 가져오기</h1>
        <p className='text-body text-subtle'>
          계약에 맞춘 canonical JSON 파일이나 텍스트를 가져옵니다.
        </p>
      </header>
      <ContentImportForm
        error={importError}
        onReset={onImportReset}
        onSubmit={onImport}
        pending={importing}
        succeeded={importSucceeded}
      />
      <div className='grid gap-cluster'>
        <h2 className='text-title text-primary'>가져오기 이력</h2>
        {loading ? <PageLoading message='이력을 불러오고 있습니다.' /> : null}
        {listError ? (
          <PageError
            message='가져오기 이력을 불러오지 못했습니다.'
            onRetry={onRetry}
          />
        ) : null}
        {!loading && !listError && data?.items.length === 0 ? (
          <PageEmpty title='아직 가져오기 이력이 없습니다.' />
        ) : null}
        {data?.items.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>처리 시각</TableHead>
                  <TableHead>어휘</TableHead>
                  <TableHead>문제</TableHead>
                  <TableHead>가져옴</TableHead>
                  <TableHead>거절됨</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <a
                        className='text-primary underline'
                        href={`/admin/content-imports/${item.id}`}
                      >
                        {new Date(item.createdAt).toLocaleString('ko-KR')}
                      </a>
                    </TableCell>
                    <TableCell>{item.vocabularyCount}</TableCell>
                    <TableCell>{item.questionCount}</TableCell>
                    <TableCell>{item.importedCount}</TableCell>
                    <TableCell>{item.rejectedCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <nav
              aria-label='콘텐츠 가져오기 이력 페이지'
              className='flex items-center justify-between gap-cluster'
            >
              <Button
                disabled={data.page.page <= 1}
                onClick={() => onPageChange(data.page.page - 1)}
                type='button'
                variant='outline'
              >
                이전
              </Button>
              <span className='text-body text-subtle'>
                {data.page.page} / {data.page.totalPages}
              </span>
              <Button
                disabled={data.page.page >= data.page.totalPages}
                onClick={() => onPageChange(data.page.page + 1)}
                type='button'
                variant='outline'
              >
                다음
              </Button>
            </nav>
          </>
        ) : null}
      </div>
    </section>
  );
}
