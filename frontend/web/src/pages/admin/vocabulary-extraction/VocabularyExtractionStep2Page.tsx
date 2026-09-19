import { Check, LoaderCircle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  extractionStages,
  progressScenarios,
  type ExtractionProgress,
  type ProgressScenario,
} from '@/features/content-production/libs/vocabulary-extraction/extractionProgress';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/card';
import { Container } from '@/shared/components/layouts/Container';

type Props = {
  progress: ExtractionProgress;
  onRetry: () => void;
  onReconnect: () => void;
  actionPending?: boolean;
  onViewResults?: () => void;
  preview?: {
    scenario: ProgressScenario;
    onChange: (scenario: ProgressScenario) => void;
    feedback: string;
  };
};

/** 단계별 배치와 오류 안내를 페이지에서 직접 조립한다. */
export function VocabularyExtractionStep2Page({
  progress,
  onRetry,
  onReconnect,
  actionPending = false,
  onViewResults,
  preview,
}: Props) {
  const interrupted =
    progress.status === 'failed' || progress.status === 'stopped';
  return (
    <Container className='w-full max-w-3xl flex-1'>
      <div className='grid gap-section'>
        <header className='grid gap-cluster'>
          <p className='text-caption text-subtle'>관리자 / 단어 추출</p>
          <h1 className='text-heading'>단어 추출</h1>
          <p className='text-body text-subtle'>
            자료에서 새 단어와 새로운 뜻을 찾아요.
          </p>
        </header>
        {preview && (
          <section
            aria-label='진행 화면 미리보기'
            className='grid gap-cluster border border-default p-page'
          >
            <p className='text-caption text-subtle'>
              화면 미리보기예요. 자료와 수치는 예시이며 실제 추출이나 서버
              조회는 실행되지 않아요.
            </p>
            <div className='flex flex-wrap gap-cluster'>
              {(Object.keys(progressScenarios) as ProgressScenario[]).map(
                (scenario) => (
                  <Button
                    key={scenario}
                    variant={
                      preview.scenario === scenario ? 'secondary' : 'outline'
                    }
                    aria-pressed={preview.scenario === scenario}
                    onClick={() => preview.onChange(scenario)}
                  >
                    {progressScenarios[scenario]}
                  </Button>
                ),
              )}
            </div>
            <p
              role='status'
              className='text-caption text-subtle'
            >
              {preview.feedback}
            </p>
            <Link
              to='/admin/vocabulary-extraction'
              className='text-caption underline underline-offset-4'
            >
              자료 입력으로 돌아가기
            </Link>
          </section>
        )}
        <p
          aria-current='step'
          className='flex items-center gap-cluster text-caption'
        >
          <span className='flex size-avatar items-center justify-center rounded-control bg-brand text-primary-foreground'>
            2
          </span>
          <strong>추출 진행</strong>
        </p>
        <Card>
          <CardHeader className='border-b border-default'>
            <CardTitle>단어 추출 진행</CardTitle>
            <CardDescription>
              {progress.sourceName} · 총 {progress.total}개 구간
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol aria-label='추출 처리 단계'>
              {extractionStages.map(
                // eslint-disable-next-line complexity -- 단계의 진행·연결 끊김·실패 상태를 같은 행에서 조립한다.
                (label, index) => {
                  const current = index === progress.stage;
                  const done = index < progress.stage;
                  const offline = current && progress.disconnected;
                  const failed =
                    current && interrupted && !progress.disconnected;
                  const status = stageStatus(progress, index);
                  const loading =
                    current &&
                    !offline &&
                    !failed &&
                    progress.status !== 'queued';
                  let borderClass = 'border-y border-default -mt-px';
                  if (failed) borderClass = 'border border-danger';
                  if (offline) borderClass = 'border border-strong';
                  return (
                    <li
                      key={label}
                      aria-current={current ? 'step' : undefined}
                      className={borderClass}
                    >
                      <div className='flex items-center gap-cluster py-cluster'>
                        <span
                          className={`flex size-avatar shrink-0 items-center justify-center rounded-full border border-default text-caption ${done ? 'bg-brand text-primary-foreground' : ''}`}
                        >
                          {done && (
                            <Check
                              aria-hidden='true'
                              className='size-icon'
                            />
                          )}
                          {loading && (
                            <LoaderCircle
                              aria-hidden='true'
                              className='size-icon animate-spin motion-reduce:animate-none'
                            />
                          )}
                          {!done && !loading && index + 1}
                        </span>
                        <strong className='flex-1 text-body'>{label}</strong>
                        <span
                          className={`text-caption text-right ${failed ? 'text-danger' : 'text-subtle'}`}
                        >
                          {status}
                        </span>
                      </div>
                      {(offline || failed) && (
                        <div className='ml-control grid gap-cluster pr-page pb-page'>
                          <div>
                            <h2 className='text-body font-semibold'>
                              {offline
                                ? '현재 진행 상황을 확인할 수 없어요'
                                : progress.issue?.title}
                            </h2>
                            <p className='mt-cluster text-caption text-subtle'>
                              {offline
                                ? `서버 연결이 끊겼어요. 마지막 확인 당시 ${progress.completed}개가 완료됐어요. 작업이 중단됐는지는 아직 알 수 없어요.`
                                : progress.issue?.description}
                            </p>
                            {offline && (
                              <p className='mt-cluster text-caption text-subtle'>
                                마지막 확인 · {progress.lastChecked}
                              </p>
                            )}
                          </div>
                          <Button
                            className='justify-self-start'
                            disabled={actionPending}
                            onClick={offline ? onReconnect : onRetry}
                          >
                            {actionPending
                              ? '요청 중…'
                              : recoveryLabel(progress)}
                          </Button>
                        </div>
                      )}
                      {current && !offline && !failed && (
                        <p className='ml-control pb-page text-caption text-subtle'>
                          {progressDetail(progress)}
                        </p>
                      )}
                    </li>
                  );
                },
              )}
            </ol>
          </CardContent>
          <CardFooter className='flex-wrap justify-between gap-cluster border-t border-default'>
            <p className='text-caption text-subtle'>
              {progress.status === 'complete'
                ? '단어 추출과 대조가 끝났어요.'
                : '완료한 부분을 기준으로 진행 상황을 표시해요.'}
            </p>
            <Button
              disabled={
                progress.status !== 'complete' ||
                !onViewResults ||
                progress.disconnected
              }
              onClick={onViewResults}
            >
              결과 보기
            </Button>
          </CardFooter>
        </Card>
      </div>
    </Container>
  );
}

function stageStatus(progress: ExtractionProgress, index: number) {
  if (index < progress.stage) return '완료';
  if (index > progress.stage) return '대기';
  if (progress.disconnected) return '마지막 확인: 진행 중';
  if (progress.status === 'queued') return '대기';
  return progress.status === 'running' ? '진행 중' : '중단';
}

function recoveryLabel(progress: ExtractionProgress) {
  if (progress.disconnected) return '연결 다시 확인';
  if (progress.status === 'stopped') return '이어서 처리';
  if (progress.stage === 0) return '자료 준비 다시 시도';
  return progress.stage === 1 ? '남은 자료 다시 시도' : '대조 다시 시도';
}

function progressDetail(progress: ExtractionProgress) {
  if (progress.status === 'queued') return '처리를 기다리고 있어요.';
  if (progress.stage === 0) return '자료를 읽고 처리 단위를 준비하고 있어요.';
  if (progress.stage === 2)
    return `자료 ${progress.total}개 중 ${progress.compared ?? 0}개 대조 완료`;
  return `자료 ${progress.total}개 중 ${progress.completed}개 처리 완료`;
}
