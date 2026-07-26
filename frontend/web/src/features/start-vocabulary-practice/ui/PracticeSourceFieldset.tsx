/** 단어장 또는 최대 100개 검색 어휘의 연습 출처 선택을 표시한다 */
import type {
  VocabularySummary,
  WordbookSummary,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';

type SourceType = 'SEARCH' | 'WORDBOOK' | '';
type SearchStateValue = 'IDLE' | 'LOADING' | 'ERROR' | 'SUCCESS';

interface PracticeSourceFieldsetProps {
  disabled: boolean;
  onRetrySearch: () => void;
  onSearch: (query: string) => void;
  onSelectSource: (value: SourceType) => void;
  onSelectVocabulary: (value: VocabularySummary) => void;
  onSelectWordbook: (value: string) => void;
  searchResults: VocabularySummary[];
  searchState: SearchStateValue;
  selectedVocabularies: Map<string, VocabularySummary>;
  sourceType: SourceType;
  wordbookId: string;
  wordbooks: WordbookSummary[];
}

/** 출처 종류와 해당 단어장·검색 선택기를 조립한다 */
export function PracticeSourceFieldset({
  disabled,
  onRetrySearch,
  onSearch,
  onSelectSource,
  onSelectVocabulary,
  onSelectWordbook,
  searchResults,
  searchState,
  selectedVocabularies,
  sourceType,
  wordbookId,
  wordbooks,
}: PracticeSourceFieldsetProps) {
  return (
    <fieldset
      className='grid gap-cluster'
      disabled={disabled}
    >
      <legend className='text-heading'>연습 출처</legend>
      <SourceTypeRadio
        onChange={onSelectSource}
        value={sourceType}
      />
      {sourceType === 'WORDBOOK' ? (
        <WordbookSelector
          onChange={onSelectWordbook}
          value={wordbookId}
          wordbooks={wordbooks}
        />
      ) : null}
      {sourceType === 'SEARCH' ? (
        <VocabularySelector
          onRetrySearch={onRetrySearch}
          onSearch={onSearch}
          onSelect={onSelectVocabulary}
          results={searchResults}
          searchState={searchState}
          selected={selectedVocabularies}
        />
      ) : null}
    </fieldset>
  );
}

function SourceTypeRadio({
  onChange,
  value,
}: {
  onChange: (value: SourceType) => void;
  value: SourceType;
}) {
  return (
    <RadioGroup
      onValueChange={(next) => onChange(next as SourceType)}
      value={value}
    >
      <RadioChoice
        id='practice-source-wordbook'
        label='내 단어장'
        value='WORDBOOK'
      />
      <RadioChoice
        id='practice-source-search'
        label='공용 어휘 검색'
        value='SEARCH'
      />
    </RadioGroup>
  );
}

function WordbookSelector({
  onChange,
  value,
  wordbooks,
}: {
  onChange: (value: string) => void;
  value: string;
  wordbooks: WordbookSummary[];
}) {
  if (wordbooks.length === 0) return <p>저장한 단어장이 없습니다.</p>;
  return (
    <RadioGroup
      onValueChange={onChange}
      value={value}
    >
      {wordbooks.map((wordbook) => (
        <RadioChoice
          id={`wordbook-${wordbook.id}`}
          key={wordbook.id}
          label={wordbook.name}
          value={wordbook.id}
        />
      ))}
    </RadioGroup>
  );
}

function VocabularySelector({
  onRetrySearch,
  onSearch,
  onSelect,
  results,
  searchState,
  selected,
}: {
  onRetrySearch: () => void;
  onSearch: (query: string) => void;
  onSelect: (value: VocabularySummary) => void;
  results: VocabularySummary[];
  searchState: SearchStateValue;
  selected: Map<string, VocabularySummary>;
}) {
  const [query, setQuery] = useState('');
  const eligibleMeaningCount = [...selected.values()].reduce(
    (count, vocabulary) => count + vocabulary.meanings.length,
    0,
  );
  return (
    <div className='grid gap-cluster'>
      <Label htmlFor='practice-search'>어휘 검색</Label>
      <Input
        id='practice-search'
        onChange={(event) => {
          setQuery(event.target.value);
          onSearch(event.target.value);
        }}
      />
      <p>선택 {selected.size} / 100</p>
      <p>연습 가능 어의 {eligibleMeaningCount}개</p>
      <SearchState
        hasQuery={query.trim().length > 0}
        onRetry={onRetrySearch}
        resultCount={results.length}
        state={searchState}
      />
      {results.map((vocabulary) => {
        const isSelected = selected.has(vocabulary.id);
        return (
          <Button
            aria-pressed={isSelected}
            disabled={!isSelected && selected.size >= 100}
            key={vocabulary.id}
            onClick={() => onSelect(vocabulary)}
            type='button'
            variant='outline'
          >
            {vocabulary.thai}
          </Button>
        );
      })}
    </div>
  );
}

function SearchState({
  hasQuery,
  onRetry,
  resultCount,
  state,
}: {
  hasQuery: boolean;
  onRetry: () => void;
  resultCount: number;
  state: SearchStateValue;
}) {
  if (!hasQuery || state === 'IDLE') return null;
  if (state === 'LOADING') return <p role='status'>어휘를 검색하고 있습니다.</p>;
  if (state === 'ERROR') {
    return (
      <div>
        <p role='alert'>어휘를 검색하지 못했습니다.</p>
        <Button
          onClick={onRetry}
          type='button'
          variant='outline'
        >
          검색 다시 시도
        </Button>
      </div>
    );
  }
  return resultCount === 0 ? <p>검색 결과가 없습니다.</p> : null;
}

function RadioChoice({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <div className='flex items-center gap-cluster'>
      <RadioGroupItem
        id={id}
        value={value}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
