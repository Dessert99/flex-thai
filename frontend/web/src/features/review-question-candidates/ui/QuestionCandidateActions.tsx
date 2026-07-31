/** 후보 단건·bulk 검수 행동을 현재 revision과 함께 노출한다 */
import { Button } from '@/shared/ui/button';

interface QuestionCandidateActionsProps {
  disabled?: boolean;
  approveDisabled?: boolean;
  onApprove: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
}

/** 세 command를 명시적 사용자 클릭으로만 실행한다 */
export function QuestionCandidateActions({
  disabled = false,
  approveDisabled = false,
  onApprove,
  onDiscard,
  onRegenerate,
}: QuestionCandidateActionsProps) {
  return (
    <div className='flex flex-wrap gap-cluster'>
      <Button
        disabled={disabled || approveDisabled}
        onClick={onApprove}
        type='button'
      >
        승인
      </Button>
      <Button
        disabled={disabled}
        onClick={onRegenerate}
        type='button'
        variant='outline'
      >
        재생성
      </Button>
      <Button
        disabled={disabled}
        onClick={onDiscard}
        type='button'
        variant='destructive'
      >
        폐기
      </Button>
    </div>
  );
}
