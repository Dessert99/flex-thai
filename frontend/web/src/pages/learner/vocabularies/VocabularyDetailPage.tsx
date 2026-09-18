import { InteractiveThaiSentence } from '@/features/learning/components/explore-thai-content/InteractiveThaiSentence';
import { ContentErrorReportDialog } from '@/features/learning/components/report-content-error/ContentErrorReportDialog';
import { VocabularyWordbookPicker } from '@/features/learning/components/save-vocabulary-to-wordbooks/VocabularyWordbookPicker';
import { useVocabularyDetail } from '@/features/learning/hooks/vocabulary-detail/useVocabularyDetail';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/tabs';
import type {
  VocabularyDetailResponse,
  VocabularyRelatedQuestionsResponse,
} from '@flex-thia/contracts/learning/vocabularies';
import { Link } from '@tanstack/react-router';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function VocabularyDetailPage(
  pageInput: Parameters<typeof useVocabularyDetail>[0],
) {
  const { queryClient, detail, related } = useVocabularyDetail(pageInput);

  if (detail.isPending || related.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>
              어휘 상세를 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );
  }

  if (detail.isError || related.isError || detail.data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>어휘 상세를 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => {
                  void detail.refetch();
                  void related.refetch();
                }}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <>
        <VocabularyDetailContent
          detail={detail.data}
          onWordbookMembershipConfirmed={() => {
            void queryClient.invalidateQueries({
              queryKey: ['learner', 'vocabularies'],
            });
          }}
          relatedQuestions={related.data?.items ?? []}
        />
      </>
    </Container>
  );
}

export function VocabularyDetailContent({
  detail,
  onWordbookMembershipConfirmed,
  relatedQuestions,
}: {
  detail: VocabularyDetailResponse;
  onWordbookMembershipConfirmed: () => void;
  relatedQuestions: VocabularyRelatedQuestionsResponse['items'];
}) {
  return (
    <article className='grid gap-section'>
      <header className='flex flex-wrap items-center justify-between gap-cluster'>
        <div className='grid gap-cluster'>
          <h1
            className='font-thai text-title'
            lang='th'
          >
            {detail.thai}
          </h1>
          <p className='text-body text-subtle'>종류: {detail.kind}</p>
        </div>
        <ContentErrorReportDialog
          origin={{
            kind: 'VOCABULARY',
            vocabularyId: detail.id,
            meaningId: null,
          }}
          preview={{
            title: detail.thai,
            metadata: `어휘 ${detail.id}`,
          }}
          triggerLabel='어휘 오류 신고'
        />
      </header>
      <VocabularyWordbookPicker
        key={detail.id}
        onConfirmed={onWordbookMembershipConfirmed}
        vocabularyId={detail.id}
      />
      {detail.relations.length > 0 ? (
        <section
          aria-labelledby='vocabulary-relations-title'
          className='grid gap-cluster'
        >
          <h2
            className='text-heading text-primary'
            id='vocabulary-relations-title'
          >
            연관 뜻
          </h2>
          <ul>
            {detail.relations.map((relation) => (
              <li key={relation.id}>
                <Link
                  to='/vocabularies/$vocabularyId'
                  search={{ page: 1, pageSize: 20 }}
                  params={{ vocabularyId: relation.relatedVocabularyId }}
                >
                  <span lang='th'>{relation.relatedThai}</span> ·{' '}
                  {relation.relatedMeaningKo}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <VocabularyExamples sentences={detail.exampleSentences} />
      <VocabularyDetailTabs
        detail={detail}
        relatedQuestions={relatedQuestions}
      />
    </article>
  );
}

function VocabularyExamples({
  sentences,
}: {
  sentences: VocabularyDetailResponse['exampleSentences'];
}) {
  if (sentences.length === 0) return null;
  return (
    <section
      aria-labelledby='vocabulary-examples-title'
      className='grid gap-cluster'
    >
      <h2
        className='text-heading text-primary'
        id='vocabulary-examples-title'
      >
        예문
      </h2>
      {sentences.map((sentence) => (
        <div
          className='grid gap-cluster'
          key={sentence.sentenceVersionId}
        >
          <InteractiveThaiSentence
            sentence={sentence}
            showTranslation
          />
          <ContentErrorReportDialog
            origin={{
              kind: 'SENTENCE',
              sentenceVersionId: sentence.sentenceVersionId,
              tokenPosition: null,
            }}
            preview={{
              title: sentence.originalText,
              metadata: sentence.translationKo,
            }}
            triggerLabel='예문 오류 신고'
          />
        </div>
      ))}
    </section>
  );
}

function VocabularyDetailTabs({
  detail,
  relatedQuestions,
}: {
  detail: VocabularyDetailResponse;
  relatedQuestions: VocabularyRelatedQuestionsResponse['items'];
}) {
  return (
    <Tabs defaultValue='meanings'>
      <TabsList>
        <TabsTrigger value='meanings'>뜻</TabsTrigger>
        <TabsTrigger value='questions'>관련 문제</TabsTrigger>
      </TabsList>
      <TabsContent value='meanings'>
        <ul>
          {detail.meanings.map((item) => (
            <li key={item.id}>
              <span>
                {item.meaningKo} · {item.partOfSpeech} ·{' '}
                {item.difficulty === null
                  ? '난이도 미정'
                  : `난이도 ${item.difficulty}`}
              </span>
              <ContentErrorReportDialog
                origin={{
                  kind: 'VOCABULARY',
                  vocabularyId: detail.id,
                  meaningId: item.id,
                }}
                preview={{
                  title: detail.thai,
                  metadata: item.meaningKo,
                }}
                triggerLabel='뜻 오류 신고'
              />
            </li>
          ))}
        </ul>
      </TabsContent>
      <TabsContent value='questions'>
        <ul>
          {relatedQuestions.map((item) => (
            <li key={item.questionId}>
              <Link
                to='/questions/$questionId'
                params={{ questionId: item.questionId }}
              >
                {item.questionType.displayName}
              </Link>
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
