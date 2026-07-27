/** 문제 목록의 API 지원 필터를 URL 검색값에 직접 연결한다 */
import type { QuestionListFacets } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';
import type { QuestionListSearch } from '../model/questionListSearch';

interface QuestionFiltersProps {
  facets: QuestionListFacets;
  onChange: (patch: Partial<QuestionListSearch>) => void;
  onReset: () => void;
  search: QuestionListSearch;
}

/** 데스크톱 고정 필터와 모바일 Sheet가 같은 검증 검색값을 사용한다 */
export function QuestionFilters({
  facets,
  onChange,
  onReset,
  search,
}: QuestionFiltersProps) {
  return (
    <>
      <div className='hidden rounded-panel border border-default bg-surface p-page md:block'>
        <FilterFields
          facets={facets}
          onChange={onChange}
          onReset={onReset}
          search={search}
        />
      </div>
      <div className='md:hidden'>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type='button'
              variant='outline'
            >
              필터 열기
            </Button>
          </SheetTrigger>
          <SheetContent
            className='bg-surface'
            side='bottom'
            showCloseButton={false}
          >
            <SheetHeader>
              <SheetTitle>문제 필터</SheetTitle>
              <SheetDescription>
                URL에 저장할 문제 조건을 선택하세요.
              </SheetDescription>
            </SheetHeader>
            <div className='grid gap-cluster p-page'>
              <FilterFields
                facets={facets}
                onChange={onChange}
                onReset={onReset}
                search={search}
              />
              <SheetClose asChild>
                <Button
                  type='button'
                  variant='outline'
                >
                  필터 닫기
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function FilterFields({
  facets,
  onChange,
  onReset,
  search,
}: QuestionFiltersProps) {
  const questionTypeOptions = facets.questionTypes.filter(
    (questionType) =>
      search.majorCategory === undefined ||
      questionType.majorCategory === search.majorCategory,
  );
  const selectedQuestionType = facets.questionTypes.find(
    (questionType) => questionType.id === search.questionTypeId,
  );

  return (
    <div className='grid gap-cluster'>
      <FilterSelect
        disabled={facets.majorCategories.length === 0}
        label='대분류'
        onValueChange={(value) => {
          const majorCategory =
            value === 'ALL'
              ? undefined
              : (value as NonNullable<QuestionListSearch['majorCategory']>);
          // 선택 유형이 다음 대분류에 속하지 않으면 URL 조건도 함께 해제한다.
          const questionTypeId =
            search.questionTypeId === undefined ||
            majorCategory === undefined ||
            selectedQuestionType?.majorCategory === majorCategory
              ? search.questionTypeId
              : undefined;

          onChange({ majorCategory, questionTypeId });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          ...facets.majorCategories.map((category) => ({
            label: category.label,
            value: category.value,
          })),
        ]}
        value={search.majorCategory ?? 'ALL'}
      />
      <FilterSelect
        label='영역'
        onValueChange={(value) => {
          onChange({
            skill:
              value === 'ALL' ? undefined : (value as 'LISTENING' | 'READING'),
          });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          { label: '읽기', value: 'READING' },
          { label: '듣기', value: 'LISTENING' },
        ]}
        value={search.skill ?? 'ALL'}
      />
      <FilterSelect
        disabled={questionTypeOptions.length === 0}
        label='문제 유형'
        onValueChange={(value) => {
          onChange({ questionTypeId: value === 'ALL' ? undefined : value });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          ...questionTypeOptions.map((questionType) => ({
            label: questionType.displayName,
            value: questionType.id,
          })),
        ]}
        value={search.questionTypeId ?? 'ALL'}
      />
      <FilterSelect
        disabled={facets.topics.length === 0}
        label='주제'
        onValueChange={(value) => {
          onChange({ topicId: value === 'ALL' ? undefined : value });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          ...facets.topics.map((topic) => ({
            label: topic.displayName,
            value: topic.id,
          })),
        ]}
        value={search.topicId ?? 'ALL'}
      />
      <FilterSelect
        disabled={facets.tags.length === 0}
        label='태그'
        onValueChange={(value) => {
          onChange({ tagId: value === 'ALL' ? undefined : value });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          ...facets.tags.map((tag) => ({
            label: tag.displayName,
            value: tag.id,
          })),
        ]}
        value={search.tagId ?? 'ALL'}
      />
      <FilterSelect
        label='난이도'
        onValueChange={(value) => {
          onChange({
            difficulty: value === 'ALL' ? undefined : Number(value),
          });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          ...[1, 2, 3, 4, 5].map((value) => ({
            label: String(value),
            value: String(value),
          })),
        ]}
        value={search.difficulty?.toString() ?? 'ALL'}
      />
      <FilterSelect
        label='저장 상태'
        onValueChange={(value) => {
          onChange({ saved: value === 'ALL' ? undefined : value === 'SAVED' });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          { label: '저장함', value: 'SAVED' },
          { label: '저장 안 함', value: 'NOT_SAVED' },
        ]}
        value={toSavedFilterValue(search.saved)}
      />
      <FilterSelect
        label='첫 풀이 결과'
        onValueChange={(value) => {
          onChange({
            firstResult:
              value === 'ALL'
                ? undefined
                : (value as 'CORRECT' | 'INCORRECT' | 'UNANSWERED'),
          });
        }}
        options={[
          { label: '전체', value: 'ALL' },
          { label: '정답', value: 'CORRECT' },
          { label: '오답', value: 'INCORRECT' },
          { label: '미풀이', value: 'UNANSWERED' },
        ]}
        value={search.firstResult ?? 'ALL'}
      />
      <FilterSelect
        label='페이지당 문제'
        onValueChange={(value) => {
          onChange({ pageSize: Number(value) });
        }}
        options={[20, 50, 100].map((value) => ({
          label: `${value}개`,
          value: String(value),
        }))}
        value={String(search.pageSize)}
      />
      <Button
        onClick={onReset}
        type='button'
        variant='outline'
      >
        필터 초기화
      </Button>
    </div>
  );
}

function toSavedFilterValue(saved: boolean | undefined) {
  if (saved === undefined) {
    return 'ALL';
  }
  return saved ? 'SAVED' : 'NOT_SAVED';
}

function FilterSelect({
  disabled = false,
  label,
  onValueChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className='grid gap-cluster'>
      <Label>{label}</Label>
      <Select
        disabled={disabled}
        onValueChange={onValueChange}
        value={disabled ? 'EMPTY' : value}
      >
        <SelectTrigger
          aria-label={label}
          className='w-full'
        >
          {disabled ? '선택할 항목이 없습니다.' : <SelectValue />}
        </SelectTrigger>
        <SelectContent>
          {disabled ? (
            <SelectItem value='EMPTY'>선택할 항목이 없습니다.</SelectItem>
          ) : (
            options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
