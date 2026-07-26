/** 단어 연습 출처·방식·문항 수·순서를 한 생성 요청으로 조립한다 */
import type {
  CreateVocabularyPracticeRequest,
  PracticeMode,
  VocabularySummary,
  WordbookSummary,
} from '@flex-thia/contracts';
import { type FormEvent, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { PracticeSettingsFieldsets } from './PracticeSettingsFieldsets';
import { PracticeSourceFieldset } from './PracticeSourceFieldset';

type SourceType = 'SEARCH' | 'WORDBOOK' | '';
type QuestionCount = 10 | 20 | 'ALL';

interface PracticeSetupFormProps {
  wordbooks: WordbookSummary[];
  searchResults: VocabularySummary[];
  searchState: 'IDLE' | 'LOADING' | 'ERROR' | 'SUCCESS';
  onSearch: (query: string) => void;
  onRetrySearch: () => void;
  onStart: (request: CreateVocabularyPracticeRequest) => Promise<string>;
  onCreated: (sessionId: string) => void;
}

/** 필수 설정을 검증하고 생성된 session ID를 화면 이동에 전달한다 */
export function PracticeSetupForm(props: PracticeSetupFormProps) {
  const [sourceType, setSourceType] = useState<SourceType>('');
  const [wordbookId, setWordbookId] = useState('');
  const [selectedVocabularies, setSelectedVocabularies] = useState(
    new Map<string, VocabularySummary>(),
  );
  const [modes, setModes] = useState<PracticeMode[]>([]);
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [order, setOrder] = useState<'SOURCE' | 'RANDOM'>('SOURCE');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateSetup(
      sourceType,
      wordbookId,
      selectedVocabularies.size,
      modes,
    );
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    const source = createSource(
      sourceType,
      wordbookId,
      [...selectedVocabularies.keys()],
    );
    setPending(true);
    setSubmitError(false);
    try {
      props.onCreated(
        await props.onStart({ source, modes, questionCount, order }),
      );
    } catch {
      setSubmitError(true);
    } finally {
      setPending(false);
    }
  };

  const toggleVocabulary = (vocabulary: VocabularySummary) => {
    setSelectedVocabularies((current) => {
      const next = new Map(current);
      if (next.has(vocabulary.id)) next.delete(vocabulary.id);
      else if (next.size < 100) next.set(vocabulary.id, vocabulary);
      return next;
    });
  };

  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => void submit(event)}
    >
      <PracticeSourceFieldset
        disabled={pending}
        onRetrySearch={props.onRetrySearch}
        onSearch={props.onSearch}
        onSelectSource={setSourceType}
        onSelectVocabulary={toggleVocabulary}
        onSelectWordbook={setWordbookId}
        searchResults={props.searchResults}
        searchState={props.searchState}
        selectedVocabularies={selectedVocabularies}
        sourceType={sourceType}
        wordbookId={wordbookId}
        wordbooks={props.wordbooks}
      />
      <PracticeSettingsFieldsets
        disabled={pending}
        modes={modes}
        onChangeModes={setModes}
        onChangeOrder={setOrder}
        onChangeQuestionCount={setQuestionCount}
        order={order}
        questionCount={questionCount}
      />
      {errors.map((error) => (
        <p
          className='text-body text-danger'
          key={error}
        >
          {error}
        </p>
      ))}
      {submitError ? (
        <p role='alert'>연습을 시작하지 못했습니다. 다시 시도해 주세요.</p>
      ) : null}
      <Button disabled={pending}>연습 시작</Button>
    </form>
  );
}

function validateSetup(
  sourceType: SourceType,
  wordbookId: string,
  selectionCount: number,
  modes: PracticeMode[],
) {
  const errors: string[] = [];
  const hasSource =
    (sourceType === 'WORDBOOK' && wordbookId !== '') ||
    (sourceType === 'SEARCH' && selectionCount > 0);
  if (!hasSource) errors.push('연습할 출처를 선택해 주세요.');
  if (modes.length === 0) errors.push('기억 확인 방식을 선택해 주세요.');
  return errors;
}

function createSource(
  sourceType: SourceType,
  wordbookId: string,
  vocabularyIds: string[],
): CreateVocabularyPracticeRequest['source'] {
  if (sourceType === 'WORDBOOK') return { type: 'WORDBOOK', wordbookId };
  return { type: 'SEARCH_SELECTION', vocabularyIds };
}
