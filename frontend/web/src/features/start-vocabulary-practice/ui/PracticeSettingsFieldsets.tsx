/** 단어 연습 방식·문항 수·출제 순서 설정을 표시한다 */
import type { PracticeMode } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';

type QuestionCount = 10 | 20 | 'ALL';

const modeLabels: Array<{ mode: PracticeMode; label: string }> = [
  { mode: 'THAI_TO_MEANING', label: '태국어 → 뜻' },
  { mode: 'MEANING_TO_THAI', label: '뜻 → 태국어' },
  { mode: 'AUDIO_TO_THAI', label: '음성 → 태국어' },
  { mode: 'AUDIO_TO_MEANING', label: '음성 → 뜻' },
];

interface PracticeSettingsFieldsetsProps {
  disabled: boolean;
  modes: PracticeMode[];
  onChangeModes: (value: PracticeMode[]) => void;
  onChangeOrder: (value: 'SOURCE' | 'RANDOM') => void;
  onChangeQuestionCount: (value: QuestionCount) => void;
  order: 'SOURCE' | 'RANDOM';
  questionCount: QuestionCount;
}

/** 방식·문항 수·순서 fieldset을 조립한다 */
export function PracticeSettingsFieldsets({
  disabled,
  modes,
  onChangeModes,
  onChangeOrder,
  onChangeQuestionCount,
  order,
  questionCount,
}: PracticeSettingsFieldsetsProps) {
  return (
    <>
      <fieldset
        className='grid gap-cluster'
        disabled={disabled}
      >
        <legend className='text-heading'>기억 확인 방식</legend>
        {modeLabels.map(({ mode, label }) => (
          <Button
            aria-pressed={modes.includes(mode)}
            key={mode}
            onClick={() => onChangeModes(toggleMode(modes, mode))}
            type='button'
            variant='outline'
          >
            {label}
          </Button>
        ))}
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className='text-heading'>문항 수</legend>
        <RadioGroup
          onValueChange={(value) =>
            onChangeQuestionCount(parseQuestionCount(value))
          }
          value={String(questionCount)}
        >
          <RadioChoice
            id='count-10'
            label='10문항'
            value='10'
          />
          <RadioChoice
            id='count-20'
            label='20문항'
            value='20'
          />
          <RadioChoice
            id='count-ALL'
            label='전체'
            value='ALL'
          />
        </RadioGroup>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className='text-heading'>출제 순서</legend>
        <RadioGroup
          onValueChange={(value) => onChangeOrder(value as 'SOURCE' | 'RANDOM')}
          value={order}
        >
          <RadioChoice
            id='order-source'
            label='출처 순서'
            value='SOURCE'
          />
          <RadioChoice
            id='order-random'
            label='무작위 순서'
            value='RANDOM'
          />
        </RadioGroup>
      </fieldset>
    </>
  );
}

function toggleMode(modes: PracticeMode[], mode: PracticeMode) {
  return modes.includes(mode)
    ? modes.filter((value) => value !== mode)
    : [...modes, mode];
}

function parseQuestionCount(value: string): QuestionCount {
  if (value === 'ALL') return 'ALL';
  return value === '20' ? 20 : 10;
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
