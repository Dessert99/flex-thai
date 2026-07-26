/** 태국어 단어와 표현의 학습 피드백을 여는 접근 가능한 trigger를 제공한다 */
import { Button } from '@/shared/ui/button';

/** trigger가 선택될 때 공개할 학습 피드백 */
export interface ThaiFeedback {
  contextMeaningKo: string;
  pronunciationKo: string;
  toneMarks: string;
  audioUrl: string | null;
}

interface ThaiFeedbackTriggerProps {
  label: string;
  surface: string;
  feedback: ThaiFeedback;
  onActivate: (feedback: ThaiFeedback) => void;
  onSelect: (feedback: ThaiFeedback) => void;
}

/** focus·hover로 설명을 열고 activation으로 음성을 재생한다 */
export function ThaiFeedbackTrigger({
  label,
  surface,
  feedback,
  onActivate,
  onSelect,
}: ThaiFeedbackTriggerProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto px-0.5 py-0 text-base underline decoration-dotted underline-offset-4"
      aria-label={label}
      onFocus={() => onSelect(feedback)}
      onMouseEnter={() => onSelect(feedback)}
      onClick={() => onActivate(feedback)}
    >
      {surface}
    </Button>
  );
}
