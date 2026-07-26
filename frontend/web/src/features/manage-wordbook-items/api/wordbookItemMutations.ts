/** 단어장 선택 항목 복사·이동·제거 HTTP mutation을 제공한다 */
import { authenticatedRequest } from '@/shared/api';

const transfer = (
  operation: 'copy' | 'move',
  sourceId: string,
  targetId: string,
  vocabularyIds: string[],
) =>
  authenticatedRequest<void>({
    body: { targetWordbookId: targetId, vocabularyIds },
    method: 'POST',
    path: `/me/wordbooks/${sourceId}/items/${operation}`,
    response: { kind: 'empty' },
  });

/** 선택 항목을 대상 단어장에 복사한다 */
export function copyWordbookItems(
  sourceId: string,
  targetId: string,
  vocabularyIds: string[],
): Promise<void> {
  return transfer('copy', sourceId, targetId, vocabularyIds);
}

/** 선택 항목을 대상 단어장으로 이동한다 */
export function moveWordbookItems(
  sourceId: string,
  targetId: string,
  vocabularyIds: string[],
): Promise<void> {
  return transfer('move', sourceId, targetId, vocabularyIds);
}

/** 선택 항목을 현재 단어장에서 제거한다 */
export function removeWordbookItems(
  sourceId: string,
  vocabularyIds: string[],
): Promise<void> {
  return authenticatedRequest({
    body: { vocabularyIds },
    method: 'POST',
    path: `/me/wordbooks/${sourceId}/items/remove`,
    response: { kind: 'empty' },
  });
}
