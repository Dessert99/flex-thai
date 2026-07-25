/** 관리자 문제에서 새 DRAFT를 복제하고 반환 ID를 navigation에 전달한다 */
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/shared/ui/button';
import { cloneQuestionVersion } from '../api/questionVersionMutations';

interface CloneQuestionVersionButtonProps {
  onCloned: (result: { questionId: string; versionId: string }) => void;
  questionId: string;
}

/** body 없는 clone 성공 뒤에만 owning Page에 새 버전 ID를 알린다 */
export function CloneQuestionVersionButton({
  onCloned,
  questionId,
}: CloneQuestionVersionButtonProps) {
  const clone = useMutation({
    mutationFn: () => cloneQuestionVersion(questionId),
    onSuccess: ({ questionId: nextQuestionId, versionId }) =>
      onCloned({ questionId: nextQuestionId, versionId }),
    retry: false,
  });
  return (
    <div className='grid gap-cluster'>
      <Button
        disabled={clone.isPending}
        onClick={() => clone.mutate()}
        type='button'
        variant='outline'
      >
        새 DRAFT 복제
      </Button>
      {clone.isError ? (
        <p className='text-body text-danger'>새 DRAFT를 복제하지 못했습니다.</p>
      ) : null}
    </div>
  );
}
