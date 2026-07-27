/** 관리자 문제 분류 설정 query와 mutation HTTP 계약을 정의한다 */
import {
  createQuestionTaxonomyTermRequestSchema,
  createQuestionTypeRequestSchema,
  createQuestionTypeVersionRequestSchema,
  questionTaxonomySettingsResponseSchema,
  questionTypeApprovedExampleRequestSchema,
  replaceDifficultyCriteriaRequestSchema,
  type CreateQuestionTaxonomyTermRequest,
  type CreateQuestionTypeRequest,
  type CreateQuestionTypeVersionRequest,
  type QuestionTypeApprovedExampleRequest,
  type ReplaceDifficultyCriteriaRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { authenticatedRequest } from '@/shared/api';

const uuidSchema = z.uuid();
const unknownResponse = { kind: 'json', schema: z.unknown() } as const;

/** 관리자 문제 분류 설정 전체 query */
export const questionTaxonomySettingsQueryOptions = () =>
  queryOptions({
    queryKey: ['admin', 'question-taxonomy'] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: '/admin/question-taxonomy',
        response: {
          kind: 'json',
          schema: questionTaxonomySettingsResponseSchema,
        },
        signal,
      }),
  });

/** 논리 유형과 첫 DRAFT를 만든다 */
export const createQuestionType = (input: CreateQuestionTypeRequest) =>
  authenticatedRequest({
    body: createQuestionTypeRequestSchema.parse(input),
    method: 'POST',
    path: '/admin/question-types',
    response: unknownResponse,
  });

/** 기존 유형에 다음 DRAFT를 만든다 */
export const createQuestionTypeVersion = (command: {
  questionTypeId: string;
  input: CreateQuestionTypeVersionRequest;
}) =>
  authenticatedRequest({
    body: createQuestionTypeVersionRequestSchema.parse(command.input),
    method: 'POST',
    path: `/admin/question-types/${uuidSchema.parse(command.questionTypeId)}/versions`,
    response: unknownResponse,
  });

/** DRAFT의 1~5 난이도 기준을 전체 교체한다 */
export const replaceDifficultyCriteria = (command: {
  versionId: string;
  input: ReplaceDifficultyCriteriaRequest;
}) =>
  authenticatedRequest({
    body: replaceDifficultyCriteriaRequestSchema.parse(command.input),
    method: 'PUT',
    path: `/admin/question-type-versions/${uuidSchema.parse(command.versionId)}/difficulty-criteria`,
    response: { kind: 'empty' },
  });

/** DRAFT에 canonical 승인 예시를 추가한다 */
export const addApprovedExample = (command: {
  versionId: string;
  input: QuestionTypeApprovedExampleRequest;
}) =>
  authenticatedRequest({
    body: questionTypeApprovedExampleRequestSchema.parse(command.input),
    method: 'POST',
    path: `/admin/question-type-versions/${uuidSchema.parse(command.versionId)}/examples`,
    response: { kind: 'empty' },
  });

/** 유형 버전 lifecycle을 전환한다 */
export const changeQuestionTypeVersionStatus = (command: {
  versionId: string;
  action: 'activate' | 'retire';
}) =>
  authenticatedRequest({
    method: 'POST',
    path: `/admin/question-type-versions/${uuidSchema.parse(command.versionId)}/${command.action}`,
    response: { kind: 'empty' },
  });

/** 선택 가능한 주제 또는 태그를 만든다 */
export const createTaxonomyTerm = (command: {
  kind: 'topic' | 'tag';
  input: CreateQuestionTaxonomyTermRequest;
}) =>
  authenticatedRequest({
    body: createQuestionTaxonomyTermRequestSchema.parse(command.input),
    method: 'POST',
    path: `/admin/question-${command.kind}s`,
    response: unknownResponse,
  });

/** 주제 또는 태그를 신규 선택 목록에서 보관한다 */
export const archiveTaxonomyTerm = (command: {
  kind: 'topic' | 'tag';
  id: string;
}) =>
  authenticatedRequest({
    method: 'POST',
    path: `/admin/question-${command.kind}s/${uuidSchema.parse(command.id)}/archive`,
    response: { kind: 'empty' },
  });
