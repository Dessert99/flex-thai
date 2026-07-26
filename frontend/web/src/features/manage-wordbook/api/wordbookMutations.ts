/** 단어장 생성·이름 변경·삭제 HTTP mutation을 제공한다 */
import {
  wordbookResponseSchema,
  type WordbookResponse,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** trim된 이름으로 단어장을 생성한다 */
export function createWordbook(name: string): Promise<WordbookResponse> {
  return authenticatedRequest({
    body: { name },
    method: 'POST',
    path: '/me/wordbooks',
    response: { kind: 'json', schema: wordbookResponseSchema },
  });
}

/** 소유 단어장 이름을 변경한다 */
export function renameWordbook(
  wordbookId: string,
  name: string,
): Promise<WordbookResponse> {
  return authenticatedRequest({
    body: { name },
    method: 'PATCH',
    path: `/me/wordbooks/${wordbookId}`,
    response: { kind: 'json', schema: wordbookResponseSchema },
  });
}

/** 소유 단어장을 삭제한다 */
export function deleteWordbook(wordbookId: string): Promise<void> {
  return authenticatedRequest({
    method: 'DELETE',
    path: `/me/wordbooks/${wordbookId}`,
    response: { kind: 'empty' },
  });
}
