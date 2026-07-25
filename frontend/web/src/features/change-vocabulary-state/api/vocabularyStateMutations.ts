/** 어휘 publish·hide·restore를 body 없는 확인 mutation으로 정의한다 */
import { adminVocabularyIdPathSchema } from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 어휘 상태 action 종류 */
export type VocabularyStateActionKind = 'hide' | 'publish' | 'restore';

/** 서버가 상태 prerequisite를 확인하는 어휘 action을 실행한다 */
export function changeVocabularyState(command: {
  action: VocabularyStateActionKind;
  vocabularyId: string;
}) {
  const { vocabularyId } = adminVocabularyIdPathSchema.parse({
    vocabularyId: command.vocabularyId,
  });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/vocabularies/${vocabularyId}/${command.action}`,
    response: { kind: 'empty' },
  });
}
