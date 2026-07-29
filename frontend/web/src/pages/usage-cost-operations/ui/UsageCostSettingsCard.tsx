/** 비용 경고 설정의 편집 상태와 충돌·실패 안내를 독립적으로 표현한다 */
import { useState } from 'react';
import type { OperationsCostSettingsResponse } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';

interface UsageCostSettingsCardProps {
  conflict: boolean;
  loading: boolean;
  onRetry: () => void;
  onSave: (input: {
    warningUsd: string;
    criticalUsd: string;
    expectedUpdatedAt: string;
  }) => void;
  queryError: boolean;
  saveError: boolean;
  saving: boolean;
  settings: OperationsCostSettingsResponse | undefined;
}

/** 조회 성공값을 기준으로 비용 경고 설정을 편집하고 저장한다 */
// eslint-disable-next-line complexity -- 조회·저장·충돌 상태를 서로 독립적으로 표시한다.
export function UsageCostSettingsCard({
  conflict,
  loading,
  onRetry,
  onSave,
  queryError,
  saveError,
  saving,
  settings,
}: UsageCostSettingsCardProps) {
  const [warningUsd, setWarningUsd] = useState(settings?.warningUsd ?? '');
  const [criticalUsd, setCriticalUsd] = useState(settings?.criticalUsd ?? '');

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
        {queryError ? (
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
        {!loading && !queryError && settings ? (
          <>
            {conflict ? (
              <p
                className='text-body text-subtle'
                role='alert'
              >
                다른 관리자가 기준을 변경했습니다. 최신 값을 확인하세요.
              </p>
            ) : null}
            {saveError ? (
              <p
                className='text-body text-subtle'
                role='alert'
              >
                경고 기준을 저장하지 못했습니다.
              </p>
            ) : null}
            <Input
              aria-label='경고 기준 USD'
              inputMode='decimal'
              onChange={(event) => setWarningUsd(event.target.value)}
              value={warningUsd}
            />
            <Input
              aria-label='위험 기준 USD'
              inputMode='decimal'
              onChange={(event) => setCriticalUsd(event.target.value)}
              value={criticalUsd}
            />
            <Button
              disabled={saving}
              onClick={() =>
                onSave({
                  warningUsd,
                  criticalUsd,
                  expectedUpdatedAt: settings.updatedAt,
                })
              }
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
