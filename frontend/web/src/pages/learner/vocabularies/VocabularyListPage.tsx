/** 공용 사전의 검색·필터와 태국어·뜻을 나란히 읽는 2열 목록을 조립한다. */
import { useVocabularyList } from '@/features/learning/hooks/vocabulary-list/useVocabularyList';
import { formatPartOfSpeech } from '@/features/learning/libs/vocabulary/formatPartOfSpeech';
import type { VocabularyListPageViewProps } from '@/features/learning/libs/vocabulary-list/vocabularyListPageTypes';
import type { VocabularyListSearch } from '@/features/learning/libs/vocabulary-list/vocabularyListSearch';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

// eslint-disable-next-line complexity -- 페이지에서 검색·필터·조회 상태를 함께 조립한다.
export function VocabularyListPage(
  pageInput: Parameters<typeof useVocabularyList>[0],
) {
  const {
    data,
    error,
    loading,
    onFilterChange,
    onPageChange,
    onRetry,
    search,
  } = useVocabularyList(pageInput);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const filtered = Boolean(
    search.kind || search.partOfSpeech || search.difficulty,
  );

  return (
    <Container className='max-w-content flex-1'>
      <section aria-labelledby='vocabulary-list-title'>
        <header className='mb-section'>
          <p className='mb-cluster text-caption text-subtle'>
            태국어 학습 / 사전
          </p>
          <h1
            id='vocabulary-list-title'
            className='mb-cluster text-heading text-primary'
          >
            공용 사전
          </h1>
          <p className='text-caption text-subtle'>
            태국어와 한국어로 단어의 뜻을 찾아보세요.
          </p>
        </header>
        <VocabularySearchForm
          key={search.query ?? ''}
          initialQuery={search.query ?? ''}
          onFilterChange={onFilterChange}
        />
        <div className='flex items-center justify-between gap-cluster border-b border-default pb-cluster pt-section'>
          <h2 className='text-caption font-semibold'>전체 단어</h2>
          <Button
            aria-controls={filtersId}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
            type='button'
            variant={filtered ? 'secondary' : 'outline'}
          >
            <SlidersHorizontal aria-hidden='true' />
            필터{filtered ? ' · 적용됨' : ''}
          </Button>
        </div>
        {filtersOpen && (
          <div id={filtersId}>
            <VocabularyFilters
              onFilterChange={onFilterChange}
              search={search}
            />
          </div>
        )}
        <div className='mb-cluster mt-section flex items-center justify-between gap-cluster text-caption text-subtle'>
          <p aria-live='polite'>
            {search.query ? `「${search.query}」 검색 결과` : '단어와 표현'}
            {!loading && !error && data && (
              <strong className='ml-cluster font-semibold text-primary'>
                {data.page.totalItems.toLocaleString()}
              </strong>
            )}
          </p>
          <p className='hidden sm:block'>단어를 누르면 상세 보기</p>
        </div>
        <VocabularyResults
          data={data}
          error={error}
          loading={loading}
          onPageChange={onPageChange}
          onRetry={onRetry}
          onReset={() =>
            onFilterChange({
              query: undefined,
              kind: undefined,
              partOfSpeech: undefined,
              difficulty: undefined,
            })
          }
        />
      </section>
    </Container>
  );
}

function VocabularySearchForm({
  initialQuery,
  onFilterChange,
}: Pick<VocabularyListPageViewProps, 'onFilterChange'> & {
  initialQuery: string;
}) {
  const [draft, setDraft] = useState(initialQuery);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onFilterChange({ query: draft.trim() || undefined });
  };
  return (
    <form
      role='search'
      className='flex items-center gap-cluster rounded-control border border-default bg-surface p-cluster focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring'
      onSubmit={submit}
    >
      <Search
        aria-hidden='true'
        className='size-icon shrink-0 text-subtle'
      />
      <Input
        aria-label='어휘 검색어'
        name='query'
        placeholder='태국어 또는 한국어로 검색'
        className='border-0 px-none shadow-none focus-visible:ring-0'
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      {draft && (
        <Button
          aria-label='검색어 지우기'
          type='button'
          variant='ghost'
          size='icon-sm'
          onClick={() => {
            setDraft('');
            onFilterChange({ query: undefined });
          }}
        >
          <X aria-hidden='true' />
        </Button>
      )}
      <Button type='submit'>검색</Button>
    </form>
  );
}

function VocabularyFilters({
  onFilterChange,
  search,
}: Pick<VocabularyListPageViewProps, 'onFilterChange' | 'search'>) {
  const partOfSpeechId = useId();
  return (
    <div className='grid grid-cols-2 items-end gap-cluster border-b border-default py-cluster sm:grid-cols-[1fr_1fr_1fr_auto]'>
      <Label className='grid gap-cluster'>
        어휘 종류
        <select
          className='h-control min-w-none rounded-control border border-default bg-surface px-cluster font-normal'
          value={search.kind ?? ''}
          onChange={(event) =>
            onFilterChange({
              kind:
                event.target.value === ''
                  ? undefined
                  : (event.target.value as VocabularyListSearch['kind']),
            })
          }
        >
          <option value=''>전체</option>
          <option value='WORD'>단어</option>
          <option value='EXPRESSION'>표현</option>
        </select>
      </Label>
      <Label
        className='grid gap-cluster'
        htmlFor={partOfSpeechId}
      >
        품사
        <Input
          id={partOfSpeechId}
          placeholder='전체'
          className='font-normal'
          value={search.partOfSpeech ?? ''}
          onChange={(event) =>
            onFilterChange({ partOfSpeech: event.target.value || undefined })
          }
        />
      </Label>
      <Label className='grid gap-cluster'>
        난이도
        <select
          className='h-control min-w-none rounded-control border border-default bg-surface px-cluster font-normal'
          value={search.difficulty ?? ''}
          onChange={(event) =>
            onFilterChange({
              difficulty:
                event.target.value === ''
                  ? undefined
                  : Number(event.target.value),
            })
          }
        >
          <option value=''>전체</option>
          {[1, 2, 3, 4, 5].map((difficulty) => (
            <option
              key={difficulty}
              value={difficulty}
            >
              {difficulty}
            </option>
          ))}
        </select>
      </Label>
      <Button
        type='button'
        variant='ghost'
        onClick={() =>
          onFilterChange({
            kind: undefined,
            partOfSpeech: undefined,
            difficulty: undefined,
          })
        }
      >
        초기화
      </Button>
    </div>
  );
}

function VocabularyResults({
  data,
  error,
  loading,
  onPageChange,
  onRetry,
  onReset,
}: Omit<VocabularyListPageViewProps, 'onFilterChange' | 'search'> & {
  onReset: () => void;
}) {
  if (loading)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>어휘를 불러오고 있습니다.</p>
      </section>
    );
  if (error || !data)
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>어휘 목록을 불러오지 못했습니다.</p>
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
  if (data.items.length === 0)
    return (
      <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-dashed border-default p-page text-center'>
        <Search
          aria-hidden='true'
          className='text-subtle'
        />
        <h2 className='text-title'>검색 결과가 없습니다.</h2>
        <p className='text-body text-subtle'>
          다른 단어나 필터 조건으로 다시 찾아보세요.
        </p>
        <Button
          onClick={onReset}
          type='button'
          variant='outline'
        >
          전체 단어 보기
        </Button>
      </section>
    );
  return (
    <>
      <ul
        aria-label='어휘 검색 결과'
        className='grid grid-cols-1 gap-x-section min-[701px]:grid-cols-2'
      >
        {data.items.map((item) => (
          <li
            key={item.id}
            className='min-w-none border-b border-default'
          >
            <Link
              className='grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-start gap-cluster py-cluster transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
              to='/vocabularies/$vocabularyId'
              search={{ page: 1, pageSize: 20 }}
              params={{ vocabularyId: item.id }}
            >
              <span className='flex min-w-none flex-wrap items-baseline gap-cluster'>
                <span
                  className='break-words font-thai text-title font-medium leading-relaxed'
                  lang='th'
                >
                  {item.thai}
                </span>
                {item.saved && (
                  <BookmarkCheck
                    className='size-icon shrink-0 text-subtle'
                    aria-label='단어장에 저장됨'
                  />
                )}
              </span>
              <ul className='min-w-none space-y-cluster text-caption leading-relaxed'>
                {item.meanings.map((meaning) => (
                  <li
                    key={meaning.id}
                    className='break-words'
                  >
                    {meaning.partOfSpeech && (
                      <span className='mr-cluster text-caption text-subtle'>
                        {formatPartOfSpeech(meaning.partOfSpeech)}
                      </span>
                    )}
                    <span>{meaning.meaningKo}</span>
                  </li>
                ))}
              </ul>
              <span className='flex flex-col items-end gap-cluster pt-none text-subtle'>
                <span className='whitespace-nowrap text-caption'>
                  {formatDifficulty(item.meanings)}
                </span>
                <ArrowRight
                  aria-hidden='true'
                  className='size-icon'
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <nav
        aria-label='어휘 목록 페이지'
        className='mt-section flex items-center justify-between gap-cluster'
      >
        <Button
          disabled={data.page.page <= 1}
          onClick={() => onPageChange(data.page.page - 1)}
          type='button'
          variant='outline'
        >
          <ChevronLeft aria-hidden='true' />
          이전
        </Button>
        <span className='text-caption text-subtle'>
          {data.page.page} / {data.page.totalPages}
        </span>
        <Button
          disabled={data.page.page >= data.page.totalPages}
          onClick={() => onPageChange(data.page.page + 1)}
          type='button'
          variant='outline'
        >
          다음
          <ChevronRight aria-hidden='true' />
        </Button>
      </nav>
    </>
  );
}

/** 뜻마다 다른 난이도는 범위로 표시하며, 미지정 값을 임의로 채우지 않는다. */
function formatDifficulty(
  meanings: NonNullable<
    VocabularyListPageViewProps['data']
  >['items'][number]['meanings'],
): string {
  const levels = meanings.flatMap((meaning) =>
    typeof meaning.difficulty === 'number' ? [meaning.difficulty] : [],
  );
  if (levels.length === 0) return '';
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return `난이도 ${min === max ? min : `${min}~${max}`}`;
}
