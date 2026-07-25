/** 관리자 콘텐츠 가져오기 생성과 이력 조회의 계약 경계를 정의한다 */
import {
  contentImportDetailResponseSchema,
  contentImportListResponseSchema,
  contentImportRequestSchema,
  idempotencyKeyHeaderSchema,
  type ContentImportRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { ContentImportListSearch } from '../model/contentImportListSearch';

/** 한 논리적 가져오기 명령의 검증된 body와 멱등 키 */
export interface ContentImportCommand {
  body: ContentImportRequest;
  idempotencyKey: string;
}

/** 콘텐츠 가져오기 이력 cache key와 계약 검증 요청을 만든다 */
export function contentImportListQueryOptions(search: ContentImportListSearch) {
  return queryOptions({
    queryKey: ['admin', 'content-imports', 'list', search] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/content-imports?${new URLSearchParams({
          page: String(search.page),
          pageSize: String(search.pageSize),
        })}`,
        response: { kind: 'json', schema: contentImportListResponseSchema },
      }),
  });
}

/** canonical body와 UUID 멱등 키를 검증해 가져오기를 한 번 실행한다 */
export function createContentImport(command: ContentImportCommand) {
  const body = contentImportRequestSchema.parse(command.body);
  const header = idempotencyKeyHeaderSchema.parse({
    'idempotency-key': command.idempotencyKey,
  });

  return authenticatedRequest({
    body,
    headers: { 'Idempotency-Key': header['idempotency-key'] },
    method: 'POST',
    path: '/admin/content-imports',
    response: { kind: 'json', schema: contentImportDetailResponseSchema },
    timeoutMs: 60_000,
  });
}
