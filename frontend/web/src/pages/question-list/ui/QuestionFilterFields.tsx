/** 문제 목록 필터를 taxonomy·학습 상태 책임으로 나눠 URL 검색값을 갱신한다 */
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
import type { QuestionListSearch } from '../model/questionListSearch';

interface QuestionFilterFieldsProps {
  facets: QuestionListFacets;
  onChange: (patch: Partial<QuestionListSearch>) => void;
  onReset: () => void;
  search: QuestionListSearch;
}

interface FilterSelectProps {
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}

/** taxonomy와 학습 상태의 필터 입력을 같은 URL 검색값에 연결한다 */
export function QuestionFilterFields(props: QuestionFilterFieldsProps) {
  return (
    <div className='grid gap-cluster'>
      <QuestionTypeFilters {...props} />
      <TaxonomyFacetFilters {...props} />
      <LearningStateFilters {...props} />
      <PageSizeFilter {...props} />
      <Button
        onClick={props.onReset}
        type='button'
        variant='outline'
      >
        필터 초기화
      </Button>
    </div>
  );
}

function QuestionTypeFilters({
  facets,
  onChange,
  search,
}: QuestionFilterFieldsProps) {
  const questionTypeOptions = facets.questionTypes.filter(
    (questionType) =>
      search.majorCategory === undefined ||
      questionType.majorCategory === search.majorCategory,
  );
  const selectedQuestionType = facets.questionTypes.find(
    (questionType) => questionType.id === search.questionTypeId,
  );

  return (
    <>
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
    </>
  );
}

function TaxonomyFacetFilters({
  facets,
  onChange,
  search,
}: QuestionFilterFieldsProps) {
  return (
    <>
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
    </>
  );
}

function LearningStateFilters({ onChange, search }: QuestionFilterFieldsProps) {
  return (
    <>
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
        label='난이도'
        onValueChange={(value) => {
          onChange({ difficulty: value === 'ALL' ? undefined : Number(value) });
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
    </>
  );
}

function PageSizeFilter({ onChange, search }: QuestionFilterFieldsProps) {
  return (
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
}: FilterSelectProps) {
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
