/** 관리자 지시문 목록과 저장·삭제 API */
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import {
  extractionTemplateInputSchema,
  extractionTemplateListSchema,
  extractionTemplateSchema,
  type ExtractionTemplateInput,
} from '@flex-thia/contracts/vocabulary-extraction/extraction-templates';
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';
const path = '/admin/vocabulary-extraction/templates';
export const extractionTemplatesQueryOptions = () =>
  queryOptions({
    queryKey: ['admin', 'vocabulary-extraction', 'templates'],
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path,
        signal,
        response: { kind: 'json', schema: extractionTemplateListSchema },
      }),
  });
export const createExtractionTemplate = (input: ExtractionTemplateInput) =>
  authenticatedRequest({
    path,
    method: 'POST',
    body: extractionTemplateInputSchema.parse(input),
    response: { kind: 'json', schema: extractionTemplateSchema },
  });
export const deleteExtractionTemplate = (id: string) =>
  authenticatedRequest({
    path: `${path}/${z.uuid().parse(id)}`,
    method: 'DELETE',
    response: { kind: 'empty' },
  });
