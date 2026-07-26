/** 관리자 감사 기록 목록·상세 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const httpIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform((value) => Number(value)),
    ])
    .pipe(z.number().int().safe().min(minimum).max(maximum));

const pageMetadataSchema = z
  .object({
    page: z.number().int().safe().positive(),
    pageSize: z.number().int().safe().min(1).max(100),
    totalItems: z.number().int().safe().nonnegative(),
    totalPages: z.number().int().safe().nonnegative(),
  })
  .strict();

/** 감사 기록 검색·필터·페이지 query */
export const auditLogListQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(254).optional(),
    actorUserId: z.uuid().optional(),
    action: z.string().trim().min(1).max(100).optional(),
    targetType: z.string().trim().min(1).max(100).optional(),
    targetId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      Date.parse(query.from) > Date.parse(query.to)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'from은 to보다 늦을 수 없습니다',
        path: ['from'],
      });
    }
  });

/** 감사 기록 UUID path */
export const auditLogIdPathSchema = z
  .object({ auditLogId: z.uuid() })
  .strict();

const auditLogActorSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('USER'),
      userId: z.uuid(),
      email: z.string().email().max(254),
    })
    .strict(),
  z
    .object({
      kind: z.literal('SYSTEM'),
      label: z.string().min(1),
    })
    .strict(),
]);

/** 감사 기록 목록 항목 */
export const auditLogListItemSchema = z
  .object({
    id: z.uuid(),
    actor: auditLogActorSchema,
    action: z.string().min(1),
    target: z.string().min(1),
    targetType: z.string().min(1).nullable(),
    targetId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

/** 감사 기록 페이지 응답 */
export const auditLogListResponseSchema = z
  .object({
    items: z.array(auditLogListItemSchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 감사 기록 상세 응답 */
export const auditLogDetailResponseSchema = auditLogListItemSchema
  .extend({
    summary: z.record(z.string(), z.unknown()),
    requestId: z.string().min(1),
  })
  .strict();

/** 감사 기록 목록 query */
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;

/** 감사 기록 목록 항목 */
export type AuditLogListItemResponse = z.infer<
  typeof auditLogListItemSchema
>;

/** 감사 기록 목록 응답 */
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

/** 감사 기록 상세 응답 */
export type AuditLogDetailResponse = z.infer<
  typeof auditLogDetailResponseSchema
>;
