/** TTS job item을 desktop table과 mobile record로 표현한다 */
import type { TtsJobDetailResponse } from '@flex-thia/contracts';
import { PlayTtsAudioButton } from '@/features/play-tts-audio';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

type Item = TtsJobDetailResponse['items'][number];

/** 동일 item 배열을 desktop과 mobile breakpoint 표현에 공급한다 */
export function TtsJobItemRecords({ items }: { items: Item[] }) {
  return (
    <>
      <DesktopItems items={items} />
      <MobileItems items={items} />
    </>
  );
}

function DesktopItems({ items }: { items: Item[] }) {
  return (
    <div className='hidden md:block'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>상태</TableHead>
            <TableHead>대상</TableHead>
            <TableHead>시도</TableHead>
            <TableHead>오류</TableHead>
            <TableHead>행동</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <ItemStatus status={item.status} />
              </TableCell>
              <TableCell>{item.target.text}</TableCell>
              <TableCell>{item.attempt}</TableCell>
              <TableCell>{item.errorCode ?? '-'}</TableCell>
              <TableCell>
                <ItemActions item={item} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileItems({ items }: { items: Item[] }) {
  return (
    <ul
      aria-label='모바일 TTS 항목 목록'
      className='grid gap-cluster md:hidden'
    >
      {items.map((item) => (
        <li
          className='grid gap-cluster rounded-panel border border-default bg-surface p-page'
          key={item.id}
        >
          <ItemStatus status={item.status} />
          <p>{item.target.text}</p>
          <p className='text-caption text-subtle'>
            시도 {item.attempt} · {item.errorCode ?? '오류 없음'}
          </p>
          <ItemActions item={item} />
        </li>
      ))}
    </ul>
  );
}

function ItemActions({ item }: { item: Item }) {
  if (item.status === 'SUCCEEDED') {
    return <PlayTtsAudioButton itemId={item.id} />;
  }
  return null;
}

function ItemStatus({ status }: { status: Item['status'] }) {
  return (
    <Badge variant={status === 'FAILED' ? 'destructive' : 'secondary'}>
      {status}
    </Badge>
  );
}

/** 항목 page 이전·다음 이동을 URL page 변경으로 전달한다 */
export function TtsJobItemPagination({
  onPageChange,
  page,
}: {
  onPageChange: (page: number) => void;
  page: TtsJobDetailResponse['itemPage'];
}) {
  return (
    <nav
      aria-label='TTS 작업 항목 페이지'
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
