/** API가 시작 전에 환경 설정 오류를 발견하도록 검증한다 */
import { z } from 'zod';

const localMediaDefaults = {
  MEDIA_BUCKET_NAME: 'local-fake-media-bucket',
  MEDIA_CDN_BASE_URL: 'https://fake-media.invalid/media',
  MEDIA_KEY_PAIR_ID: 'local-fake-key-pair',
  MEDIA_PRIVATE_KEY_SECRET_ARN: 'local-fake-media-secret',
} as const;

const apiEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    AUTH_MODE: z.enum(['fake', 'cognito']).default('fake'),
    DATABASE_MODE: z.enum(['local', 'data-api']).default('local'),
    AWS_REGION: z.string().default('ap-northeast-2'),
    DATABASE_URL: z
      .string()
      .default(
        'postgres://flex_thia:local_only_password@localhost:5432/flex_thia',
      ),
    DATABASE_NAME: z.string().default('flex_thia'),
    RDS_RESOURCE_ARN: z.string().optional(),
    RDS_SECRET_ARN: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    INPUT_BUCKET_NAME: z.string().optional(),
    JOB_QUEUE_URL: z.string().optional(),
    CHALLENGE_HMAC_PEPPER: z.string().optional(),
    CHALLENGE_HMAC_PEPPER_SECRET_ARN: z.string().optional(),
    SCHOOL_EMAIL_DOMAINS: z.string().default('hufs.ac.kr'),
    FROM_EMAIL: z.string().optional(),
    AUTH_LIMIT_PARAMETER_PREFIX: z.string().default('/flex-thia/prod/auth'),
    ALARM_TOPIC_ARN: z.string().optional(),
    MEDIA_CDN_BASE_URL: z.string().trim().url().optional(),
    MEDIA_BUCKET_NAME: z.string().trim().min(1).optional(),
    MEDIA_KEY_PAIR_ID: z.string().trim().min(1).optional(),
    MEDIA_PRIVATE_KEY_SECRET_ARN: z.string().trim().min(1).optional(),
    FAKE_USER_SUB: z.string().default('local-admin-sub'),
    FAKE_USER_EMAIL: z.string().default('admin@hufs.ac.kr'),
    FAKE_USER_PASSWORD: z.string().default('qwer1234!@#'),
    FAKE_LEARNER_SUB: z.string().default('local-learner-sub'),
    FAKE_LEARNER_EMAIL: z.string().default('learner@hufs.ac.kr'),
    FAKE_LEARNER_PASSWORD: z.string().default('qwer1234!@#'),
    FAKE_PHONE_NUMBER: z.string().default('+821000000000'),
    ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.AUTH_MODE === 'fake') {
      context.addIssue({
        code: 'custom',
        message: 'production에서는 AUTH_MODE=fake를 사용할 수 없습니다',
      });
    }

    if (value.NODE_ENV === 'production') {
      if (value.DATABASE_MODE === 'local') {
        context.addIssue({
          code: 'custom',
          message: 'production에서는 DATABASE_MODE=local을 사용할 수 없습니다',
        });
      }

      const required = [
        value.RDS_RESOURCE_ARN,
        value.RDS_SECRET_ARN,
        value.COGNITO_USER_POOL_ID,
        value.COGNITO_CLIENT_ID,
        value.MEDIA_CDN_BASE_URL,
        value.MEDIA_BUCKET_NAME,
        value.MEDIA_KEY_PAIR_ID,
        value.MEDIA_PRIVATE_KEY_SECRET_ARN,
      ];

      if (required.some((item) => !item)) {
        context.addIssue({
          code: 'custom',
          message: 'production 필수 환경 변수가 누락되었습니다',
        });
      }

      if (
        value.MEDIA_CDN_BASE_URL &&
        new URL(value.MEDIA_CDN_BASE_URL).protocol !== 'https:'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['MEDIA_CDN_BASE_URL'],
          message: 'production MEDIA_CDN_BASE_URL은 HTTPS여야 합니다',
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    MEDIA_CDN_BASE_URL:
      value.MEDIA_CDN_BASE_URL ?? localMediaDefaults.MEDIA_CDN_BASE_URL,
    MEDIA_BUCKET_NAME:
      value.MEDIA_BUCKET_NAME ?? localMediaDefaults.MEDIA_BUCKET_NAME,
    MEDIA_KEY_PAIR_ID:
      value.MEDIA_KEY_PAIR_ID ?? localMediaDefaults.MEDIA_KEY_PAIR_ID,
    MEDIA_PRIVATE_KEY_SECRET_ARN:
      value.MEDIA_PRIVATE_KEY_SECRET_ARN ??
      localMediaDefaults.MEDIA_PRIVATE_KEY_SECRET_ARN,
  }));

/** 검증이 끝난 API 환경 설정 */
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** 환경 변수 문자열을 fail-fast 설정 객체로 변환한다 */
export const readApiEnv = (
  source: Record<string, string | undefined> = process.env,
): ApiEnv => apiEnvSchema.parse(source);
