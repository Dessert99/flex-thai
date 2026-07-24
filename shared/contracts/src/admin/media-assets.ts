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
const prohibitedPublicFieldNames = new Set([
  'storagekey',
  'requesthash',
  'referencemap',
  'iscorrect',
  'dbrow',
]);

const uploadFormFieldsSchema = z
  .record(z.string(), z.string())
  .superRefine((fields, context) => {
    Object.keys(fields).forEach((field) => {
      const normalized = field.toLowerCase().replace(/[^a-z0-9]/gu, '');
      if (prohibitedPublicFieldNames.has(normalized)) {
        context.addIssue({
          code: 'custom',
          message: '내부 field 이름은 upload form에 공개할 수 없습니다.',
          path: [field],
        });
      }
    });
  });

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
        fields: uploadFormFieldsSchema,
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

const mediaAssetDetailShape = {
  id: uuidSchema,
  kind: z.literal('AUDIO'),
  declaredMimeType: audioMimeTypeSchema,
  declaredSizeBytes: sizeBytesSchema,
  declaredSha256: sha256Schema,
  createdAt: utcDateTimeSchema,
  usage: z
    .object({
      pronunciations: mediaUsageSchema,
      sentences: mediaUsageSchema,
    })
    .strict(),
};

const readyMediaAssetDetailSchema = z
  .object({
    ...mediaAssetDetailShape,
    status: z.literal('READY'),
    mimeType: audioMimeTypeSchema,
    sizeBytes: sizeBytesSchema,
    sha256: sha256Schema,
    readyAt: utcDateTimeSchema,
  })
  .strict();

const uploadingMediaAssetDetailSchema = z
  .object({
    ...mediaAssetDetailShape,
    status: z.literal('UPLOADING'),
    mimeType: z.null(),
    sizeBytes: z.null(),
    sha256: z.null(),
    readyAt: z.null(),
  })
  .strict();

const rejectedMediaAssetDetailSchema = z
  .object({
    ...mediaAssetDetailShape,
    status: z.literal('REJECTED'),
    mimeType: z.string().min(1),
    sizeBytes: sizeBytesSchema,
    sha256: sha256Schema,
    readyAt: z.null(),
  })
  .strict();

/** storage key 없이 검증 상태와 발음·문장 사용처를 반환하는 상세 응답 */
export const mediaAssetDetailResponseSchema = z
  .discriminatedUnion('status', [
    readyMediaAssetDetailSchema,
    uploadingMediaAssetDetailSchema,
    rejectedMediaAssetDetailSchema,
  ])
  .superRefine((asset, context) => {
    const metadataMatches =
      asset.mimeType === asset.declaredMimeType &&
      asset.sizeBytes === asset.declaredSizeBytes &&
      asset.sha256?.toLowerCase() === asset.declaredSha256.toLowerCase();
    if (asset.status === 'REJECTED' && metadataMatches) {
      context.addIssue({
        code: 'custom',
        message: 'REJECTED actual metadata는 선언값과 하나 이상 달라야 합니다.',
        path: ['status'],
      });
      return;
    }
    if (asset.status !== 'READY') return;
    if (asset.mimeType !== asset.declaredMimeType) {
      context.addIssue({
        code: 'custom',
        message: 'READY MIME은 선언값과 일치해야 합니다.',
        path: ['mimeType'],
      });
    }
    if (asset.sizeBytes !== asset.declaredSizeBytes) {
      context.addIssue({
        code: 'custom',
        message: 'READY byte 크기는 선언값과 일치해야 합니다.',
        path: ['sizeBytes'],
      });
    }
    if (asset.sha256.toLowerCase() !== asset.declaredSha256.toLowerCase()) {
      context.addIssue({
        code: 'custom',
        message: 'READY SHA-256은 선언값과 일치해야 합니다.',
        path: ['sha256'],
      });
    }
  });

/** 검증된 음성 업로드 준비 요청 type */
export type AudioUploadRequest = z.infer<typeof audioUploadRequestSchema>;

/** 새 업로드 또는 READY 재사용 응답 type */
export type AudioUploadResponse = z.infer<typeof audioUploadResponseSchema>;

/** 검증된 media asset UUID path type */
export type MediaAssetIdPath = z.infer<typeof mediaAssetIdPathSchema>;

/** media asset 완료 READY 응답 type */
export type CompleteMediaAssetResponse = z.infer<
  typeof completeMediaAssetResponseSchema
>;

/** 공개 media asset 상세 응답 type */
export type MediaAssetDetailResponse = z.infer<
  typeof mediaAssetDetailResponseSchema
>;
