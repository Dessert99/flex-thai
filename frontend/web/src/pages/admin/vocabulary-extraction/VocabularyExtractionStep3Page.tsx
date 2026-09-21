import { extractionReviewPreview } from '@/features/vocabulary-extraction/libs/vocabulary-extraction/extractionReviewPreview';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { ExtractionReviewItem } from '@flex-thia/contracts/vocabulary-extraction/vocabulary-extraction';
import { useExtractionReview } from '@/features/vocabulary-extraction/hooks/vocabulary-extraction/useExtractionReview';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/shared/components/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/dialog';
import { Container } from '@/shared/components/layouts/Container';

/** 결과 목록·상세 모달·저장 영역의 배치를 이 단계 페이지에서 조립한다. */
export function VocabularyExtractionStep3Page({
  jobId,
  sourceName,
  preview = false,
}: {
  jobId: string;
  sourceName: string;
  preview?: boolean;
}) {
  const state = useExtractionReview(
    jobId,
    preview ? extractionReviewPreview : undefined,
  );
  const [detail, setDetail] = useState<ExtractionReviewItem | null>(null);
  const { query, save, receipt, items } = state;
  return (
    <Container className='w-full max-w-3xl flex-1'>
      <div className='grid gap-section'>
        <header className='grid gap-cluster'>
          <p className='text-caption text-subtle'>관리자 / 단어 추출</p>
          <h1 className='text-heading'>단어 추출</h1>
          <p className='text-subtle'>
            자료의 문장·문맥에서 사용된 뜻을 확인하세요.
          </p>
        </header>
        {preview && (
          <p
            role='status'
            className='rounded-control border border-default bg-surface-muted p-cluster text-caption'
          >
            화면 미리보기예요. 자료와 단어는 예시이며 실제 추출이나 단어 저장은
            실행되지 않아요.
          </p>
        )}
        <Card>
          <CardHeader className='border-b border-default'>
            <CardTitle>3. 추출 결과</CardTitle>
            <CardDescription className='break-words'>
              {sourceName}
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-section'>
            {query.isPending && <p role='status'>결과를 불러오고 있어요.</p>}
            {query.isError && (
              <div className='grid gap-cluster'>
                <p role='alert'>결과를 불러오지 못했어요.</p>
                <Button
                  variant='outline'
                  onClick={() => void query.refetch()}
                >
                  다시 불러오기
                </Button>
              </div>
            )}
            {query.data && (
              <>
                <p className='text-caption text-subtle'>
                  기존 단어와 같은 뜻 {query.data.excluded}개 제외 ·{' '}
                  {items.length}개 {receipt ? '선택됨' : '저장 예정'}
                </p>
                {(['NEW_WORD', 'NEW_MEANING'] as const).map((kind) => {
                  const words = items.filter(
                    (item) => item.classification === kind,
                  );
                  return (
                    <section
                      key={kind}
                      className='grid gap-cluster'
                      aria-label={
                        kind === 'NEW_WORD' ? '신규 단어' : '뜻 추가 단어'
                      }
                    >
                      <h2 className='text-title'>
                        {kind === 'NEW_WORD' ? '신규 단어' : '뜻 추가 단어'}{' '}
                        <span className='text-caption text-subtle'>
                          {words.length}개
                        </span>
                      </h2>
                      <div className='grid grid-cols-1 gap-cluster sm:grid-cols-2'>
                        {words.map((item) => (
                          <div
                            key={item.id}
                            className='group relative min-w-none rounded-control border border-default bg-surface focus-within:ring-2 focus-within:ring-ring'
                          >
                            <Button
                              variant='ghost'
                              className='h-vocabulary-card w-full min-w-none justify-start gap-cluster rounded-control px-cluster text-caption'
                              onClick={() => setDetail(item)}
                              aria-label={`${item.thai} 자세히보기`}
                            >
                              <span
                                lang='th'
                                className='font-thai shrink-0 max-w-word-label truncate'
                              >
                                {item.thai}
                              </span>
                              <span aria-hidden='true'>:</span>
                              <span className='min-w-none truncate font-normal'>
                                {item.meaningKo}
                              </span>
                            </Button>
                            {!receipt && (
                              <div className='pointer-events-none absolute inset-none grid grid-cols-2 overflow-hidden rounded-control bg-surface opacity-0 transition-opacity duration-feedback group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:opacity-100'>
                                <Button
                                  variant='ghost'
                                  className='h-full min-h-control rounded-none active:bg-surface-muted'
                                  onClick={() => setDetail(item)}
                                  aria-label={`${item.thai} 자세히보기`}
                                >
                                  자세히보기
                                </Button>
                                <Button
                                  variant='ghost'
                                  className='h-full min-h-control rounded-none border-l border-default text-danger hover:bg-danger-surface active:bg-danger-surface'
                                  disabled={save.isPending}
                                  onClick={() => state.remove(item.id)}
                                  aria-label={`${item.thai} 삭제하기`}
                                >
                                  삭제하기
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {!words.length && (
                        <p className='py-cluster text-caption text-subtle'>
                          해당하는 단어가 없어요.
                        </p>
                      )}
                    </section>
                  );
                })}
              </>
            )}
          </CardContent>
          <CardFooter className='flex flex-wrap justify-between gap-cluster border-t border-default'>
            <SaveResultActions
              state={state}
              preview={preview}
            />
          </CardFooter>
        </Card>
        <Link
          to='/admin/vocabulary-extraction'
          className='text-caption underline'
        >
          자료 입력으로 돌아가기
        </Link>
      </div>
      <WordDetail
        detail={detail}
        sourceName={sourceName}
        onClose={() => setDetail(null)}
      />
    </Container>
  );
}

function SaveResultActions({
  state,
  preview,
}: {
  state: ReturnType<typeof useExtractionReview>;
  preview: boolean;
}) {
  const { query, save, receipt, items } = state;
  return (
    <>
      {receipt ? (
        <div className='grid gap-cluster'>
          <p role='status'>
            {preview ? '저장 완료 화면 예시예요.' : '최종 저장했어요.'}{' '}
            {receipt.items.length}개의 뜻
            {preview ? '이 선택됐어요.' : '을 등록했어요.'}
          </p>
          <Link
            to='/admin/vocabularies'
            search={{ page: 1, pageSize: 20 }}
            className='underline'
          >
            단어 목록 보기
          </Link>
        </div>
      ) : (
        <>
          <div className='grid gap-cluster'>
            <p className='text-caption text-subtle'>
              삭제한 항목은 저장하지 않아요.
            </p>
            {state.excluded.length > 0 && (
              <Button
                variant='ghost'
                disabled={save.isPending}
                onClick={state.restore}
              >
                삭제한 {state.excluded.length}개 되돌리기
              </Button>
            )}
          </div>
          <Button
            disabled={!query.data || query.isError || save.isPending}
            onClick={state.submit}
          >
            {save.isPending ? '저장 중…' : `최종 저장 (${items.length}개)`}
          </Button>
          {save.isError && (
            <p
              role='alert'
              className='w-full text-caption text-danger'
            >
              저장 완료를 확인하지 못했어요. 선택 목록은 유지돼요. 같은 선택으로
              다시 저장하거나 새로고침해 저장 상태를 확인하세요.
            </p>
          )}
        </>
      )}
    </>
  );
}
function WordDetail({
  detail,
  sourceName,
  onClose,
}: {
  detail: ExtractionReviewItem | null;
  sourceName: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={detail !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='max-h-dialog gap-none overflow-y-auto p-none sm:max-w-xl'>
        <DialogHeader className='border-b border-default p-page'>
          <DialogDescription>
            {detail?.classification === 'NEW_MEANING'
              ? '뜻 추가 단어'
              : '신규 단어'}
          </DialogDescription>
          <DialogTitle>단어 자세히보기</DialogTitle>
        </DialogHeader>
        {detail && (
          <div className='grid gap-section p-page'>
            <div className='grid gap-cluster'>
              <p className='text-caption text-subtle'>태국어</p>
              <p
                lang='th'
                className='font-thai break-words text-thai-word font-semibold'
              >
                {detail.thai}
              </p>
            </div>
            {detail.classification === 'NEW_MEANING' && (
              <section className='grid gap-cluster rounded-control bg-surface-muted p-cluster'>
                <h3 className='text-caption text-subtle'>기존에 저장된 뜻</h3>
                {detail.existingMeanings.length ? (
                  <ul className='grid gap-cluster'>
                    {detail.existingMeanings.map((meaning, index) => (
                      <li
                        key={index}
                        className='whitespace-pre-wrap break-words'
                      >
                        {meaning}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='text-subtle'>기존 뜻을 확인할 수 없어요.</p>
                )}
              </section>
            )}
            <section className='grid gap-cluster'>
              <h3 className='text-caption text-subtle'>
                {detail.classification === 'NEW_MEANING'
                  ? '이번 문맥에서 추출한 뜻'
                  : '문맥에서 사용된 뜻'}
              </h3>
              <p className='whitespace-pre-wrap break-words text-body'>
                {detail.meaningKo}
              </p>
            </section>
            <section className='grid gap-cluster border-t border-default pt-section'>
              <h3 className='font-semibold'>이 뜻이 나온 출처</h3>
              <p className='break-words text-caption text-subtle'>
                {sourceName}
                {detail.page !== null ? ` · ${detail.page}쪽` : ''}
              </p>
              {detail.context ? (
                <blockquote
                  lang='th'
                  className='font-thai whitespace-pre-wrap break-words border-l border-default pl-cluster'
                >
                  {detail.context}
                </blockquote>
              ) : (
                <p className='text-subtle'>원문 문장이 제공되지 않았어요.</p>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
