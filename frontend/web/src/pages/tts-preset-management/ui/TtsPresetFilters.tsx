/** TTS preset query·enabled·pagination 입력을 표현한다 */
import type { TtsVoicePresetListResponse } from '@flex-thia/contracts';
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
import type { TtsPresetSearch } from '../model/ttsPresetSearch';

/** preset filter 입력을 URL 검색 patch로 변환한다 */
export function TtsPresetFilters({
  onChange,
  search,
}: {
  onChange: (patch: Partial<TtsPresetSearch>) => void;
  search: TtsPresetSearch;
}) {
  return (
    <div className='grid gap-cluster rounded-panel border border-default bg-surface p-page md:grid-cols-3'>
      <div className='grid gap-cluster'>
        <Label htmlFor='tts-preset-query'>preset 검색</Label>
        <Input
          defaultValue={search.query ?? ''}
          id='tts-preset-query'
          key={search.query ?? 'empty'}
          onBlur={(event) => {
            const query = event.currentTarget.value.trim();
            onChange({ query: query || undefined });
          }}
        />
      </div>
      <div className='grid gap-cluster'>
        <Label>enabled 상태</Label>
        <Select
          onValueChange={(value) =>
            onChange({
              enabled: value === 'ALL' ? undefined : value === 'ENABLED',
            })
          }
          value={toEnabledFilterValue(search.enabled)}
        >
          <SelectTrigger aria-label='enabled 상태'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>전체</SelectItem>
            <SelectItem value='ENABLED'>enabled</SelectItem>
            <SelectItem value='DISABLED'>disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-cluster'>
        <Label>페이지당 preset</Label>
        <Select
          onValueChange={(value) => onChange({ pageSize: Number(value) })}
          value={String(search.pageSize)}
        >
          <SelectTrigger aria-label='페이지당 preset'>
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

/** preset page 이전·다음 이동을 URL page 변경으로 전달한다 */
export function TtsPresetPagination({
  onPageChange,
  page,
}: {
  onPageChange: (page: number) => void;
  page: TtsVoicePresetListResponse['page'];
}) {
  return (
    <nav
      aria-label='TTS preset 목록 페이지'
      className='flex items-center justify-between gap-cluster'
    >
      <Button
        disabled={page.page <= 1}
        onClick={() => onPageChange(page.page - 1)}
        type='button'
        variant='outline'
      >
        이전
      </Button>
      <span className='text-body text-subtle'>
        {page.page} / {page.totalPages}
      </span>
      <Button
        disabled={page.page >= page.totalPages}
        onClick={() => onPageChange(page.page + 1)}
        type='button'
        variant='outline'
      >
        다음
      </Button>
    </nav>
  );
}

function toEnabledFilterValue(enabled: boolean | undefined) {
  if (enabled === undefined) return 'ALL';
  return enabled ? 'ENABLED' : 'DISABLED';
}
