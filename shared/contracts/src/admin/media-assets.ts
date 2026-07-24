/** 관리자 음성 업로드와 불변 media asset 공개 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();
const utcDateTimeSchema = z.string().datetime();
const sha256Schema = z.string().regex(/^[a-fA-F0-9]{64}$/u);
const sizeBytesSchema = z
  .number()
  .int()
  .safe()
  .min(1)
  .max(25 * 1024 * 1024);
const audioMimeTypeSchema = z.enum([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
]);

/** presigned audio upload를 준비할 선언 metadata 요청 */
export const audioUploadRequestSchema = z
  .object({
    filename: z.string().min(1),
    mimeType: audioMimeTypeSchema,
    sizeBytes: sizeBytesSchema,
    sha256: sha256Schema,
  })
  .strict();

const uploadRequiredResponseSchema = z
  .object({
    mediaAssetId: uuidSchema,
    status: z.literal('UPLOADING'),
    uploadRequired: z.literal(true),
    upload: z
      .object({
        url: z.string().url(),
        fields: z.record(z.string(), z.string()),
        expiresAt: utcDateTimeSchema,
      })
      .strict(),
  })
  .strict();

const reusedReadyResponseSchema = z
  .object({
    mediaAssetId: uuidSchema,
    status: z.literal('READY'),
    uploadRequired: z.literal(false),
    reused: z.literal(true),
  })
  .strict();

/** 새 업로드 form 또는 exact READY 자산 재사용을 구분하는 응답 */
export const audioUploadResponseSchema = z.discriminatedUnion(
  'uploadRequired',
  [uploadRequiredResponseSchema, reusedReadyResponseSchema],
);

/** 음성 자산 완료·상태 조회 경로의 UUID parameter */
export const mediaAssetIdPathSchema = z
  .object({ mediaAssetId: uuidSchema })
  .strict();

/** 실제 S3 객체 검증 뒤 확정한 READY 응답 */
export const completeMediaAssetResponseSchema = z
  .object({
    mediaAssetId: uuidSchema,
    status: z.literal('READY'),
    readyAt: utcDateTimeSchema,
  })
  .strict();

const mediaUsageSchema = z
  .object({
    count: z.number().int().safe().nonnegative(),
    ids: z.array(uuidSchema),
  })
  .strict()
  .superRefine((usage, context) => {
    if (usage.count !== usage.ids.length) {
      context.addIssue({
        code: 'custom',
        message: '사용처 count는 공개 ID 개수와 일치해야 합니다.',
        path: ['count'],
      });
    }
  });

/** storage key 없이 검증 상태와 발음·문장 사용처를 반환하는 상세 응답 */
export const mediaAssetDetailResponseSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('AUDIO'),
    status: z.enum(['UPLOADING', 'READY', 'REJECTED']),
    declaredMimeType: audioMimeTypeSchema,
    declaredSizeBytes: sizeBytesSchema,
    declaredSha256: sha256Schema,
    mimeType: audioMimeTypeSchema.nullable(),
    sizeBytes: sizeBytesSchema.nullable(),
    sha256: sha256Schema.nullable(),
    readyAt: utcDateTimeSchema.nullable(),
    createdAt: utcDateTimeSchema,
    usage: z
      .object({
        pronunciations: mediaUsageSchema,
        sentences: mediaUsageSchema,
      })
      .strict(),
  })
  .strict();

/** 검증된 음성 업로드 준비 요청 type */
export type AudioUploadRequest = z.infer<typeof audioUploadRequestSchema>;

/** 새 업로드 또는 READY 재사용 응답 type */
export type AudioUploadResponse = z.infer<typeof audioUploadResponseSchema>;

/** 검증된 media asset UUID path type */
export type MediaAssetIdPath = z.infer<typeof mediaAssetIdPathSchema>;

/** 공개 media asset 상세 응답 type */
export type MediaAssetDetailResponse = z.infer<
  typeof mediaAssetDetailResponseSchema
>;
