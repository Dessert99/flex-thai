/** 관리자에게 기간별 AI·TTS 비용과 월간 경고 설정을 함께 보여준다 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import {
  updateOperationsCostSettings,
  usageCostOverviewQueryOptions,
  usageCostQueryKey,
  usageCostSettingsQueryKey,
  usageCostSettingsQueryOptions,
} from '../api/usageCostQueries';
import type { UsageCostSearch } from '../model/usageCostSearch';
import { UsageCostFilters } from './UsageCostFilters';
import { UsageCostSettingsCard } from './UsageCostSettingsCard';

interface UsageCostOperationsPageProps {
  search: UsageCostSearch;
  onSearchChange: (search: UsageCostSearch) => void;
}

/** URL filter·overview·settings mutation을 조립하는 화면 */
// eslint-disable-next-line max-lines-per-function -- 독립 query와 화면 전용 카드를 한 route page에서 조립한다.
export function UsageCostOperationsPage({
  search,
  onSearchChange,
}: UsageCostOperationsPageProps) {
  const overview = useQuery(usageCostOverviewQueryOptions(search));
  const settings = useQuery(usageCostSettingsQueryOptions());
  const queryClient = useQueryClient();
  const [settingsConflict, setSettingsConflict] = useState(false);
  const update = useMutation({
    mutationFn: updateOperationsCostSettings,
    onError: async (error) => {
      if (
        isApiError(error) &&
        error.detail.kind === 'problem' &&
        error.detail.problem.status === 409
      ) {
        setSettingsConflict(true);
        await queryClient.invalidateQueries({
          exact: true,
          queryKey: usageCostSettingsQueryKey,
        });
      }
    },
    onSuccess: async () => {
      setSettingsConflict(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usageCostQueryKey }),
        queryClient.invalidateQueries({ queryKey: usageCostSettingsQueryKey }),
      ]);
    },
  });

  const changeSearch = (patch: Partial<UsageCostSearch>) =>
    onSearchChange({ ...search, ...patch });

  if (overview.isPending) {
    return <PageLoading message='사용량·비용을 불러오고 있습니다.' />;
  }
  if (overview.isError || !overview.data) {
    return (
      <PageError
        message='사용량·비용을 불러오지 못했습니다.'
        onRetry={() => void overview.refetch()}
      />
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
    <section className='grid gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title text-primary'>AI·TTS 사용량·비용</h1>
        <p className='text-body text-subtle'>
          provider 실행 기록을 기준으로 예상 비용과 운영 대기 상태를 확인합니다.
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
          label='검토 대기 후보'
          value={String(overview.data.pendingReviewCandidateCount)}
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
  );
}

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

/** provider/model/voice 비용 breakdown을 표로 표현한다 */
function BreakdownTable({
  breakdown,
}: {
  breakdown: Array<{
    source: 'AI' | 'TTS';
    provider: string;
    model: string;
    voice: string | null;
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
                  <th scope='col'>Voice</th>
                  <th scope='col'>실행 수</th>
                  <th scope='col'>예상 비용(USD)</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item) => (
                  <tr
                    key={`${item.source}:${item.provider}:${item.model}:${item.voice ?? ''}`}
                  >
                    <td>{item.source}</td>
                    <td>{item.provider}</td>
                    <td>{item.model}</td>
                    <td>{item.voice ?? '없음'}</td>
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
