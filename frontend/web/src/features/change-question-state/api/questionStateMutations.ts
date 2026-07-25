/** 문제·버전 상태 변경 command를 body 없는 관리자 POST로 제한한다 */
import {
  adminQuestionIdPathSchema,
  adminQuestionVersionIdPathSchema,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 문제 상태 변경이 지원하는 공개 command */
export type QuestionStateCommand =
  | { action: 'hide' | 'restore'; questionId: string }
  | { action: 'invalidate' | 'publish'; versionId: string };

/** command kind별 공개 endpoint를 선택하고 응답 body를 기대하지 않는다 */
export function changeQuestionState(command: QuestionStateCommand) {
  const path =
    'questionId' in command
      ? `/admin/questions/${
          adminQuestionIdPathSchema.parse({ questionId: command.questionId })
            .questionId
        }/${command.action}`
      : `/admin/question-versions/${
          adminQuestionVersionIdPathSchema.parse({
            versionId: command.versionId,
          }).versionId
        }/${command.action}`;
  return authenticatedRequest({
    method: 'POST',
    path,
    response: { kind: 'empty' },
  });
}
