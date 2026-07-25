/** 어휘 저장·해제를 서버 확정 방식으로 전환한다 */
import { authenticatedRequest } from '@/shared/api';

/** 현재 저장 상태의 반대 작업을 실행하고 확정 상태를 반환한다 */
export async function changeSavedVocabulary(
  vocabularyId: string,
  saved: boolean,
): Promise<boolean> {
  await authenticatedRequest({
    method: saved ? 'DELETE' : 'PUT',
    path: `/me/saved-vocabularies/${vocabularyId}`,
    response: { kind: 'empty' },
  });
  return !saved;
}
