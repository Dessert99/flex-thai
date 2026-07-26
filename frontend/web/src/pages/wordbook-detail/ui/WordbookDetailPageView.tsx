/** 단어장 상세의 검색·페이지·선택과 상태 화면을 표현한다 */
import type { WordbookItemListResponse } from '@flex-thia/contracts';
import { type FormEvent, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import type { WordbookDetailSearch } from '../model/wordbookDetailSearch';

interface WordbookDetailPageViewProps {
  data: WordbookItemListResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  onSearchChange: (search: WordbookDetailSearch) => void;
  onSelectionChange: (vocabularyId: string) => void;
  onSelectPage: () => void;
  search: WordbookDetailSearch;
  selectedIds: Set<string>;
}

/** 서버 검색값과 현재 page selection을 사용자 행동으로 연결한다 */
// 검색·선택·페이지 접근성 상태를 같은 presentational 경계에서 표현한다.
// eslint-disable-next-line max-lines-per-function
export function WordbookDetailPageView({
  data,
  error,
  loading,
  onRetry,
  onSearchChange,
  onSelectionChange,
  onSelectPage,
  search,
  selectedIds,
}: WordbookDetailPageViewProps) {
  const [query, setQuery] = useState(search.query ?? '');
  if (loading) {
    return <PageLoading message='단어장 항목을 불러오고 있습니다.' />;
  }
  if (error || data === undefined) {
    return (
      <PageError
        message='단어장 항목을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    onSearchChange({
      ...search,
      page: 1,
      ...(trimmed.length === 0 ? { query: undefined } : { query: trimmed }),
    });
  };

  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>{data.wordbook.name}</h1>
      <form
        className='flex gap-cluster'
        onSubmit={submitSearch}
      >
        <label
          className='grow'
          htmlFor='wordbook-detail-query'
        >
          <span className='sr-only'>단어장 검색</span>
          <Input
            aria-label='단어장 검색'
            id='wordbook-detail-query'
            onChange={(event) => setQuery(event.target.value)}
            value={query}
          />
        </label>
        <Button type='submit'>검색</Button>
      </form>
      <div className='grid gap-cluster text-body'>
        <span>종류</span>
        <select
          aria-label='종류'
          onChange={(event) =>
            onSearchChange({
              ...search,
              page: 1,
              kind:
                event.target.value === ''
                  ? undefined
                  : (event.target.value as 'EXPRESSION' | 'WORD'),
            })
          }
          value={search.kind ?? ''}
        >
          <option value=''>전체</option>
          <option value='WORD'>단어</option>
          <option value='EXPRESSION'>표현</option>
        </select>
      </div>
      {data.items.length === 0 ? (
        <p className='text-body text-subtle'>조건에 맞는 어휘가 없습니다.</p>
      ) : (
        <>
          <Button
            onClick={onSelectPage}
            type='button'
            variant='outline'
          >
            현재 페이지 전체 선택
          </Button>
          <ul className='grid gap-cluster'>
            {data.items.map((item) => (
              <li
                className='flex items-center justify-between rounded-panel border border-default p-page'
                key={item.id}
              >
                <span
                  className='font-thai text-title'
                  lang='th'
                >
                  {item.thai}
                </span>
                <Button
                  aria-pressed={selectedIds.has(item.id)}
                  onClick={() => onSelectionChange(item.id)}
                  type='button'
                  variant='outline'
                >
                  {selectedIds.has(item.id) ? '선택 해제' : '선택'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <nav
        aria-label='단어장 페이지'
        className='flex gap-cluster'
      >
        <Button
          disabled={data.page.page <= 1}
          onClick={() =>
            onSearchChange({ ...search, page: data.page.page - 1 })
          }
          type='button'
          variant='outline'
        >
          이전
        </Button>
        <Button
          disabled={data.page.page >= data.page.totalPages}
          onClick={() =>
            onSearchChange({ ...search, page: data.page.page + 1 })
          }
          type='button'
          variant='outline'
        >
          다음
        </Button>
      </nav>
    </section>
  );
}
