/** 문제 후보 조회와 optimistic 단건 검수 command를 strict 계약으로 전송한다 */
import {
  approveQuestionCandidateRequestSchema,
  approveQuestionCandidateResponseSchema,
  discardQuestionCandidateRequestSchema,
  discardQuestionCandidateResponseSchema,
  questionCandidateDetailResponseSchema,
  questionCandidateListQuerySchema,
  questionCandidateListResponseSchema,
  regenerateQuestionCandidateRequestSchema,
  regenerateQuestionCandidateResponseSchema,
  type QuestionCandidateListQuery,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { authenticatedRequest } from '@/shared/api';

const uuidSchema = z.uuid();
const reviewBody = (revision: number) => ({
  expectedRevision: revision,
  requestId: crypto.randomUUID(),
});

/** 후보 filter page query */
export const questionCandidatesQueryOptions = (
  input: QuestionCandidateListQuery,
) => {
  const query = questionCandidateListQuerySchema.parse(input);
  const search = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  );
  return queryOptions({
    queryKey: ['admin', 'content-production', 'candidates', query] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/content-production/question-candidates?${search}`,
        response: { kind: 'json', schema: questionCandidateListResponseSchema },
        signal,
      }),
  });
};

/** 후보 상세 query */
export const questionCandidateQueryOptions = (candidateId: string) =>
  queryOptions({
    queryKey: [
      'admin',
      'content-production',
      'candidates',
      candidateId,
    ] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/content-production/question-candidates/${uuidSchema.parse(candidateId)}`,
        response: {
          kind: 'json',
          schema: questionCandidateDetailResponseSchema,
        },
        signal,
      }),
  });

/** 후보를 승인해 DRAFT로 만든다 */
export const approveQuestionCandidate = (
  candidateId: string,
  revision: number,
) =>
  authenticatedRequest({
    body: approveQuestionCandidateRequestSchema.parse(reviewBody(revision)),
    method: 'POST',
    path: `/admin/content-production/question-candidates/${uuidSchema.parse(candidateId)}/approve`,
    response: { kind: 'json', schema: approveQuestionCandidateResponseSchema },
  });

/** 후보를 terminal 폐기한다 */
export const discardQuestionCandidate = (
  candidateId: string,
  revision: number,
) =>
  authenticatedRequest({
    body: discardQuestionCandidateRequestSchema.parse(reviewBody(revision)),
    method: 'DELETE',
    path: `/admin/content-production/question-candidates/${uuidSchema.parse(candidateId)}`,
    response: { kind: 'json', schema: discardQuestionCandidateResponseSchema },
  });

/** 원본을 보존한 재생성 attempt를 접수한다 */
export const regenerateQuestionCandidate = (
  candidateId: string,
  revision: number,
) =>
  authenticatedRequest({
    body: regenerateQuestionCandidateRequestSchema.parse(reviewBody(revision)),
    method: 'POST',
    path: `/admin/content-production/question-candidates/${uuidSchema.parse(candidateId)}/regenerate`,
    response: {
      kind: 'json',
      schema: regenerateQuestionCandidateResponseSchema,
    },
  });
