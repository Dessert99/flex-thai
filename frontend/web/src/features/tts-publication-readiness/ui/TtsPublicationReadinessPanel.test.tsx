/** validation과 분리된 TTS readiness blocker 표현을 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { TtsPublicationReadinessPanel } from './TtsPublicationReadinessPanel';

describe('TTS 게시 readiness 패널', () => {
  it('FAILED blocker와 연결 TTS 작업을 표시한다', () => {
    renderWithProviders(
      <TtsPublicationReadinessPanel
        readiness={{
          ready: false,
          requiredCount: 2,
          readyCount: 1,
          blockers: [
            {
              kind: 'THAI_SENTENCE_VERSION',
              targetId: '00000000-0000-4000-8000-000000000001',
              mediaStatus: 'FAILED',
              operation: {
                jobId: '00000000-0000-4000-8000-000000000002',
                itemId: '00000000-0000-4000-8000-000000000003',
                itemStatus: 'FAILED',
                attempt: 2,
                errorCode: 'TTS_PROVIDER_TIMEOUT',
                retryable: true,
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('필수 음성이 준비되지 않았습니다.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'TTS 작업 보기' })).toHaveAttribute(
      'href',
      '/admin/tts/jobs/00000000-0000-4000-8000-000000000002',
    );
  });
});
