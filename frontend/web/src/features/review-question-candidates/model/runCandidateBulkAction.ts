/** 후보 단건 command를 입력 순서와 부분 실패를 보존하는 bounded worker pool로 조합한다 */
import {
  approveQuestionCandidate,
  discardQuestionCandidate,
  regenerateQuestionCandidate,
} from '../api/questionCandidateApi';

/** bulk 후보 입력 */
export type CandidateBulkTarget = { candidateId: string; revision: number };
/** bulk 후보 결과 */
export type CandidateBulkResult =
  | { candidateId: string; status: 'SUCCEEDED' }
  | { candidateId: string; status: 'FAILED'; error: unknown };

const actionFor = {
  APPROVE: approveQuestionCandidate,
  DISCARD: discardQuestionCandidate,
  REGENERATE: regenerateQuestionCandidate,
} as const;

/** 최대 concurrency 요청만 실행하며 한 실패로 batch 전체를 reject하지 않는다 */
export async function runCandidateBulkAction(
  selected: CandidateBulkTarget[],
  action: keyof typeof actionFor,
  concurrency = 4,
): Promise<CandidateBulkResult[]> {
  const results = new Array<CandidateBulkResult>(selected.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < selected.length) {
      const index = cursor++;
      const target = selected[index]!;
      try {
        await actionFor[action](target.candidateId, target.revision);
        results[index] = { candidateId: target.candidateId, status: 'SUCCEEDED' };
      } catch (error) {
        results[index] = { candidateId: target.candidateId, status: 'FAILED', error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), selected.length) }, worker),
  );
  return results;
}
