import { InteractiveThaiSentence } from '@/features/learning/components/explore-thai-content/InteractiveThaiSentence';
import { ContentErrorReportDialog } from '@/features/learning/components/report-content-error/ContentErrorReportDialog';
import { VocabularyWordbookPicker } from '@/features/learning/components/save-vocabulary-to-wordbooks/VocabularyWordbookPicker';
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

export function VocabularyDetailPageView({
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
