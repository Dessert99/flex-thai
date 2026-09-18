import { VocabularyPracticeAnswerForm } from '@/features/learning/components/answer-vocabulary-practice/VocabularyPracticeAnswerForm';
import { useVocabularyPracticeSession } from '@/features/learning/hooks/vocabulary-practice-session/useVocabularyPracticeSession';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type {
  PracticeCard,
  SubmitVocabularyPracticeAnswerRequest,
  VocabularyPracticeAnswerResponse,
  VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts/learning/vocabulary-practice';
import { useState } from 'react';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function VocabularyPracticeSessionPage(
  pageInput: Parameters<typeof useVocabularyPracticeSession>[0],
) {
  const { onShowResult, sessionId, session, answerVocabularyPractice } =
    useVocabularyPracticeSession(pageInput);

  if (session.isPending) {
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
              단어 연습을 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );
  }

  if (session.isError || session.data === undefined) {
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
              <p>단어 연습을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void session.refetch()}
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
        <VocabularyPracticeSessionContent
          onAnswer={(questionId, request) =>
            answerVocabularyPractice(sessionId, questionId, request)
          }
          onShowResult={onShowResult}
          session={session.data}
        />
      </>
    </Container>
  );
}
/** 단어 연습의 선행 학습 카드와 미응답 기억 확인 흐름을 표시한다 */

interface VocabularyPracticeSessionPageViewProps {
  onAnswer: (
    questionId: string,
    request: SubmitVocabularyPracticeAnswerRequest,
  ) => Promise<VocabularyPracticeAnswerResponse>;
  onShowResult: (sessionId: string) => void;
  session: VocabularyPracticeSessionResponse;
}

/** 카드를 먼저 공개하고 사용자가 원할 때 첫 미응답 문항부터 시작한다 */
export function VocabularyPracticeSessionContent({
  onAnswer,
  onShowResult,
  session,
}: VocabularyPracticeSessionPageViewProps) {
  const firstUnansweredIndex = session.questions.findIndex(
    ({ id }) => !session.answeredQuestionIds.includes(id),
  );
  const [preferredQuestionId, setPreferredQuestionId] = useState(
    session.questions[firstUnansweredIndex]?.id,
  );
  const [cardIndex, setCardIndex] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [submittedFeedback, setSubmittedFeedback] =
    useState<VocabularyPracticeAnswerResponse>();
  const preferredQuestionIndex = session.questions.findIndex(
    ({ id }) =>
      id === preferredQuestionId && !session.answeredQuestionIds.includes(id),
  );
  const questionIndex =
    preferredQuestionIndex >= 0 ? preferredQuestionIndex : firstUnansweredIndex;
  const question =
    questionIndex < 0 ? undefined : session.questions[questionIndex];
  const feedback =
    submittedFeedback?.questionId === question?.id
      ? submittedFeedback
      : undefined;
  const nextQuestionIndex = session.questions.findIndex(
    ({ id }, index) =>
      index > questionIndex && !session.answeredQuestionIds.includes(id),
  );

  if (session.status === 'COMPLETED') {
    return (
      <Button
        onClick={() => onShowResult(session.id)}
        type='button'
      >
        결과 보기
      </Button>
    );
  }

  if (!quizStarted) {
    return (
      <StudyPhase
        cardIndex={cardIndex}
        onChangeCard={setCardIndex}
        onStart={() => setQuizStarted(true)}
        questionAvailable={question !== undefined}
        session={session}
      />
    );
  }

  if (question === undefined) {
    return <p>모든 문항에 답했습니다.</p>;
  }

  return (
    <QuizPhase
      feedback={feedback}
      nextQuestionIndex={nextQuestionIndex}
      onAnswer={onAnswer}
      onAnswered={setSubmittedFeedback}
      onNext={() => {
        setPreferredQuestionId(session.questions[nextQuestionIndex]?.id);
        setSubmittedFeedback(undefined);
      }}
      onShowResult={onShowResult}
      question={question}
      session={session}
    />
  );
}

function StudyPhase({
  cardIndex,
  onChangeCard,
  onStart,
  questionAvailable,
  session,
}: {
  cardIndex: number;
  onChangeCard: (index: number) => void;
  onStart: () => void;
  questionAvailable: boolean;
  session: VocabularyPracticeSessionResponse;
}) {
  const card = session.cards[cardIndex];
  if (!card) return null;
  return (
    <section className='grid gap-section'>
      <h1>단어 익히기</h1>
      <p>
        카드 {cardIndex + 1} / {session.cards.length}
      </p>
      <PracticeCardView card={card} />
      <div className='flex gap-cluster'>
        <Button
          disabled={cardIndex === 0}
          onClick={() => onChangeCard(cardIndex - 1)}
          type='button'
          variant='outline'
        >
          이전 카드
        </Button>
        <Button
          disabled={cardIndex + 1 === session.cards.length}
          onClick={() => onChangeCard(cardIndex + 1)}
          type='button'
          variant='outline'
        >
          다음 카드
        </Button>
      </div>
      <Button
        disabled={!questionAvailable}
        onClick={onStart}
        type='button'
      >
        기억 확인 시작
      </Button>
    </section>
  );
}

function QuizPhase({
  feedback,
  nextQuestionIndex,
  onAnswer,
  onAnswered,
  onNext,
  onShowResult,
  question,
  session,
}: {
  feedback: VocabularyPracticeAnswerResponse | undefined;
  nextQuestionIndex: number;
  onAnswer: VocabularyPracticeSessionPageViewProps['onAnswer'];
  onAnswered: (feedback: VocabularyPracticeAnswerResponse) => void;
  onNext: () => void;
  onShowResult: (sessionId: string) => void;
  question: VocabularyPracticeSessionResponse['questions'][number];
  session: VocabularyPracticeSessionResponse;
}) {
  return (
    <section className='grid gap-section'>
      <p>
        {question.position} / {session.questionCount}
      </p>
      <PracticePrompt question={question} />
      <VocabularyPracticeAnswerForm
        key={question.id}
        onAnswer={(request) => onAnswer(question.id, request)}
        onAnswered={onAnswered}
        question={question}
      />
      {feedback ? <PracticeCardView card={feedback.card} /> : null}
      <QuizNavigation
        feedback={feedback}
        hasNext={nextQuestionIndex >= 0}
        onNext={onNext}
        onShowResult={() => onShowResult(session.id)}
      />
    </section>
  );
}

function QuizNavigation({
  feedback,
  hasNext,
  onNext,
  onShowResult,
}: {
  feedback: VocabularyPracticeAnswerResponse | undefined;
  hasNext: boolean;
  onNext: () => void;
  onShowResult: () => void;
}) {
  if (feedback?.sessionCompleted) {
    return (
      <Button
        onClick={onShowResult}
        type='button'
      >
        결과 보기
      </Button>
    );
  }
  if (!feedback || !hasNext) return null;
  return (
    <Button
      onClick={onNext}
      type='button'
      variant='outline'
    >
      다음 문항
    </Button>
  );
}

function PracticePrompt({
  question,
}: {
  question: VocabularyPracticeSessionResponse['questions'][number];
}) {
  if (question.prompt.type === 'TEXT') {
    return (
      <h1
        className='font-thai text-heading'
        lang='th'
      >
        {question.prompt.text}
      </h1>
    );
  }
  return <div></div>;
}

export function PracticeCardView({ card }: { card: PracticeCard }) {
  return (
    <article className='grid gap-cluster rounded-panel border border-default p-page'>
      <h2
        className='font-thai text-heading'
        lang='th'
      >
        {card.thai}
      </h2>
      <ul>
        {card.meanings.map((meaning) => (
          <li key={meaning.id}>
            <span>{meaning.meaningKo}</span> · {meaning.partOfSpeech}
            {meaning.contextNote === null ? '' : ` · ${meaning.contextNote}`}
          </li>
        ))}
      </ul>
    </article>
  );
}
