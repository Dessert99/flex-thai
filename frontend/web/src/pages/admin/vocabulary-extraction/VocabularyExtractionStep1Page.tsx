import { defaultExtractionPrompt } from '@/features/content-production/libs/vocabulary-extraction/defaultExtractionPrompt';
import {
  useCreateExtraction,
  type ExtractionSourceInput,
} from '@/features/content-production/hooks/vocabulary-extraction/useCreateExtraction';
import { Link } from '@tanstack/react-router';
import { ExtractionTemplateDialog } from '@/features/content-production/components/vocabulary-extraction/ExtractionTemplateDialog';
import { VocabularyExtractionSource } from '@/features/content-production/components/vocabulary-extraction/VocabularyExtractionSource';
import { useRef, useState } from 'react';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Label } from '@/shared/components/label';
import { Container } from '@/shared/components/layouts/Container';
import { Textarea } from '@/shared/components/textarea';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

// eslint-disable-next-line complexity -- 입력·저장된 작업·템플릿 영역을 페이지에서 함께 조립한다.
export function VocabularyExtractionStep1Page({
  onStarted,
}: {
  onStarted?: (id: string) => void;
}) {
  const [source, setSource] = useState<ExtractionSourceInput>({
    kind: 'file',
    file: null,
  });
  const { history, mutation } = useCreateExtraction(onStarted);
  const [prompt, setPrompt] = useState(defaultExtractionPrompt);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templateTrigger = useRef<HTMLButtonElement>(null);

  return (
    <Container className='w-full max-w-3xl flex-1'>
      <div className='grid gap-section'>
        <header className='grid gap-cluster'>
          <p className='text-caption text-subtle'>관리자 / 단어 추출</p>
          <h1 className='text-heading'>단어 추출</h1>
          <p className='text-body text-subtle'>
            자료를 넣으면 새 단어와 새로운 뜻을 찾아요.
          </p>
        </header>
        <p
          aria-current='step'
          className='flex items-center gap-cluster text-caption'
        >
          <span className='flex size-avatar items-center justify-center rounded-control bg-brand text-primary-foreground'>
            1
          </span>
          <strong>자료 입력</strong>
        </p>
        <>
          <Card>
            <CardHeader className='border-b border-default'>
              <CardTitle>추출할 자료와 지시문</CardTitle>
              <CardDescription>
                자료를 선택하고 원하는 추출 기준을 작성하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-section'>
              <VocabularyExtractionSource onChange={setSource} />
              <section className='grid gap-cluster'>
                <Label htmlFor='extraction-prompt'>추출 지시문</Label>
                <Textarea
                  id='extraction-prompt'
                  className='h-extraction-input resize-none text-body'
                  maxLength={20000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='어떤 단어를 추출할지 알려주세요.'
                />
                <div className='flex flex-wrap items-center justify-between gap-cluster'>
                  <Button
                    ref={templateTrigger}
                    variant='outline'
                    onClick={() => setTemplatesOpen(true)}
                  >
                    템플릿
                  </Button>
                  <p className='text-caption text-subtle'>
                    복사한 지시문을 붙여 넣으세요.
                  </p>
                </div>
              </section>
            </CardContent>
            <CardFooter className='flex-wrap justify-between gap-cluster border-t border-default'>
              <p className='text-caption text-subtle'>
                기존 단어와 뜻은 자동으로 제외해요.
              </p>
              <Button
                disabled={
                  mutation.isPending ||
                  !prompt.trim() ||
                  (source.kind === 'file' ? !source.file : !source.url.trim())
                }
                onClick={() => mutation.mutate({ source, prompt })}
              >
                {mutation.isPending ? '자료 제출 중…' : '추출 시작'}
              </Button>
            </CardFooter>
          </Card>
          {mutation.isError && (
            <p
              role='alert'
              className='text-caption text-danger'
            >
              추출을 시작하지 못했어요. 자료와 서버의 AI 설정을 확인한 뒤 다시
              시도하세요.
            </p>
          )}
          <section
            className='grid gap-cluster'
            aria-label='저장된 추출 작업'
          >
            <h2 className='text-title'>저장된 추출 작업</h2>
            {history.isPending && (
              <p className='text-caption text-subtle'>
                작업을 불러오고 있어요.
              </p>
            )}
            {history.isError && (
              <Button
                variant='outline'
                onClick={() => void history.refetch()}
              >
                작업 목록 다시 불러오기
              </Button>
            )}
            {history.data?.items.length === 0 && (
              <p className='text-caption text-subtle'>저장된 작업이 없어요.</p>
            )}
            <ul className='divide-y divide-default'>
              {history.data?.items.map((job) => (
                <li
                  key={job.id}
                  className='py-cluster'
                >
                  <Link
                    to='/admin/vocabulary-extraction/$jobId'
                    params={{ jobId: job.id }}
                    className='flex justify-between gap-cluster'
                  >
                    <span>{job.sourceName}</span>
                    <span className='text-caption text-subtle'>
                      {
                        {
                          queued: '대기',
                          running: '진행 중',
                          failed: '오류',
                          stopped: '중단',
                          complete: '완료',
                        }[job.status]
                      }
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {templatesOpen && (
            <ExtractionTemplateDialog
              onClose={() => setTemplatesOpen(false)}
              onRestoreFocus={() => templateTrigger.current?.focus()}
            />
          )}
        </>
      </div>
    </Container>
  );
}
