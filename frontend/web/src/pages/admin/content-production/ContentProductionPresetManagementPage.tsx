import { ContentProductionPresetForm } from '@/features/content-production/components/manage-content-production-presets/ContentProductionPresetForm';
import { useContentProductionPresetManagement } from '@/features/content-production/hooks/content-production-preset-management/useContentProductionPresetManagement';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/table';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function ContentProductionPresetManagementPage() {
  const props = useContentProductionPresetManagement();

  if (props.loading)
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            Preset 버전을 불러오고 있습니다.
          </p>
        </section>
      </Container>
    );

  if (props.error && !props.data) {
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>Preset 버전을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={props.onRetry}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <header>
          <h1 className='text-title text-primary'>콘텐츠 제작 preset</h1>
          <p className='text-body text-subtle'>
            저장된 버전은 수정하지 않고 새 버전을 추가합니다.
          </p>
        </header>
        {props.conflict ? (
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>
                다른 관리자가 먼저 변경했습니다. 최신 revision을 확인해 주세요.
              </p>
              <Button
                className='mt-cluster w-auto'
                onClick={props.onRetry}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {!props.data || props.data.items.length === 0 ? (
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>
              등록된 preset 버전이 없습니다.
            </h2>
          </section>
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
    </Container>
  );
}
