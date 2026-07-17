/** API가 시작 전에 환경 설정 오류를 발견하도록 검증한다 */
import { z } from 'zod';

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
    CHALLENGE_SESSION_KEY_BASE64: z.string().optional(),
    CHALLENGE_HMAC_PEPPER: z.string().optional(),
    SCHOOL_EMAIL_DOMAINS: z.string().default('school.ac.kr'),
    FAKE_USER_SUB: z.string().default('local-admin-sub'),
    FAKE_USER_EMAIL: z.string().default('admin@school.ac.kr'),
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
        value.INPUT_BUCKET_NAME,
        value.JOB_QUEUE_URL,
        value.CHALLENGE_SESSION_KEY_BASE64,
        value.CHALLENGE_HMAC_PEPPER,
      ];

      if (required.some((item) => !item)) {
        context.addIssue({
          code: 'custom',
          message: 'production 필수 환경 변수가 누락되었습니다',
        });
      }
    }
  });

/** 검증이 끝난 API 환경 설정 */
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** 환경 변수 문자열을 fail-fast 설정 객체로 변환한다 */
export const readApiEnv = (
  source: Record<string, string | undefined> = process.env,
): ApiEnv => apiEnvSchema.parse(source);
