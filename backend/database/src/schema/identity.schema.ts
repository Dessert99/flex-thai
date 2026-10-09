/** 사용자 신원과 이메일 challenge를 저장한다 */
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** 애플리케이션 권한 */
export const userRoleEnum = pgEnum('user_role', ['LEARNER', 'ADMIN']);

/** 계정 활성 상태 */
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'DISABLED']);

/** passwordless 이메일 challenge의 예약 가능한 상태 */
export const emailChallengeStatus = pgEnum('email_challenge_status', [
  'PENDING',
  'RESERVED',
  'SUCCEEDED',
  'EXPIRED',
]);

/** challenge 메일 발송 추적 상태 */
export const emailChallengeDeliveryStatus = pgEnum(
  'email_challenge_delivery_status',
  ['PENDING', 'SENT', 'FAILED'],
);

/** 이메일 인증 코드가 증명할 행위 */
export const authChallengePurposeEnum = pgEnum('auth_challenge_purpose', [
  'SIGNUP',
  'PASSWORD_RESET',
  'LOGIN',
]);

/** Cognito 신원과 애플리케이션 권한의 연결 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cognitoSub: text('cognito_sub').notNull(),
    email: text('email').notNull(),
    role: userRoleEnum('role').default('LEARNER').notNull(),
    status: userStatusEnum('status').default('ACTIVE').notNull(),
    mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('users_cognito_sub_unique').on(table.cognitoSub),
    uniqueIndex('users_email_unique').on(table.email),
    index('users_updated_at_id_idx').on(
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

/** 이메일 코드 HMAC과 발송 상한 계산 정보만 저장하는 record */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    purpose: authChallengePurposeEnum('purpose').default('LOGIN').notNull(),
    codeHmac: text('code_hmac').notNull(),
    linkHmac: text('link_hmac').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    status: emailChallengeStatus('status').default('PENDING').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resendAt: timestamp('resend_at', { withTimezone: true }).notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    deliveryStatus: emailChallengeDeliveryStatus('delivery_status')
      .default('PENDING')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('auth_challenges_email_created_at_idx').on(
      table.email,
      table.createdAt,
    ),
    index('auth_challenges_created_at_idx').on(table.createdAt),
  ],
);
