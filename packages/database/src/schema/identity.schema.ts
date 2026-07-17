/** 사용자 신원, passwordless challenge, 관리자 추가 인증을 저장한다 */
import {
  index,
  integer,
  jsonb,
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

/** 일회용 challenge 상태 */
export const challengeStatusEnum = pgEnum('challenge_status', [
  'PENDING',
  'SUCCEEDED',
  'EXPIRED',
  'CANCELLED',
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
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
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
  ],
);

/** 서로 다른 브라우저에서도 Cognito custom auth session을 이어 가는 record */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailHash: text('email_hash').notNull(),
    cognitoSessionCiphertext: text('cognito_session_ciphertext'),
    codeHmac: text('code_hmac').notNull(),
    linkHmac: text('link_hmac').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    status: challengeStatusEnum('status').default('PENDING').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('auth_challenges_email_hash_idx').on(table.emailHash)],
);

/** 관리자 민감 작업 전에 SMS 답을 확인하는 record */
export const stepUpChallenges = pgTable('step_up_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  actionCategory: text('action_category').notNull(),
  otpHmac: text('otp_hmac').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  status: challengeStatusEnum('status').default('PENDING').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 성공한 관리자 추가 인증을 짧게 재사용하는 grant */
export const stepUpGrants = pgTable('step_up_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  actionCategory: text('action_category').notNull(),
  tokenHmac: text('token_hmac').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** 관리자 변경을 append-only로 보존한다 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorSub: text('actor_sub').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
  requestId: text('request_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
