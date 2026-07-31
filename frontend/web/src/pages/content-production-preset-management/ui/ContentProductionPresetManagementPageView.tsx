/** 콘텐츠 제작 preset의 모든 immutable version과 현재 운영 상태를 표현한다 */
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { ContentProductionPresetForm } from '@/features/manage-content-production-presets';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

export interface ContentProductionPresetManagementPageViewProps {
  conflict: boolean;
  data?: { items: ContentProductionPresetVersion[] };
  error: boolean;
  loading: boolean;
  pending: boolean;
  selected?: ContentProductionPresetVersion;
  onCreate: Parameters<typeof ContentProductionPresetForm>[0]['onCreate'];
  onCreateVersion: Parameters<
    typeof ContentProductionPresetForm
  >[0]['onCreateVersion'];
  onRetry: () => void;
  onSelect: (preset: ContentProductionPresetVersion) => void;
  onSetEnabled: (preset: ContentProductionPresetVersion) => void;
}

/** disabled history도 숨기지 않고 revision과 생성 시각을 함께 보여준다 */
export function ContentProductionPresetManagementPageView(
  props: ContentProductionPresetManagementPageViewProps,
) {
  if (props.loading)
    return <PageLoading message='Preset 버전을 불러오고 있습니다.' />;
  if (props.error && !props.data) {
    return (
      <PageError
        message='Preset 버전을 불러오지 못했습니다.'
        onRetry={props.onRetry}
      />
    );
  }
  return (
    <section className='grid gap-section'>
      <header>
        <h1 className='text-title text-primary'>콘텐츠 제작 preset</h1>
        <p className='text-body text-subtle'>
          저장된 버전은 수정하지 않고 새 버전을 추가합니다.
        </p>
      </header>
      {props.conflict ? (
        <PageError
          message='다른 관리자가 먼저 변경했습니다. 최신 revision을 확인해 주세요.'
          onRetry={props.onRetry}
        />
      ) : null}
      {!props.data || props.data.items.length === 0 ? (
        <PageEmpty title='등록된 preset 버전이 없습니다.' />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>목적</TableHead>
              <TableHead>버전</TableHead>
              <TableHead>revision</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>생성 시각</TableHead>
              <TableHead>운영</TableHead>
              <TableHead>버전 추가</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.data.items.map((preset) => (
              <TableRow key={`${preset.id}-${preset.version}`}>
                <TableCell>{preset.name}</TableCell>
                <TableCell>{preset.purpose}</TableCell>
                <TableCell>v{preset.version}</TableCell>
                <TableCell>{preset.revision}</TableCell>
                <TableCell>
                  <Badge>{preset.enabled ? '활성' : '비활성'}</Badge>
                </TableCell>
                <TableCell>
                  {new Date(preset.createdAt).toLocaleString('ko-KR')}
                </TableCell>
                <TableCell>
                  <Button
                    disabled={props.pending}
                    onClick={() => props.onSetEnabled(preset)}
                    size='sm'
                    type='button'
                    variant='outline'
                  >
                    {preset.enabled ? '비활성화' : '활성화'}
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    disabled={props.pending}
                    onClick={() => props.onSelect(preset)}
                    size='sm'
                    type='button'
                    variant='outline'
                  >
                    vNext
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ContentProductionPresetForm
        {...(props.selected ? { base: props.selected } : {})}
        key={
          props.selected
            ? `${props.selected.id}-${props.selected.version}`
            : 'new-preset'
        }
        onCreate={props.onCreate}
        onCreateVersion={props.onCreateVersion}
        pending={props.pending}
      />
    </section>
  );
}
