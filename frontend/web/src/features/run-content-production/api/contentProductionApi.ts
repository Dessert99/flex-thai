/** 콘텐츠 제작 preset·prompt·job HTTP 계약과 React Query 경계를 정의한다 */
import {
  contentProductionJobDetailResponseSchema,
  contentProductionJobListResponseSchema,
  contentProductionJobSummarySchema,
  contentProductionPresetListResponseSchema,
  createContentProductionJobRequestSchema,
  promptPreviewRequestSchema,
  promptPreviewResponseSchema,
  type CreateContentProductionJobRequest,
  type PromptPreviewRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { authenticatedRequest } from '@/shared/api';

const uuidSchema = z.uuid();

/** enabled 콘텐츠 제작 preset query */
export const contentProductionPresetsQueryOptions = () =>
  queryOptions({
    queryKey: ['admin', 'content-production', 'presets'] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: '/admin/content-production/presets',
        response: {
          kind: 'json',
          schema: contentProductionPresetListResponseSchema,
        },
        signal,
      }),
  });

/** 최근 콘텐츠 제작 job query */
export const contentProductionJobsQueryOptions = (limit = 20) =>
  queryOptions({
    queryKey: ['admin', 'content-production', 'jobs', limit] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/content-production/jobs?limit=${limit}`,
        response: {
          kind: 'json',
          schema: contentProductionJobListResponseSchema,
        },
        signal,
      }),
  });

/** 콘텐츠 제작 job 상세 query */
export const contentProductionJobQueryOptions = (jobId: string) =>
  queryOptions({
    queryKey: ['admin', 'content-production', 'jobs', jobId] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/content-production/jobs/${uuidSchema.parse(jobId)}`,
        response: {
          kind: 'json',
          schema: contentProductionJobDetailResponseSchema,
        },
        signal,
      }),
  });

/** effective snapshot으로 prompt preview를 요청한다 */
export const previewContentProductionPrompt = (request: PromptPreviewRequest) =>
  authenticatedRequest({
    body: promptPreviewRequestSchema.parse(request),
    method: 'POST',
    path: '/admin/content-production/prompt-previews',
    response: { kind: 'json', schema: promptPreviewResponseSchema },
  });

/** 검증된 upload와 effective snapshot으로 job을 생성한다 */
export const createContentProductionJob = (
  request: CreateContentProductionJobRequest,
) =>
  authenticatedRequest({
    body: createContentProductionJobRequestSchema.parse(request),
    method: 'POST',
    path: '/admin/content-production/jobs',
    response: { kind: 'json', schema: contentProductionJobSummarySchema },
  });

/** retryable item만 다음 attempt로 다시 접수한다 */
export const retryContentProductionJob = (jobId: string) =>
  authenticatedRequest({
    method: 'POST',
    path: `/admin/content-production/jobs/${uuidSchema.parse(jobId)}/retry`,
    response: { kind: 'json', schema: contentProductionJobSummarySchema },
  });
