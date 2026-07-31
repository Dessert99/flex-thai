/** 어휘 검색과 태국어 원문 목록 상태를 표현한다 */
import { useState, type FormEvent } from 'react';
import type { VocabularyListResponse } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import type {
  VocabularyListFilterPatch,
  VocabularyListSearch,
} from '../model/vocabularyListSearch';

interface VocabularyListPageViewProps {
  data: VocabularyListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: VocabularyListFilterPatch) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: VocabularyListSearch;
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
    const value = draft.trim();
    onFilterChange({ query: value === '' ? undefined : value });
  };
  return (
    <form
      className='flex gap-cluster'
      onSubmit={submit}
    >
      <Input
        aria-label='어휘 검색어'
        name='query'
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      <Button type='submit'>검색</Button>
    </form>
  );
}

function VocabularyFilters({
  onFilterChange,
  search,
}: Pick<VocabularyListPageViewProps, 'onFilterChange' | 'search'>) {
  return (
    <div className='grid gap-cluster'>
      <VocabularySearchForm
        initialQuery={search.query ?? ''}
        key={search.query ?? ''}
        onFilterChange={onFilterChange}
      />
      <div className='grid gap-cluster md:grid-cols-3'>
        <Label className='grid gap-cluster'>
          어휘 종류
          <select
            className='h-control rounded-control border border-default bg-surface px-cluster'
            onChange={(event) =>
              onFilterChange({
                kind:
                  event.target.value === ''
                    ? undefined
                    : (event.target.value as VocabularyListSearch['kind']),
              })
            }
            value={search.kind ?? ''}
          >
            <option value=''>전체</option>
            <option value='WORD'>단어</option>
            <option value='EXPRESSION'>표현</option>
          </select>
        </Label>
        <Label
          className='grid gap-cluster'
          htmlFor='vocabulary-part-of-speech'
        >
          품사
          <Input
            id='vocabulary-part-of-speech'
            onChange={(event) =>
              onFilterChange({
                partOfSpeech:
                  event.target.value === '' ? undefined : event.target.value,
              })
            }
            value={search.partOfSpeech ?? ''}
          />
        </Label>
        <Label className='grid gap-cluster'>
          난이도
          <select
            className='h-control rounded-control border border-default bg-surface px-cluster'
            onChange={(event) =>
              onFilterChange({
                difficulty:
                  event.target.value === ''
                    ? undefined
                    : Number(event.target.value),
              })
            }
            value={search.difficulty ?? ''}
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
      </div>
    </div>
  );
}

function VocabularyResults({
  data,
  error,
  loading,
  onPageChange,
  onRetry,
}: Omit<VocabularyListPageViewProps, 'onFilterChange' | 'search'>) {
  if (loading) return <PageLoading message='어휘를 불러오고 있습니다.' />;
  if (error || !data) {
    return (
      <PageError
        message='어휘 목록을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    return <PageEmpty title='조건에 맞는 어휘가 없습니다.' />;
  }
  return (
    <>
      <ul className='grid gap-cluster'>
        {data.items.map((item) => (
          <li key={item.id}>
            <a
              className='block rounded-panel border border-default p-page'
              href={`/vocabularies/${item.id}`}
            >
              <span
                className='font-thai text-title'
                lang='th'
              >
                {item.thai}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <nav
        aria-label='어휘 목록 페이지'
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
  );
}

/** 서버 원문을 재구성하지 않고 URL filter·page와 상세 링크를 렌더링한다 */
export function VocabularyListPageView({
  data,
  error,
  loading,
  onFilterChange,
  onPageChange,
  onRetry,
  search,
}: VocabularyListPageViewProps) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>어휘 찾기</h1>
      <VocabularyFilters
        onFilterChange={onFilterChange}
        search={search}
      />
      <VocabularyResults
        data={data}
        error={error}
        loading={loading}
        onPageChange={onPageChange}
        onRetry={onRetry}
      />
    </section>
  );
}
