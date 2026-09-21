import { useVocabularyList } from '@/features/learning/hooks/vocabulary-list/useVocabularyList';
import { formatPartOfSpeech } from '@/features/learning/libs/vocabulary/formatPartOfSpeech';
import type { VocabularyListPageViewProps } from '@/features/learning/libs/vocabulary-list/vocabularyListPageTypes';
import type { VocabularyListSearch } from '@/features/learning/libs/vocabulary-list/vocabularyListSearch';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import { Container } from '@/shared/components/layouts/Container';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/shared/components/tabs';
import { Skeleton } from '@/shared/components/skeleton';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

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

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <h1 className='text-title text-primary'>어휘 찾기</h1>
        <p className='text-body text-subtle'>
          자료에서 추출해 저장한 단어와 뜻을 살펴보세요.
        </p>
        <Tabs
          value={search.section ?? 'all'}
          onValueChange={(section) =>
            onFilterChange({
              section: section as VocabularyListSearch['section'],
            })
          }
        >
          <TabsList
            aria-label='단어 분류'
            className='h-auto flex-wrap'
          >
            <TabsTrigger value='all'>모든 단어</TabsTrigger>
            <TabsTrigger value='recent'>최근에 추출한 단어</TabsTrigger>
            <TabsTrigger value='new-meanings'>뜻이 추가된 단어</TabsTrigger>
          </TabsList>
          {(['all', 'recent', 'new-meanings'] as const).map((section) => (
            <TabsContent
              key={section}
              value={section}
              className='grid gap-section'
            >
              <p className='text-body text-subtle'>
                {
                  {
                    all: '공개된 모든 단어와 표현을 확인할 수 있어요.',
                    recent: '가장 최근에 최종 저장한 추출 작업의 단어입니다.',
                    'new-meanings':
                      '자료 추출을 통해 기존 단어에 새 뜻이 추가된 단어입니다.',
                  }[section]
                }
              </p>
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
            </TabsContent>
          ))}
        </Tabs>
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
  if (error || !data) {
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
  }
  if (data.items.length === 0) {
    return (
      <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
        <h2 className='text-title text-primary'>
          조건에 맞는 어휘가 없습니다.
        </h2>
      </section>
    );
  }
  return (
    <>
      <ul className='grid gap-cluster'>
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              className='block rounded-panel border border-default p-page'
              to='/vocabularies/$vocabularyId'
              search={{ page: 1, pageSize: 20 }}
              params={{ vocabularyId: item.id }}
            >
              <span
                className='font-thai text-title'
                lang='th'
              >
                {item.thai}
              </span>
              <ul className='mt-cluster grid gap-cluster'>
                {item.meanings.map((meaning) => (
                  <li
                    key={meaning.id}
                    className='text-body'
                  >
                    {meaning.partOfSpeech && (
                      <span className='mr-cluster text-subtle'>
                        {formatPartOfSpeech(meaning.partOfSpeech)}
                      </span>
                    )}
                    {meaning.meaningKo}
                  </li>
                ))}
              </ul>
            </Link>
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
