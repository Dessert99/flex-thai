/** 어휘 상세의 뜻·발음·관련 문제를 계약 필드만으로 표현한다 */
import type {
  VocabularyDetailResponse,
  VocabularyRelatedQuestionsResponse,
} from '@flex-thia/contracts';
import { InteractiveThaiSentence } from '@/features/explore-thai-content';
import { ContentErrorReportDialog } from '@/features/report-content-error';
import { VocabularyWordbookPicker } from '@/features/save-vocabulary-to-wordbooks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

/** 서버 태국어 원문과 발음 audio를 수정 없이 렌더링한다 */
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
        <h1
          className='font-thai text-title'
          lang='th'
        >
          {detail.thai}
        </h1>
        <ContentErrorReportDialog
          origin={{
            kind: 'VOCABULARY',
            vocabularyId: detail.id,
            meaningId: null,
            pronunciationId: null,
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
        <TabsTrigger value='pronunciations'>발음</TabsTrigger>
        <TabsTrigger value='questions'>관련 문제</TabsTrigger>
      </TabsList>
      <TabsContent value='meanings'>
        <ul>
          {detail.meanings.map((item) => (
            <li key={item.id}>
              <span>{item.meaningKo}</span>
              <ContentErrorReportDialog
                origin={{
                  kind: 'VOCABULARY',
                  vocabularyId: detail.id,
                  meaningId: item.id,
                  pronunciationId: null,
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
      <TabsContent value='pronunciations'>
        <ul>
          {detail.pronunciations.map((item) => (
            <li key={item.id}>
              <span>{item.pronunciationKo}</span>
              {/* 인접 발음 표기를 제공하며 계약에 VTT URL이 없어 audio 규칙만 제한한다. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio
                aria-label={`${detail.thai} 발음`}
                controls
                src={item.audioUrl}
              />
              <ContentErrorReportDialog
                origin={{
                  kind: 'AUDIO',
                  source: {
                    kind: 'VOCABULARY',
                    pronunciationId: item.id,
                  },
                }}
                preview={{
                  title: detail.thai,
                  metadata: item.pronunciationKo,
                }}
                triggerLabel='발음 오류 신고'
              />
            </li>
          ))}
        </ul>
      </TabsContent>
      <TabsContent value='questions'>
        <ul>
          {relatedQuestions.map((item) => (
            <li key={item.questionId}>
              <a href={`/questions/${item.questionId}`}>
                {item.questionType.displayName}
              </a>
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
