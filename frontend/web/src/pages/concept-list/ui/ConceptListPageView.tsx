/** 게시 개념을 영역 탭과 카드 목록으로 표현한다 */
import type {
  ConceptCategory,
  ConceptListResponse,
} from '@flex-thia/contracts';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

interface ConceptListPageViewProps {
  category: ConceptCategory;
  data: ConceptListResponse | undefined;
  error: boolean;
  loading: boolean;
  onCategoryChange: (category: ConceptCategory) => void;
  onRetry: () => void;
}

/** 태국 문자·발음과 문법 개념을 같은 카드 구조로 렌더링한다 */
export function ConceptListPageView({
  category,
  data,
  error,
  loading,
  onCategoryChange,
  onRetry,
}: ConceptListPageViewProps) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>개념 학습</h1>
      <div
        aria-label='개념 영역'
        className='flex gap-cluster'
        role='tablist'
      >
        {[
          ['THAI_SCRIPT_PRONUNCIATION', '태국 문자·발음'],
          ['GRAMMAR', '문법'],
        ].map(([value, label]) => (
          <button
            aria-selected={category === value}
            key={value}
            onClick={() => onCategoryChange(value as ConceptCategory)}
            role='tab'
            type='button'
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? <PageLoading message='개념을 불러오고 있습니다.' /> : null}
      {error ? (
        <PageError
          message='개념 목록을 불러오지 못했습니다.'
          onRetry={onRetry}
        />
      ) : null}
      {!loading && !error && data?.items.length === 0 ? (
        <PageEmpty title='게시된 개념이 없습니다.' />
      ) : null}
      {data?.items.length ? (
        <ul className='grid gap-cluster'>
          {data.items.map((item) => (
            <li key={item.id}>
              <a
                className='block rounded-panel border border-default p-page'
                href={`/concepts/${item.id}`}
              >
                <h2 className='text-subtitle text-primary'>{item.title}</h2>
                <p className='text-body text-subtle'>{item.summary}</p>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
