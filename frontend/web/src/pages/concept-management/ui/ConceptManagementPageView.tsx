/** 관리자 개념 목록을 상태·최신 버전·검증 상태와 함께 표현한다 */
import type {
  AdminConceptListQuery,
  AdminConceptListResponse,
  ConceptCategory,
  CreateConceptRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

interface ConceptManagementPageViewProps {
  createMessage: string | null;
  createPending: boolean;
  data: AdminConceptListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: Partial<AdminConceptListQuery>) => void;
  onCreate: (input: CreateConceptRequest) => void;
  onRetry: () => void;
  search: AdminConceptListQuery;
}

function CreateConceptForm({
  createMessage,
  createPending,
  onCreate,
}: Pick<
  ConceptManagementPageViewProps,
  'createMessage' | 'createPending' | 'onCreate'
>) {
  const [category, setCategory] = useState<ConceptCategory>('GRAMMAR');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [paragraph, setParagraph] = useState('');
  const [position, setPosition] = useState(0);
  return (
    <form
      className='grid gap-cluster rounded-panel border p-page'
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({
          category,
          position,
          title,
          summary,
          blocks: [
            {
              kind: 'EXPLANATION',
              position: 0,
              heading: '설명',
              paragraphs: [paragraph],
            },
          ],
        });
      }}
    >
      <h2>새 개념</h2>
      <select
        aria-label='새 개념 영역'
        onChange={(event) => setCategory(event.target.value as ConceptCategory)}
        value={category}
      >
        <option value='THAI_SCRIPT_PRONUNCIATION'>태국 문자·발음</option>
        <option value='GRAMMAR'>문법</option>
      </select>
      <Input
        aria-label='새 개념 제목'
        onChange={(event) => setTitle(event.target.value)}
        required
        value={title}
      />
      <Input
        aria-label='새 개념 요약'
        onChange={(event) => setSummary(event.target.value)}
        required
        value={summary}
      />
      <Input
        aria-label='새 개념 교육 순서'
        min={0}
        onChange={(event) => setPosition(Number(event.target.value))}
        required
        type='number'
        value={position}
      />
      <Input
        aria-label='첫 설명 문단'
        onChange={(event) => setParagraph(event.target.value)}
        required
        value={paragraph}
      />
      <Button
        disabled={createPending}
        type='submit'
      >
        {createPending ? '만드는 중…' : '개념 만들기'}
      </Button>
      {createMessage ? <p role='alert'>{createMessage}</p> : null}
    </form>
  );
}

function ConceptFilters({
  onFilterChange,
  search,
}: Pick<ConceptManagementPageViewProps, 'onFilterChange' | 'search'>) {
  return (
    <div className='flex gap-cluster'>
      <select
        aria-label='개념 영역'
        onChange={(event) =>
          onFilterChange({
            category:
              event.target.value === ''
                ? undefined
                : (event.target.value as AdminConceptListQuery['category']),
            page: 1,
          })
        }
        value={search.category ?? ''}
      >
        <option value=''>전체 영역</option>
        <option value='THAI_SCRIPT_PRONUNCIATION'>태국 문자·발음</option>
        <option value='GRAMMAR'>문법</option>
      </select>
      <select
        aria-label='공개 상태'
        onChange={(event) =>
          onFilterChange({
            status:
              event.target.value === ''
                ? undefined
                : (event.target.value as AdminConceptListQuery['status']),
            page: 1,
          })
        }
        value={search.status ?? ''}
      >
        <option value=''>전체 상태</option>
        <option value='DRAFT'>초안</option>
        <option value='PUBLISHED'>게시</option>
        <option value='HIDDEN'>숨김</option>
      </select>
    </div>
  );
}

function ConceptTable({
  data,
  onFilterChange,
}: {
  data: AdminConceptListResponse;
  onFilterChange: ConceptManagementPageViewProps['onFilterChange'];
}) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>제목</th>
            <th>상태</th>
            <th>최신 버전</th>
            <th>검증</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>
                <a href={`/admin/concepts/${item.id}`}>{item.title}</a>
              </td>
              <td>{item.status}</td>
              <td>v{item.latestVersion}</td>
              <td>{item.validationStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav
        aria-label='개념 목록 페이지'
        className='flex gap-cluster'
      >
        <Button
          disabled={data.page <= 1}
          onClick={() => onFilterChange({ page: data.page - 1 })}
          type='button'
          variant='outline'
        >
          이전
        </Button>
        <span>
          {data.page} / {totalPages}
        </span>
        <Button
          disabled={data.page >= totalPages}
          onClick={() => onFilterChange({ page: data.page + 1 })}
          type='button'
          variant='outline'
        >
          다음
        </Button>
      </nav>
    </>
  );
}

/** 관리자 개념 record를 링크 가능한 표로 렌더링한다 */
export function ConceptManagementPageView(
  props: ConceptManagementPageViewProps,
) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>개념 관리</h1>
      <CreateConceptForm
        createMessage={props.createMessage}
        createPending={props.createPending}
        onCreate={props.onCreate}
      />
      <ConceptFilters
        onFilterChange={props.onFilterChange}
        search={props.search}
      />
      {props.loading ? (
        <PageLoading message='개념을 불러오고 있습니다.' />
      ) : null}
      {props.error ? (
        <PageError
          message='개념 목록을 불러오지 못했습니다.'
          onRetry={props.onRetry}
        />
      ) : null}
      {!props.loading && !props.error && props.data?.items.length === 0 ? (
        <PageEmpty title='등록된 개념이 없습니다.' />
      ) : null}
      {props.data?.items.length ? (
        <ConceptTable
          data={props.data}
          onFilterChange={props.onFilterChange}
        />
      ) : null}
    </section>
  );
}
