/** TTS 작업 항목 상태·오류·페이지 크기 filter를 표현한다 */
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import type { TtsJobItemsSearch } from '../model/ttsJobItemsSearch';

/** 항목 filter 입력을 URL 검색 patch로 변환한다 */
export function TtsJobItemFilters({
  onChange,
  search,
}: {
  onChange: (patch: Partial<TtsJobItemsSearch>) => void;
  search: TtsJobItemsSearch;
}) {
  return (
    <div className='grid gap-cluster rounded-panel border border-default bg-surface p-page md:grid-cols-3'>
      <div className='grid gap-cluster'>
        <Label>항목 상태</Label>
        <Select
          onValueChange={(value) =>
            onChange({
              status:
                value === 'ALL'
                  ? undefined
                  : (value as TtsJobItemsSearch['status']),
            })
          }
          value={search.status ?? 'ALL'}
        >
          <SelectTrigger aria-label='항목 상태'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>전체</SelectItem>
            <SelectItem value='PENDING'>대기</SelectItem>
            <SelectItem value='PROCESSING'>처리 중</SelectItem>
            <SelectItem value='SUCCEEDED'>성공</SelectItem>
            <SelectItem value='FAILED'>실패</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-cluster'>
        <Label htmlFor='tts-error-code'>오류 코드</Label>
        <Input
          defaultValue={search.errorCode ?? ''}
          id='tts-error-code'
          key={search.errorCode ?? 'empty'}
          onBlur={(event) => {
            const errorCode = event.currentTarget.value.trim().toUpperCase();
            onChange({ errorCode: errorCode || undefined });
          }}
        />
      </div>
      <div className='grid gap-cluster'>
        <Label>페이지당 항목</Label>
        <Select
          onValueChange={(value) => onChange({ pageSize: Number(value) })}
          value={String(search.pageSize)}
        >
          <SelectTrigger aria-label='페이지당 항목'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 50, 100].map((pageSize) => (
              <SelectItem
                key={pageSize}
                value={String(pageSize)}
              >
                {pageSize}개
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
