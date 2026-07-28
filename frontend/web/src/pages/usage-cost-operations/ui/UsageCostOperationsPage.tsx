/** 관리자에게 기간별 AI·TTS 비용과 월간 경고 설정을 함께 보여준다 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import {
  updateOperationsCostSettings,
  usageCostOverviewQueryOptions,
  usageCostQueryKey,
  usageCostSettingsQueryKey,
  usageCostSettingsQueryOptions,
} from '../api/usageCostQueries';
import type { UsageCostSearch } from '../model/usageCostSearch';

interface UsageCostOperationsPageProps {
  search: UsageCostSearch;
  onSearchChange: (search: UsageCostSearch) => void;
}

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

/** URL filter·overview·settings mutation을 조립하는 화면 */
export function UsageCostOperationsPage({
  search,
  onSearchChange,
}: UsageCostOperationsPageProps) {
  const overview = useQuery(usageCostOverviewQueryOptions(search));
  const settings = useQuery(usageCostSettingsQueryOptions());
  const queryClient = useQueryClient();
  const [warningUsd, setWarningUsd] = useState('');
  const [criticalUsd, setCriticalUsd] = useState('');
  const update = useMutation({
    mutationFn: updateOperationsCostSettings,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usageCostQueryKey }),
        queryClient.invalidateQueries({ queryKey: usageCostSettingsQueryKey }),
      ]);
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setWarningUsd(settings.data.warningUsd);
    setCriticalUsd(settings.data.criticalUsd);
  }, [settings.data]);

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

  const saveSettings = () => {
    if (!settings.data) return;
    update.mutate({
      warningUsd,
      criticalUsd,
      expectedUpdatedAt: settings.data.updatedAt,
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
      <SettingsCard
        criticalUsd={criticalUsd}
        error={settings.isError || update.isError}
        loading={settings.isPending}
        onCriticalUsdChange={setCriticalUsd}
        onRetry={() => void settings.refetch()}
        onSave={saveSettings}
        onWarningUsdChange={setWarningUsd}
        saving={update.isPending}
        warningUsd={warningUsd}
      />
    </section>
  );
}

/** 기간·출처·provider filter를 URL 상태로 반영한다 */
function UsageCostFilters({
  onChange,
  search,
}: {
  onChange: (patch: Partial<UsageCostSearch>) => void;
  search: UsageCostSearch;
}) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>조회 조건</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-control md:grid-cols-2 lg:grid-cols-4'>
        <Input
          aria-label='시작 시각'
          onChange={(event) =>
            onChange({ from: fromDatetimeLocal(event.target.value) })
          }
          type='datetime-local'
          value={toDatetimeLocal(search.from)}
        />
        <Input
          aria-label='종료 시각'
          onChange={(event) =>
            onChange({ to: fromDatetimeLocal(event.target.value) })
          }
          type='datetime-local'
          value={toDatetimeLocal(search.to)}
        />
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
      </CardContent>
    </Card>
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

/** overview 상태와 분리해 비용 경고 기준을 수정한다 */
function SettingsCard({
  criticalUsd,
  error,
  loading,
  onCriticalUsdChange,
  onRetry,
  onSave,
  onWarningUsdChange,
  saving,
  warningUsd,
}: {
  criticalUsd: string;
  error: boolean;
  loading: boolean;
  onCriticalUsdChange: (value: string) => void;
  onRetry: () => void;
  onSave: () => void;
  onWarningUsdChange: (value: string) => void;
  saving: boolean;
  warningUsd: string;
}) {
  return (
    <Card className='rounded-panel border-default bg-surface'>
      <CardHeader>
        <CardTitle className='text-title'>비용 경고 기준</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-control'>
        {loading ? (
          <p className='text-body text-subtle'>
            경고 기준을 불러오고 있습니다.
          </p>
        ) : null}
        {error ? (
          <div className='flex items-center gap-control'>
            <p className='text-body text-subtle'>
              경고 기준을 불러오지 못했습니다.
            </p>
            <Button
              onClick={onRetry}
              variant='outline'
            >
              다시 시도
            </Button>
          </div>
        ) : null}
        {!loading && !error ? (
          <>
            <Input
              aria-label='경고 기준 USD'
              inputMode='decimal'
              onChange={(event) => onWarningUsdChange(event.target.value)}
              value={warningUsd}
            />
            <Input
              aria-label='위험 기준 USD'
              inputMode='decimal'
              onChange={(event) => onCriticalUsdChange(event.target.value)}
              value={criticalUsd}
            />
            <Button
              disabled={saving}
              onClick={onSave}
              type='button'
            >
              경고 기준 저장
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
