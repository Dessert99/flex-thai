/** 어휘 상세의 뜻·발음·관련 문제를 계약 필드만으로 표현한다 */
import type {
  VocabularyDetailResponse,
  VocabularyRelatedQuestionsResponse,
} from '@flex-thia/contracts';
import { InteractiveThaiSentence } from '@/features/explore-thai-content';
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
      <header>
        <h1
          className='font-thai text-title'
          lang='th'
        >
          {detail.thai}
        </h1>
      </header>
      <VocabularyWordbookPicker
        onConfirmed={onWordbookMembershipConfirmed}
        vocabularyId={detail.id}
      />
      {detail.exampleSentences.length === 0 ? null : (
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
          {detail.exampleSentences.map((sentence) => (
            <InteractiveThaiSentence
              key={sentence.sentenceVersionId}
              sentence={sentence}
            />
          ))}
        </section>
      )}
      <Tabs defaultValue='meanings'>
        <TabsList>
          <TabsTrigger value='meanings'>뜻</TabsTrigger>
          <TabsTrigger value='pronunciations'>발음</TabsTrigger>
          <TabsTrigger value='questions'>관련 문제</TabsTrigger>
        </TabsList>
        <TabsContent value='meanings'>
          <ul>
            {detail.meanings.map((item) => (
              <li key={item.id}>{item.meaningKo}</li>
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
    </article>
  );
}
