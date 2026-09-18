import { WordbookItemActions } from '@/features/learning/components/manage-wordbook-items/WordbookItemActions';
import { useWordbookDetail } from '@/features/learning/hooks/wordbook-detail/useWordbookDetail';
import type { WordbookDetailSearch } from '@/features/learning/libs/wordbook-detail/wordbookDetailSearch';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type { WordbookItemListResponse } from '@flex-thia/contracts/learning/wordbooks';
import { useState, type FormEvent } from 'react';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function WordbookDetailPage(
  pageInput: Parameters<typeof useWordbookDetail>[0],
) {
  const {
    onSearchChange,
    search,
    wordbookId,
    detail,
    wordbooks,
    selectedIds,
    setSelectedIds,
    toggleSelection,
  } = useWordbookDetail(pageInput);

  return (
    <Container className='max-w-content flex-1'>
      <>
        <div className='grid gap-section'>
          <WordbookDetailContent
            data={detail.data}
            error={detail.isError}
            loading={detail.isPending}
            onRetry={() => void detail.refetch()}
            onSearchChange={onSearchChange}
            onSelectionChange={toggleSelection}
            onSelectPage={() =>
              setSelectedIds(
                new Set(detail.data?.items.map(({ id }) => id) ?? []),
              )
            }
            search={search}
            selectedIds={selectedIds}
          />
          <WordbookItemActions
            onConfirmed={() => setSelectedIds(new Set())}
            selectedIds={[...selectedIds]}
            sourceWordbookId={wordbookId}
            wordbooks={
              wordbooks.data?.items.map(({ id, name }) => ({ id, name })) ?? []
            }
          />
        </div>
      </>
    </Container>
  );
}
/** 단어장 상세의 검색·페이지·선택과 상태 화면을 표현한다 */

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

export function WordbookDetailContent({
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
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>
          단어장 항목을 불러오고 있습니다.
        </p>
      </section>
    );
  }
  if (error || data === undefined) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>단어장 항목을 불러오지 못했습니다.</p>
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
