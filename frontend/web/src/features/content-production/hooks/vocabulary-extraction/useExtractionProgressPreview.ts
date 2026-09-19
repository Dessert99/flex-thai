import { useState } from 'react';
import {
  createProgressPreview,
  type ProgressScenario,
} from '@/features/content-production/libs/vocabulary-extraction/extractionProgress';

/** API를 실행하거나 작업 성공을 흉내 내지 않는 화면 검토용 상태 */
export function useExtractionProgressPreview() {
  const [scenario, setScenario] = useState<ProgressScenario>('running');
  const [feedback, setFeedback] = useState('');
  return {
    progress: createProgressPreview(scenario),
    preview: {
      scenario,
      feedback,
      onChange: (next: ProgressScenario) => {
        setScenario(next);
        setFeedback('');
      },
    },
    onRetry: () =>
      setFeedback(
        '재시도 위치를 확인하는 화면 예시예요. 실제 작업은 실행되지 않아요.',
      ),
    onReconnect: () =>
      setFeedback(
        '연결 확인 버튼의 화면 예시예요. 실제 서버에는 요청하지 않아요.',
      ),
  };
}
