/** 추출 진행 화면에 필요한 표시 상태. API 계약과는 별도로 둔다. */
export const extractionStages = [
  '자료 준비',
  '단어 추출',
  '기존 단어·뜻 대조',
  '결과 정리',
] as const;
export type ExtractionProgress = {
  sourceName: string;
  total: number;
  completed: number;
  compared?: number;
  stage: number;
  status: 'queued' | 'running' | 'failed' | 'stopped' | 'complete';
  disconnected: boolean;
  lastChecked: string;
  issue?: { title: string; description: string };
};
export const progressScenarios = {
  running: '추출 중',
  partial: '일부 추출 실패',
  comparison: '대조 중 오류',
  stopped: '서버 작업 중단',
  offline: '연결 끊김',
  complete: '완료',
} as const;
export type ProgressScenario = keyof typeof progressScenarios;

export function createProgressPreview(
  scenario: ProgressScenario,
): ExtractionProgress {
  const base: ExtractionProgress = {
    sourceName: '태국어 독해 자료',
    total: 10,
    completed: 6,
    stage: 1,
    status: 'running',
    disconnected: false,
    lastChecked: '오후 2시 34분',
  };
  switch (scenario) {
    case 'partial':
      return {
        ...base,
        status: 'failed',
        issue: {
          title: '자료 4개를 추출하지 못했어요',
          description:
            '응답 시간이 초과됐어요. 완료한 6개는 저장했어요. 남은 4개부터 다시 처리할 수 있어요.',
        },
      };
    case 'comparison':
      return {
        ...base,
        status: 'failed',
        stage: 2,
        completed: 10,
        issue: {
          title: '기존 단어 대조가 멈췄어요',
          description:
            '단어 추출 결과는 모두 저장했어요. 저장된 단어와 뜻으로 대조부터 이어서 처리할 수 있어요.',
        },
      };
    case 'stopped':
      return {
        ...base,
        status: 'stopped',
        issue: {
          title: '작업이 예기치 않게 멈췄어요',
          description:
            '완료한 6개는 저장했어요. 마지막 저장 이후의 미완료 자료부터 이어서 처리할 수 있어요.',
        },
      };
    case 'offline':
      return { ...base, disconnected: true };
    case 'complete':
      return { ...base, status: 'complete', stage: 4, completed: 10 };
    default:
      return base;
  }
}
