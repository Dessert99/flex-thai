/** 문제 목록의 API 지원 필터를 URL 검색값에 직접 연결한다 */
import { z } from 'zod';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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
  onChange: (patch: Partial<QuestionListSearch>) => void;
  onReset: () => void;
  search: QuestionListSearch;
}

/** 데스크톱 고정 필터와 모바일 Sheet가 같은 검증 검색값을 사용한다 */
export function QuestionFilters({
  onChange,
  onReset,
  search,
}: QuestionFiltersProps) {
  return (
    <>
      <div className='hidden rounded-panel border border-default bg-surface p-page md:block'>
        <FilterFields
          idPrefix='desktop'
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
                idPrefix='mobile'
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
  idPrefix,
  onChange,
  onReset,
  search,
}: QuestionFiltersProps & { idPrefix: string }) {
  const questionTypeId = `${idPrefix}-question-type-id`;

  return (
    <div className='grid gap-cluster'>
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
      <QuestionTypeIdFilter
        id={questionTypeId}
        onChange={onChange}
        value={search.questionTypeId}
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

function QuestionTypeIdFilter({
  id,
  onChange,
  value,
}: {
  id: string;
  onChange: (patch: Partial<QuestionListSearch>) => void;
  value: string | undefined;
}) {
  return (
    <div className='grid gap-cluster'>
      <Label htmlFor={id}>문제 유형 ID</Label>
      <Input
        defaultValue={value ?? ''}
        id={id}
        key={value ?? 'empty'}
        onBlur={(event) => {
          const nextValue = event.currentTarget.value.trim();
          if (nextValue === '' || z.uuid().safeParse(nextValue).success) {
            onChange({ questionTypeId: nextValue || undefined });
          } else {
            event.currentTarget.value = value ?? '';
          }
        }}
        placeholder='UUID를 입력하세요'
      />
    </div>
  );
}

function FilterSelect({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className='grid gap-cluster'>
      <Label>{label}</Label>
      <Select
        onValueChange={onValueChange}
        value={value}
      >
        <SelectTrigger
          aria-label={label}
          className='w-full'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
