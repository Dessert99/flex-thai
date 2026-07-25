/** 문제 목록의 로딩·빈 결과·오류·페이지 상태를 접근 가능한 UI로 표현한다 */
import type { QuestionListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  hasQuestionListFilters,
  type QuestionListSearch,
} from '../model/questionListSearch';
import { QuestionFilters } from './QuestionFilters';

interface QuestionListPageViewProps {
  data: QuestionListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: Partial<QuestionListSearch>) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  search: QuestionListSearch;
}

/** URL 필터와 서버 페이지 결과를 별도 클라이언트 목록 없이 렌더링한다 */
export function QuestionListPageView({
  data,
  error,
  loading,
  onFilterChange,
  onPageChange,
  onResetFilters,
  onRetry,
  search,
}: QuestionListPageViewProps) {
  return (
    <section
      aria-labelledby='question-list-title'
      className='flex flex-col gap-section'
    >
      <header className='space-y-cluster'>
        <h1
          className='text-title text-primary'
          id='question-list-title'
        >
          문제 찾기
        </h1>
        <p className='text-body text-subtle'>
          영역과 난이도, 풀이 상태로 문제를 찾아보세요.
        </p>
      </header>
      <QuestionFilters
        onChange={onFilterChange}
        onReset={onResetFilters}
        search={search}
      />
      {renderQuestionState({
        data,
        error,
        loading,
        onPageChange,
        onResetFilters,
        onRetry,
        search,
      })}
    </section>
  );
}

function renderQuestionState({
  data,
  error,
  loading,
  onPageChange,
  onResetFilters,
  onRetry,
  search,
}: Omit<QuestionListPageViewProps, 'onFilterChange'>) {
  if (loading) {
    return <PageLoading message='문제를 불러오고 있습니다.' />;
  }
  if (error || data === undefined) {
    return (
      <PageError
        message='문제 목록을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    return renderEmptyState(search, onResetFilters);
  }

  return (
    <>
      <ul className='grid gap-cluster'>
        {data.items.map((question) => (
          <li key={question.questionId}>
            <Card className='rounded-panel border-default bg-surface'>
              <CardHeader>
                <CardTitle className='text-title'>
                  <a href={`/questions/${question.questionId}`}>
                    {question.questionType.displayName}
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className='flex flex-wrap gap-cluster'>
                <Badge variant='secondary'>
                  {question.skill === 'READING' ? '읽기' : '듣기'}
                </Badge>
                <Badge variant='outline'>난이도 {question.difficulty}</Badge>
                <Badge variant='outline'>
                  {toFirstResultLabel(question.firstResult)}
                </Badge>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <nav
        aria-label='문제 목록 페이지'
        className='flex items-center justify-between gap-cluster'
      >
        <Button
          disabled={data.page.page <= 1}
          onClick={() => {
            onPageChange(data.page.page - 1);
          }}
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
          onClick={() => {
            onPageChange(data.page.page + 1);
          }}
          type='button'
          variant='outline'
        >
          다음
        </Button>
      </nav>
    </>
  );
}

function renderEmptyState(
  search: QuestionListSearch,
  onResetFilters: () => void,
) {
  const filtered = hasQuestionListFilters(search);
  return (
    <PageEmpty
      action={
        filtered ? (
          <Button
            onClick={onResetFilters}
            type='button'
            variant='outline'
          >
            필터 초기화
          </Button>
        ) : undefined
      }
      description={
        filtered
          ? '다른 조건을 선택하거나 필터를 초기화해 보세요.'
          : '게시된 문제가 생기면 이곳에서 확인할 수 있습니다.'
      }
      title={
        filtered ? '조건에 맞는 문제가 없습니다.' : '게시된 문제가 없습니다.'
      }
    />
  );
}

function toFirstResultLabel(
  result: QuestionListResponse['items'][number]['firstResult'],
) {
  return {
    CORRECT: '첫 풀이 정답',
    INCORRECT: '첫 풀이 오답',
    UNANSWERED: '미풀이',
  }[result];
}
