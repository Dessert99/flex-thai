/** 사용량·비용 기간과 provider 실행 필터를 안전한 URL 상태로 적용한다 */
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import type { UsageCostSearch } from '../model/usageCostSearch';

interface UsageCostFiltersProps {
  search: UsageCostSearch;
  onChange: (patch: Partial<UsageCostSearch>) => void;
}

const statusOptions = [
  { label: '전체 상태', value: undefined },
  { label: '실행 중', value: 'STARTED' },
  { label: '성공', value: 'SUCCEEDED' },
  { label: '실패', value: 'FAILED' },
  { label: '결과 불명', value: 'OUTCOME_UNKNOWN' },
] as const;

const toDatetimeLocal = (iso: string | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromDatetimeLocal = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** 날짜 쌍과 실행 속성 필터를 partial range 없이 반영한다 */
// eslint-disable-next-line complexity -- 독립 필터의 선택 상태를 한 카드에서 표현한다.
export function UsageCostFilters({ onChange, search }: UsageCostFiltersProps) {
  const [from, setFrom] = useState(() => toDatetimeLocal(search.from));
  const [to, setTo] = useState(() => toDatetimeLocal(search.to));
  const completeRange =
    (from === '' && to === '') || (from !== '' && to !== '');
  const orderedRange = from === '' || to === '' || from < to;

  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>조회 조건</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-control md:grid-cols-2 lg:grid-cols-4'>
        <Input
          aria-label='시작 시각'
          onChange={(event) => setFrom(event.target.value)}
          type='datetime-local'
          value={from}
        />
        <Input
          aria-label='종료 시각'
          onChange={(event) => setTo(event.target.value)}
          type='datetime-local'
          value={to}
        />
        <Button
          disabled={!completeRange || !orderedRange}
          onClick={() =>
            onChange({
              from: fromDatetimeLocal(from),
              to: fromDatetimeLocal(to),
            })
          }
          type='button'
          variant='outline'
        >
          조회 조건 적용
        </Button>
        <Input
          aria-label='Provider'
          onChange={(event) =>
            onChange({ provider: event.target.value || undefined })
          }
          placeholder='Provider'
          value={search.provider ?? ''}
        />
        <Input
          aria-label='Model'
          onChange={(event) =>
            onChange({ model: event.target.value || undefined })
          }
          placeholder='Model'
          value={search.model ?? ''}
        />
        <Input
          aria-label='Voice'
          disabled={search.source === 'AI'}
          onChange={(event) =>
            onChange({ voice: event.target.value || undefined })
          }
          placeholder='Voice'
          value={search.voice ?? ''}
        />
        <div className='flex gap-control'>
          <Button
            onClick={() => onChange({ source: undefined, voice: undefined })}
            variant={search.source === undefined ? 'default' : 'outline'}
          >
            전체
          </Button>
          <Button
            onClick={() => onChange({ source: 'AI', voice: undefined })}
            variant={search.source === 'AI' ? 'default' : 'outline'}
          >
            AI
          </Button>
          <Button
            onClick={() => onChange({ source: 'TTS' })}
            variant={search.source === 'TTS' ? 'default' : 'outline'}
          >
            TTS
          </Button>
        </div>
        <div className='flex flex-wrap gap-control'>
          {statusOptions.map((option) => (
            <Button
              key={option.label}
              onClick={() => onChange({ status: option.value })}
              variant={search.status === option.value ? 'default' : 'outline'}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
