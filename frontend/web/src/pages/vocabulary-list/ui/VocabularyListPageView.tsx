/** 어휘 검색과 태국어 원문 목록 상태를 표현한다 */
import type { VocabularyListResponse } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import type { VocabularyListSearch } from '../model/vocabularyListSearch';

interface VocabularyListPageViewProps {
  data: VocabularyListResponse | undefined;
  error: boolean;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
  search: VocabularyListSearch;
}

/** 서버 원문을 재구성하지 않고 상세 링크로 렌더링한다 */
export function VocabularyListPageView({
  data,
  error,
  loading,
  onQueryChange,
  onRetry,
  search,
}: VocabularyListPageViewProps) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>어휘 찾기</h1>
      <form
        className='flex gap-cluster'
        onSubmit={(event) => {
          event.preventDefault();
          const query = new FormData(event.currentTarget).get('query');
          onQueryChange(typeof query === 'string' ? query.trim() : '');
        }}
      >
        <Input
          aria-label='어휘 검색어'
          defaultValue={search.query ?? ''}
          name='query'
        />
        <Button type='submit'>검색</Button>
      </form>
      {loading ? <PageLoading message='어휘를 불러오고 있습니다.' /> : null}
      {error ? (
        <PageError
          message='어휘 목록을 불러오지 못했습니다.'
          onRetry={onRetry}
        />
      ) : null}
      {!loading && !error && data?.items.length === 0 ? (
        <PageEmpty title='조건에 맞는 어휘가 없습니다.' />
      ) : null}
      {data?.items.length ? (
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
      ) : null}
    </section>
  );
}
