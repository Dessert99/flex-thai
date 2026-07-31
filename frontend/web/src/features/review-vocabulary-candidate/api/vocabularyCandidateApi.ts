/** 어휘 후보 조회와 optimistic 단건 검수 command를 strict 계약으로 전송한다 */
import {
  vocabularyCandidateApproveRequestSchema,
  vocabularyCandidateApproveResponseSchema,
  vocabularyCandidateDetailResponseSchema,
  vocabularyCandidateDiscardRequestSchema,
  vocabularyCandidateDiscardResponseSchema,
  vocabularyCandidateListQuerySchema,
  vocabularyCandidateListResponseSchema,
  type VocabularyCandidateApproveRequest,
  type VocabularyCandidateListQuery,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { authenticatedRequest } from '@/shared/api';

const uuidSchema = z.uuid();

/** 화면이 입력하고 transport가 revision·requestId를 보완하는 승인 payload */
export type VocabularyCandidateApprovalInput =
  VocabularyCandidateApproveRequest extends infer Approval
    ? Approval extends { expectedRevision: number; requestId: string }
      ? Omit<Approval, 'expectedRevision' | 'requestId'>
      : never
    : never;

/** 어휘 후보 filter page query */
export const vocabularyCandidatesQueryOptions = (
  input: VocabularyCandidateListQuery,
) => {
  const query = vocabularyCandidateListQuerySchema.parse(input);
  const search = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  );
  return queryOptions({
    queryKey: [
      'admin',
      'content-production',
      'vocabulary-candidates',
      query,
    ] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/content-production/vocabulary-candidates?${search}`,
        response: {
          kind: 'json',
          schema: vocabularyCandidateListResponseSchema,
        },
        signal,
      }),
  });
};

/** 어휘 후보 상세 query */
export const vocabularyCandidateQueryOptions = (candidateId: string) =>
  queryOptions({
    queryKey: [
      'admin',
      'content-production',
      'vocabulary-candidates',
      candidateId,
    ] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/content-production/vocabulary-candidates/${uuidSchema.parse(candidateId)}`,
        response: {
          kind: 'json',
          schema: vocabularyCandidateDetailResponseSchema,
        },
        signal,
      }),
  });

/** 완전한 DRAFT graph를 생성하거나 기존 어휘에 후보를 연결한다 */
export const approveVocabularyCandidate = (
  candidateId: string,
  revision: number,
  input: VocabularyCandidateApprovalInput,
) =>
  authenticatedRequest({
    body: vocabularyCandidateApproveRequestSchema.parse({
      ...input,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
    }),
    method: 'POST',
    path: `/admin/content-production/vocabulary-candidates/${uuidSchema.parse(candidateId)}/approve`,
    response: {
      kind: 'json',
      schema: vocabularyCandidateApproveResponseSchema,
    },
  });

/** 어휘 후보를 terminal 폐기한다 */
export const discardVocabularyCandidate = (
  candidateId: string,
  revision: number,
) =>
  authenticatedRequest({
    body: vocabularyCandidateDiscardRequestSchema.parse({
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
    }),
    method: 'DELETE',
    path: `/admin/content-production/vocabulary-candidates/${uuidSchema.parse(candidateId)}`,
    response: {
      kind: 'json',
      schema: vocabularyCandidateDiscardResponseSchema,
    },
  });
