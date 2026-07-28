/** TTS 작업 상태·기간 filter를 URL 검색 patch로 변환한다 */
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
import type { TtsOperationsSearch } from '../model/ttsOperationsSearch';

/** TTS 작업 API가 지원하는 상태와 ISO 기간 filter를 표시한다 */
export function TtsOperationsFilters({
  onChange,
  onReset,
  search,
}: {
  onChange: (patch: Partial<TtsOperationsSearch>) => void;
  onReset: () => void;
  search: TtsOperationsSearch;
}) {
  return (
    <div className='grid gap-cluster rounded-panel border border-default bg-surface p-page md:grid-cols-4'>
      <div className='grid gap-cluster'>
        <Label>TTS 작업 상태</Label>
        <Select
          onValueChange={(value) =>
            onChange({
              status:
                value === 'ALL'
                  ? undefined
                  : (value as TtsOperationsSearch['status']),
            })
          }
          value={search.status ?? 'ALL'}
        >
          <SelectTrigger aria-label='TTS 작업 상태'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>전체</SelectItem>
            <SelectItem value='QUEUED'>대기</SelectItem>
            <SelectItem value='RUNNING'>실행 중</SelectItem>
            <SelectItem value='SUCCEEDED'>성공</SelectItem>
            <SelectItem value='PARTIALLY_FAILED'>일부 실패</SelectItem>
            <SelectItem value='FAILED'>실패</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DateTimeFilter
        label='시작 시각'
        onChange={(from) => onChange({ from })}
        value={search.from}
      />
      <DateTimeFilter
        label='종료 시각'
        onChange={(to) => onChange({ to })}
        value={search.to}
      />
      <Button
        className='self-end'
        onClick={onReset}
        type='button'
        variant='outline'
      >
        필터 초기화
      </Button>
    </div>
  );
}

function DateTimeFilter({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string | undefined) => void;
  value: string | undefined;
}) {
  return (
    <div className='grid gap-cluster'>
      <Label>{label}</Label>
      <Input
        aria-label={label}
        defaultValue={value?.slice(0, 16) ?? ''}
        key={value ?? 'empty'}
        onBlur={(event) => {
          const next = event.currentTarget.value;
          onChange(next ? new Date(next).toISOString() : undefined);
        }}
        type='datetime-local'
      />
    </div>
  );
}
