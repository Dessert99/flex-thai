/** 단어 연습 출처·방식·문항 수·순서를 한 생성 요청으로 조립한다 */
import type {
  CreateVocabularyPracticeRequest,
  PracticeMode,
  VocabularySummary,
  WordbookSummary,
} from '@flex-thia/contracts';
import { type FormEvent, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';

interface PracticeSetupFormProps {
  wordbooks: WordbookSummary[];
  searchResults: VocabularySummary[];
  onSearch: (query: string) => void;
  onStart: (request: CreateVocabularyPracticeRequest) => Promise<string>;
  onCreated: (sessionId: string) => void;
}

const modeLabels: Array<{ mode: PracticeMode; label: string }> = [
  { mode: 'THAI_TO_MEANING', label: '태국어 → 뜻' },
  { mode: 'MEANING_TO_THAI', label: '뜻 → 태국어' },
  { mode: 'AUDIO_TO_THAI', label: '음성 → 태국어' },
  { mode: 'AUDIO_TO_MEANING', label: '음성 → 뜻' },
];

/** 필수 설정을 검증하고 생성된 session ID를 화면 이동에 전달한다 */
export function PracticeSetupForm({
  wordbooks,
  searchResults,
  onSearch,
  onStart,
  onCreated,
}: PracticeSetupFormProps) {
  const [sourceType, setSourceType] = useState<'SEARCH' | 'WORDBOOK' | ''>('');
  const [wordbookId, setWordbookId] = useState('');
  const [selectedVocabularyIds, setSelectedVocabularyIds] = useState<
    Set<string>
  >(new Set());
  const [modes, setModes] = useState<PracticeMode[]>([]);
  const [questionCount, setQuestionCount] = useState<10 | 20 | 'ALL'>(10);
  const [order, setOrder] = useState<'SOURCE' | 'RANDOM'>('SOURCE');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: string[] = [];
    const hasSource =
      (sourceType === 'WORDBOOK' && wordbookId !== '') ||
      (sourceType === 'SEARCH' && selectedVocabularyIds.size > 0);
    if (!hasSource) nextErrors.push('연습할 출처를 선택해 주세요.');
    if (modes.length === 0) {
      nextErrors.push('기억 확인 방식을 선택해 주세요.');
    }
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    const source: CreateVocabularyPracticeRequest['source'] =
      sourceType === 'WORDBOOK'
        ? { type: 'WORDBOOK', wordbookId }
        : {
            type: 'SEARCH_SELECTION',
            vocabularyIds: [...selectedVocabularyIds],
          };
    setPending(true);
    try {
      onCreated(await onStart({ source, modes, questionCount, order }));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => void submit(event)}
    >
      <fieldset className='grid gap-cluster'>
        <legend className='text-heading'>연습 출처</legend>
        <RadioGroup
          onValueChange={(value) =>
            setSourceType(value as 'SEARCH' | 'WORDBOOK')
          }
          value={sourceType}
        >
          <div className='flex items-center gap-cluster'>
            <RadioGroupItem
              id='practice-source-wordbook'
              value='WORDBOOK'
            />
            <Label htmlFor='practice-source-wordbook'>내 단어장</Label>
          </div>
          <div className='flex items-center gap-cluster'>
            <RadioGroupItem
              id='practice-source-search'
              value='SEARCH'
            />
            <Label htmlFor='practice-source-search'>공용 어휘 검색</Label>
          </div>
        </RadioGroup>
        {sourceType === 'WORDBOOK' ? (
          <RadioGroup
            onValueChange={setWordbookId}
            value={wordbookId}
          >
            {wordbooks.map((wordbook) => (
              <div
                className='flex items-center gap-cluster'
                key={wordbook.id}
              >
                <RadioGroupItem
                  id={`wordbook-${wordbook.id}`}
                  value={wordbook.id}
                />
                <Label htmlFor={`wordbook-${wordbook.id}`}>
                  {wordbook.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
        ) : null}
        {sourceType === 'SEARCH' ? (
          <div className='grid gap-cluster'>
            <Label htmlFor='practice-search'>어휘 검색</Label>
            <Input
              id='practice-search'
              onChange={(event) => onSearch(event.target.value)}
            />
            {searchResults.map((vocabulary) => {
              const selected = selectedVocabularyIds.has(vocabulary.id);
              return (
                <Button
                  aria-pressed={selected}
                  key={vocabulary.id}
                  onClick={() => {
                    const next = new Set(selectedVocabularyIds);
                    if (selected) next.delete(vocabulary.id);
                    else next.add(vocabulary.id);
                    setSelectedVocabularyIds(next);
                  }}
                  type='button'
                  variant='outline'
                >
                  {vocabulary.thai}
                </Button>
              );
            })}
          </div>
        ) : null}
      </fieldset>

      <fieldset className='grid gap-cluster'>
        <legend className='text-heading'>기억 확인 방식</legend>
        {modeLabels.map(({ mode, label }) => (
          <Button
            aria-pressed={modes.includes(mode)}
            key={mode}
            onClick={() =>
              setModes((current) =>
                current.includes(mode)
                  ? current.filter((value) => value !== mode)
                  : [...current, mode],
              )
            }
            type='button'
            variant='outline'
          >
            {label}
          </Button>
        ))}
      </fieldset>

      <fieldset>
        <legend className='text-heading'>문항 수</legend>
        <RadioGroup
          onValueChange={(value) =>
            setQuestionCount(value === 'ALL' ? 'ALL' : value === '20' ? 20 : 10)
          }
          value={String(questionCount)}
        >
          {[
            ['10', '10문항'],
            ['20', '20문항'],
            ['ALL', '전체'],
          ].map(([value, label]) => (
            <div key={value}>
              <RadioGroupItem
                id={`count-${value}`}
                value={value ?? '10'}
              />
              <Label htmlFor={`count-${value}`}>{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset>
        <legend className='text-heading'>출제 순서</legend>
        <RadioGroup
          onValueChange={(value) => setOrder(value as 'SOURCE' | 'RANDOM')}
          value={order}
        >
          <div>
            <RadioGroupItem
              id='order-source'
              value='SOURCE'
            />
            <Label htmlFor='order-source'>출처 순서</Label>
          </div>
          <div>
            <RadioGroupItem
              id='order-random'
              value='RANDOM'
            />
            <Label htmlFor='order-random'>무작위 순서</Label>
          </div>
        </RadioGroup>
      </fieldset>

      {errors.map((error) => (
        <p
          className='text-body text-danger'
          key={error}
        >
          {error}
        </p>
      ))}
      <Button disabled={pending}>연습 시작</Button>
    </form>
  );
}
