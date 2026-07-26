/** 관리자 사용자 목록·상태 변경·beta 안내 추적 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

/** 관리 가능한 사용자 활성 상태 */
export const managedIdentityUserStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

/** 관리 가능한 사용자 역할 */
export const managedIdentityUserRoleSchema = z.enum(['LEARNER', 'ADMIN']);

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

const httpBooleanSchema = z.union([
  z.boolean(),
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true'),
]);

const pageMetadataSchema = z
  .object({
    page: z.number().int().safe().positive(),
    pageSize: z.number().int().safe().min(1).max(100),
    totalItems: z.number().int().safe().nonnegative(),
    totalPages: z.number().int().safe().nonnegative(),
  })
  .strict();

const schoolEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)
  .refine((email) => email.endsWith('@hufs.ac.kr'));

/** 관리자 사용자 공개 응답 */
export const managedIdentityUserResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.string().email().max(254),
    role: managedIdentityUserRoleSchema,
    status: managedIdentityUserStatusSchema,
    mfaEnrolled: z.boolean(),
    mfaEnrolledAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/** 사용자 관리 검색·필터·페이지 query */
export const userManagementListQuerySchema = z
  .object({
    query: z.string().trim().toLowerCase().min(1).max(254).optional(),
    role: managedIdentityUserRoleSchema.optional(),
    status: managedIdentityUserStatusSchema.optional(),
    mfaEnrolled: httpBooleanSchema.optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

/** 사용자 관리 목록 공개 응답 */
export const userManagementListResponseSchema = z
  .object({
    items: z.array(managedIdentityUserResponseSchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 상태를 바꿀 사용자 UUID path */
export const userStatusPathSchema = z.object({ userId: z.uuid() }).strict();

/** 사용자 상태 변경 요청 */
export const userStatusUpdateRequestSchema = z
  .object({ status: managedIdentityUserStatusSchema })
  .strict();

/** 사용자 역할 변경 요청 */
export const userRoleUpdateRequestSchema = z
  .object({ role: managedIdentityUserRoleSchema })
  .strict();

/** 가입 권한과 무관한 beta 안내 발송 기록 요청 */
export const betaInvitationRequestSchema = z
  .object({ email: schoolEmailSchema })
  .strict();

/** beta 안내 발송 추적 공개 응답 */
export const betaInvitationResponseSchema = z
  .object({
    id: z.uuid(),
    email: schoolEmailSchema,
    invitedByUserId: z.uuid(),
    sentAt: z.iso.datetime(),
  })
  .strict();

/** 관리 가능한 사용자 상태 */
export type ManagedIdentityUserStatus = z.infer<
  typeof managedIdentityUserStatusSchema
>;

/** 관리 가능한 사용자 역할 */
export type ManagedIdentityUserRole = z.infer<
  typeof managedIdentityUserRoleSchema
>;

/** 사용자 관리 검색 query */
export type UserManagementListQuery = z.infer<
  typeof userManagementListQuerySchema
>;

/** 관리자 사용자 공개 응답 */
export type ManagedIdentityUserResponse = z.infer<
  typeof managedIdentityUserResponseSchema
>;

/** 공개 사용자 관리 목록 */
export type UserManagementListResponse = z.infer<
  typeof userManagementListResponseSchema
>;

/** 사용자 상태 변경 요청 */
export type UserStatusUpdateInput = z.infer<
  typeof userStatusUpdateRequestSchema
>;

/** 사용자 역할 변경 요청 */
export type UserRoleUpdateInput = z.infer<
  typeof userRoleUpdateRequestSchema
>;

/** beta 안내 발송 추적 요청 */
export type BetaInvitationInput = z.infer<typeof betaInvitationRequestSchema>;

/** beta 안내 발송 추적 응답 */
export type BetaInvitationResponse = z.infer<
  typeof betaInvitationResponseSchema
>;
