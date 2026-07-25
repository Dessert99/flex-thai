/** 관리자 문제 API가 지원하는 모든 필터를 URL 검색 patch로 만든다 */
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
import type { AdminQuestionSearch } from '../model/adminQuestionSearch';

interface AdminQuestionFiltersProps {
  onChange: (patch: Partial<AdminQuestionSearch>) => void;
  onReset: () => void;
  search: AdminQuestionSearch;
}

/** dense 관리 필터가 서버에 없는 상태나 정렬을 만들지 않게 제한한다 */
export function AdminQuestionFilters({
  onChange,
  onReset,
  search,
}: AdminQuestionFiltersProps) {
  return (
    <div className='grid gap-cluster rounded-panel border border-default bg-surface p-page md:grid-cols-4'>
      <QuestionStateFilters
        onChange={onChange}
        search={search}
      />
      <QuestionMetadataFilters
        onChange={onChange}
        onReset={onReset}
        search={search}
      />
    </div>
  );
}

function QuestionStateFilters({
  onChange,
  search,
}: Pick<AdminQuestionFiltersProps, 'onChange' | 'search'>) {
  return (
    <>
      <FilterSelect
        label='문제 상태'
        onValueChange={(value) =>
          onChange({
            status:
              value === 'ALL'
                ? undefined
                : (value as 'DRAFT' | 'HIDDEN' | 'PUBLISHED'),
          })
        }
        options={[
          { label: '전체', value: 'ALL' },
          { label: '초안', value: 'DRAFT' },
          { label: '게시', value: 'PUBLISHED' },
          { label: '숨김', value: 'HIDDEN' },
        ]}
        value={search.status ?? 'ALL'}
      />
      <FilterSelect
        label='버전 상태'
        onValueChange={(value) =>
          onChange({
            versionStatus:
              value === 'ALL'
                ? undefined
                : (value as 'DRAFT' | 'INVALIDATED' | 'PUBLISHED' | 'RETIRED'),
          })
        }
        options={[
          { label: '전체', value: 'ALL' },
          { label: '초안', value: 'DRAFT' },
          { label: '게시', value: 'PUBLISHED' },
          { label: '폐기', value: 'RETIRED' },
          { label: '무효화', value: 'INVALIDATED' },
        ]}
        value={search.versionStatus ?? 'ALL'}
      />
      <FilterSelect
        label='검증 상태'
        onValueChange={(value) =>
          onChange({
            validationStatus:
              value === 'ALL'
                ? undefined
                : (value as 'FAILED' | 'PASSED' | 'PENDING'),
          })
        }
        options={[
          { label: '전체', value: 'ALL' },
          { label: '대기', value: 'PENDING' },
          { label: '통과', value: 'PASSED' },
          { label: '실패', value: 'FAILED' },
        ]}
        value={search.validationStatus ?? 'ALL'}
      />
    </>
  );
}

function QuestionMetadataFilters({
  onChange,
  onReset,
  search,
}: AdminQuestionFiltersProps) {
  return (
    <>
      <FilterSelect
        label='영역'
        onValueChange={(value) =>
          onChange({
            skill:
              value === 'ALL' ? undefined : (value as 'LISTENING' | 'READING'),
          })
        }
        options={[
          { label: '전체', value: 'ALL' },
          { label: '읽기', value: 'READING' },
          { label: '듣기', value: 'LISTENING' },
        ]}
        value={search.skill ?? 'ALL'}
      />
      <div className='grid gap-cluster'>
        <Label htmlFor='admin-question-type-slug'>문제 유형 slug</Label>
        <Input
          defaultValue={search.questionTypeSlug ?? ''}
          id='admin-question-type-slug'
          key={search.questionTypeSlug ?? 'empty'}
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            onChange({ questionTypeSlug: value || undefined });
          }}
        />
      </div>
      <FilterSelect
        label='난이도'
        onValueChange={(value) =>
          onChange({
            difficulty: value === 'ALL' ? undefined : Number(value),
          })
        }
        options={[
          { label: '전체', value: 'ALL' },
          ...[1, 2, 3, 4, 5].map((value) => ({
            label: String(value),
            value: String(value),
          })),
        ]}
        value={String(search.difficulty ?? 'ALL')}
      />
      <FilterSelect
        label='페이지당 문제'
        onValueChange={(value) => onChange({ pageSize: Number(value) })}
        options={[20, 50, 100].map((value) => ({
          label: `${value}개`,
          value: String(value),
        }))}
        value={String(search.pageSize)}
      />
      <Button
        className='self-end'
        onClick={onReset}
        type='button'
        variant='outline'
      >
        필터 초기화
      </Button>
    </>
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
