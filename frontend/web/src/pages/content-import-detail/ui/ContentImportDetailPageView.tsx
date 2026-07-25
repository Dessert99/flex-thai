/** 콘텐츠 가져오기 요약과 항목별 독립 처리 결과를 표현한다 */
import type { ContentImportDetailResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

interface ContentImportDetailPageViewProps {
  data: ContentImportDetailResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}

/** HTTP 성공 안의 imported/rejected 항목을 모두 정상 결과로 렌더링한다 */
export function ContentImportDetailPageView({
  data,
  error,
  loading,
  onRetry,
}: ContentImportDetailPageViewProps) {
  if (loading) {
    return <PageLoading message='가져오기 결과를 불러오고 있습니다.' />;
  }
  if (error || data === undefined) {
    return (
      <PageError
        message='가져오기 결과를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }

  return (
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
          <Badge variant='outline'>문제 {data.questionCount}</Badge>
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
  );
}
