import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractionJobKeys,
  getExtractionJob,
  getExtractionResults,
  retryExtractionJob,
} from '@/features/content-production/apis/vocabulary-extraction/extractionJobApi';
import type { ExtractionProgress } from '@/features/content-production/libs/vocabulary-extraction/extractionProgress';
import type { ExtractionJobResponse } from '@flex-thia/contracts/content-production/vocabulary-extraction';
export const EXTRACTION_POLL_MS = 3000;
export function extractionPollInterval(
  job: ExtractionJobResponse | undefined,
  errorCount = 0,
) {
  if (errorCount)
    return Math.min(30000, 5000 * 2 ** Math.min(errorCount - 1, 3));
  return job && ['failed', 'stopped', 'complete'].includes(job.status)
    ? false
    : EXTRACTION_POLL_MS;
}
export function useExtractionJob(id: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: extractionJobKeys.detail(id),
    queryFn: ({ signal }) => getExtractionJob(id, signal),
    retry: false,
    refetchInterval: (q) =>
      extractionPollInterval(
        q.state.data,
        q.state.status === 'error' ? q.state.errorUpdateCount : 0,
      ),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
  const retry = useMutation({
    mutationFn: () => retryExtractionJob(id),
    onSuccess: (job) => client.setQueryData(extractionJobKeys.detail(id), job),
  });
  const results = useQuery({
    queryKey: [...extractionJobKeys.detail(id), 'results'],
    queryFn: () => getExtractionResults(id),
    enabled: query.data?.status === 'complete',
  });
  return {
    query,
    retry,
    results,
    progress: query.data
      ? toProgress(query.data, query.isError, query.dataUpdatedAt)
      : null,
  };
}
function toProgress(
  job: ExtractionJobResponse,
  disconnected: boolean,
  checkedAt: number,
): ExtractionProgress {
  const remaining = job.total - job.completed;
  return {
    sourceName: job.sourceName,
    total: job.total,
    completed: job.completed,
    stage: job.stage,
    status: job.status,
    compared: job.compared,
    disconnected,
    lastChecked: new Date(checkedAt).toLocaleTimeString('ko-KR'),
    issue: {
      title:
        [
          '자료를 준비하지 못했어요',
          '단어 추출이 멈췄어요',
          '기존 단어 대조가 멈췄어요',
        ][job.stage] ?? '결과 정리가 멈췄어요',
      description:
        job.status === 'stopped'
          ? `작업 중단을 확인했어요. 완료한 ${job.completed}개는 저장했고 미완료 부분부터 이어서 처리할 수 있어요.`
          : failureDescription(job, remaining),
    },
  };
}
function failureDescription(job: ExtractionJobResponse, remaining: number) {
  if (job.error === 'AI_NOT_CONFIGURED')
    return '서버의 AI 제공사·모델·API 키 설정을 확인한 뒤 다시 시도하세요.';
  if (job.error === 'AI_REQUEST_REJECTED')
    return 'AI 제공사가 요청을 거절했어요. 모델·키와 사용 권한을 확인한 뒤 다시 시도하세요.';
  if (job.error?.startsWith('SOURCE_'))
    return '자료를 읽지 못했어요. 공개 웹페이지 또는 읽을 수 있는 PDF·이미지인지 확인하세요. 다른 자료는 자료 입력 화면에서 새 작업으로 제출하세요.';
  if (job.stage === 2)
    return '추출 결과는 저장했어요. 기존 단어와 뜻의 대조부터 다시 시도할 수 있어요.';
  return `처리 중 오류가 발생했어요. 완료한 ${job.completed}개는 저장했고 남은 ${remaining}개부터 다시 시도할 수 있어요.`;
}
