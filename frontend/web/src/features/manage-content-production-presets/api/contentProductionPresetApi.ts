/** 콘텐츠 제작 preset immutable version과 enabled command API를 정의한다 */
import {
  contentProductionPresetVersionListResponseSchema,
  contentProductionPresetVersionSchema,
  createContentProductionPresetRequestSchema,
  createContentProductionPresetVersionRequestSchema,
  setContentProductionPresetEnabledRequestSchema,
  type CreateContentProductionPresetRequest,
  type CreateContentProductionPresetVersionRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { authenticatedRequest } from '@/shared/api';

const uuidSchema = z.uuid();

/** preset version 운영 목록 query */
export const contentProductionPresetVersionsQueryOptions = () =>
  queryOptions({
    queryKey: ['admin', 'content-production', 'preset-versions'] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: '/admin/content-production/preset-versions',
        response: {
          kind: 'json',
          schema: contentProductionPresetVersionListResponseSchema,
        },
        signal,
      }),
  });

/** 새 이름의 최초 preset version을 만든다 */
export const createContentProductionPreset = (
  request: Omit<CreateContentProductionPresetRequest, 'requestId'>,
) =>
  authenticatedRequest({
    body: createContentProductionPresetRequestSchema.parse({
      ...request,
      requestId: crypto.randomUUID(),
    }),
    method: 'POST',
    path: '/admin/content-production/presets',
    response: { kind: 'json', schema: contentProductionPresetVersionSchema },
  });

/** 기존 preset 이름의 다음 immutable version을 만든다 */
export const createContentProductionPresetVersion = (
  presetId: string,
  request: Omit<CreateContentProductionPresetVersionRequest, 'requestId'>,
) =>
  authenticatedRequest({
    body: createContentProductionPresetVersionRequestSchema.parse({
      ...request,
      requestId: crypto.randomUUID(),
    }),
    method: 'POST',
    path: `/admin/content-production/presets/${uuidSchema.parse(presetId)}/versions`,
    response: { kind: 'json', schema: contentProductionPresetVersionSchema },
  });

/** 현재 revision으로 preset enabled 상태를 바꾼다 */
export const setContentProductionPresetEnabled = (
  presetId: string,
  enabled: boolean,
  expectedRevision: number,
) =>
  authenticatedRequest({
    body: setContentProductionPresetEnabledRequestSchema.parse({
      enabled,
      expectedRevision,
      requestId: crypto.randomUUID(),
    }),
    method: 'POST',
    path: `/admin/content-production/presets/${uuidSchema.parse(presetId)}/enabled`,
    response: { kind: 'json', schema: contentProductionPresetVersionSchema },
  });
