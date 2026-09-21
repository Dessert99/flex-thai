import { UsageCostFilters } from '@/features/operations/components/usage-cost-operations/UsageCostFilters';
import { UsageCostSettingsCard } from '@/features/operations/components/usage-cost-operations/UsageCostSettingsCard';
import { useUsageCostOperations } from '@/features/operations/hooks/usage-cost-operations/useUsageCostOperations';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

/** 단일 운영 수치를 일관된 card로 표현한다 */
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-body'>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-title text-primary'>{value}</p>
      </CardContent>
    </Card>
  );
}

/** provider/model 비용 breakdown을 표로 표현한다 */
function BreakdownTable({
  breakdown,
}: {
  breakdown: Array<{
    source: 'AI';
    provider: string;
    model: string;
    runCount: number;
    estimatedCostUsd: string;
  }>;
}) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>Provider별 비용</CardTitle>
      </CardHeader>
      <CardContent>
        {breakdown.length === 0 ? (
          <p className='text-body text-subtle'>
            조건에 맞는 실행 기록이 없습니다.
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-body'>
              <thead>
                <tr>
                  <th scope='col'>출처</th>
                  <th scope='col'>Provider</th>
                  <th scope='col'>Model</th>
                  <th scope='col'>실행 수</th>
                  <th scope='col'>예상 비용(USD)</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item) => (
                  <tr key={`${item.source}:${item.provider}:${item.model}:`}>
                    <td>{item.source}</td>
                    <td>{item.provider}</td>
                    <td>{item.model}</td>
                    <td>{item.runCount}</td>
                    <td>{item.estimatedCostUsd} USD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export function UsageCostOperationsPage(
  pageInput: Parameters<typeof useUsageCostOperations>[0],
) {
  const {
    search,
    overview,
    settings,
    settingsConflict,
    setSettingsConflict,
    update,
    changeSearch,
  } = useUsageCostOperations(pageInput);

  if (overview.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>
              사용량·비용을 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>사용량·비용을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void overview.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  const saveSettings = (input: {
    warningUsd: string;
    criticalUsd: string;
    expectedUpdatedAt: string;
  }) => {
    setSettingsConflict(false);
    update.mutate({
      ...input,
      requestId: crypto.randomUUID(),
    });
  };

  return (
    <Container className='max-w-content flex-1'>
      <>
        <section className='grid gap-section'>
          <header className='space-y-cluster'>
            <h1 className='text-title text-primary'>AI 사용량·비용</h1>
            <p className='text-body text-subtle'>
              provider 실행 기록을 기준으로 예상 비용과 운영 대기 상태를
              확인합니다.
            </p>
          </header>
          <UsageCostFilters
            key={`${search.from ?? ''}:${search.to ?? ''}`}
            onChange={changeSearch}
            search={search}
          />
          <div className='grid gap-section md:grid-cols-2 lg:grid-cols-4'>
            <MetricCard
              label='조회 기간 예상 비용'
              value={`${overview.data.estimatedCostUsd} USD`}
            />
            <MetricCard
              label='실행 중 작업'
              value={String(overview.data.inProgressJobCount)}
            />
            <MetricCard
              label='실패 실행'
              value={String(overview.data.failedRunCount)}
            />
            <MetricCard
              label='저장 대기 추출'
              value={String(overview.data.pendingSaveExtractionCount)}
            />
          </div>
          <Card className='rounded-panel border-default bg-surface'>
            <CardHeader>
              <CardTitle className='text-title'>현재 월 예상 비용</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-cluster'>
              <p className='text-body text-primary'>
                {overview.data.currentMonthThreshold.estimatedCostUsd} USD
              </p>
              <p className='text-body text-subtle'>
                경고 상태:{' '}
                <strong>{overview.data.currentMonthThreshold.status}</strong>
              </p>
            </CardContent>
          </Card>
          <BreakdownTable breakdown={overview.data.breakdown} />
          <UsageCostSettingsCard
            key={
              settings.data
                ? `${settings.data.updatedAt}:${settings.data.warningUsd}:${settings.data.criticalUsd}`
                : 'usage-cost-settings'
            }
            conflict={settingsConflict}
            loading={settings.isPending}
            onRetry={() => void settings.refetch()}
            onSave={saveSettings}
            queryError={settings.isError}
            saveError={update.isError && !settingsConflict}
            saving={update.isPending}
            settings={settings.data}
          />
        </section>
      </>
    </Container>
  );
}
