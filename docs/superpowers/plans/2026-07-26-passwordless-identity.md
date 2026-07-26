# Passwordless Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 이메일 코드 또는 이메일 링크로 비밀번호 없이 가입·로그인하고, 관리자 TOTP와 안전한 refresh 세션 및 사용자 상태 관리를 유지한다.

**Architecture:** NestJS domain이 이메일 challenge 수명주기와 코드·링크의 원자적 1회 소비를 소유하고, Drizzle repository가 rate limit과 경쟁 조건을 transaction으로 보장한다. production은 Cognito custom auth와 SES, local은 결정적 fake adapter를 사용하며, 링크 GET은 확인 화면만 렌더링하고 사용자 동작의 POST만 challenge를 소비한다.

**Tech Stack:** TypeScript, Zod, NestJS, Drizzle ORM, PostgreSQL, AWS Cognito Custom Authentication, AWS SES, AWS CDK, React, TanStack Router/Query, Vitest

## Global Constraints

- 가입 가능 학교 도메인은 `hufs.ac.kr`이며 이메일 비교 전에 trim과 lowercase를 적용한다.
- challenge 만료는 600초, 재전송 cooldown은 60초, 이메일당 일일 상한은 5회, 전체 일일 상한은 500회, 최대 오답은 5회다.
- refresh cookie와 Cognito refresh validity는 모두 7일이다.
- 유효한 학교 이메일 가입은 공개한다. beta invitation은 안내·추적 정보이며 가입 allowlist로 사용하지 않는다.
- 시작·검증 응답과 처리 시간은 신규/기존 계정 여부를 드러내지 않는다.
- 코드와 링크 token 원문을 DB·로그에 저장하지 않고 HMAC만 저장한다.
- 코드와 링크 중 먼저 성공한 하나만 challenge를 원자적으로 소비하며 재사용은 거부한다.
- 링크 GET은 인증을 완료하지 않는다. 확인 화면의 명시적 POST만 session을 생성한다.
- 링크 확인 화면은 `Referrer-Policy: no-referrer`를 사용하고 외부 analytics/resource를 로드하지 않는다.
- access token은 메모리에만 두고 refresh token은 `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` cookie에만 둔다.
- 새 파일과 수정 export는 `conventions/comment-convention.md`, 한국어 테스트 설명, structure/frontend/backend convention을 따른다.
- E2E runner·설정·spec을 추가하지 않는다.
- 기능 브랜치는 `backend/database/drizzle/**`, `frontend/web/src/routeTree.gen.ts`, package manifests, `pnpm-lock.yaml`을 수정하지 않는다.
- `*/src/index.ts`, `backend/api/src/app.module.ts`, OpenAPI root, infra wiring, migration, route tree는 Task 12 이후 통합 담당자가 순차 조립한다.

---

## File Structure

기능 브랜치는 다음 전용 파일을 우선 소유한다.

- `backend/domain/src/identity/email-challenge.ts`: challenge 상태와 error
- `backend/domain/src/identity/email-challenge.repository.ts`: 원자 생성·실패·소비 port
- `backend/domain/src/identity/passwordless-authentication.ts`: provider와 sender port
- `backend/domain/src/identity/passwordless-authentication.service.ts`: use case
- `backend/database/src/repositories/drizzle-email-challenge.repository.ts`: transaction adapter
- `backend/providers/src/identity/cognito-passwordless-authentication.provider.ts`: Cognito custom auth adapter
- `backend/providers/src/identity/fake-passwordless-authentication.provider.ts`: local adapter
- `backend/providers/src/messaging/ses-email-challenge.sender.ts`: code+link email
- `backend/providers/src/fakes/fake-email-challenge.sender.ts`: local outbox
- `backend/worker/src/identity/{define,create,verify}-auth-challenge.ts`: Cognito trigger 순수 handler
- `frontend/web/src/pages/email-challenge/**`: code 입력
- `frontend/web/src/pages/email-link-confirm/**`: 명시적 link 확인

---

### Task 1: 공개 passwordless 계약

**Files:**
- Modify: `shared/contracts/src/identity/auth.ts`
- Modify: `shared/contracts/src/identity/auth.spec.ts`

**Interfaces:**
- Consumes: 기존 `authenticatedResponseSchema`, `mfaRequiredResponseSchema`, TOTP, refresh, logout, `me` 계약.
- Produces: `StartEmailAuthenticationInput`, `EmailAuthenticationChallengeResponse`, `VerifyEmailCodeInput`, `ConfirmEmailLinkInput`.

- [ ] **Step 1: password 필드 거부와 strict 입력의 실패 테스트를 작성한다**

```ts
it('학교 이메일 challenge 시작 입력은 이메일만 받는다', () => {
  expect(startEmailAuthenticationRequestSchema.parse({
    email: ' USER@hufs.ac.kr ',
  })).toEqual({ email: ' USER@hufs.ac.kr ' });
  expect(() => startEmailAuthenticationRequestSchema.parse({
    email: 'user@hufs.ac.kr',
    password: 'secret',
  })).toThrow();
});

it('코드는 6자리이고 링크 token은 43자 base64url이다', () => {
  expect(verifyEmailCodeRequestSchema.parse({ code: '123456' }))
    .toEqual({ code: '123456' });
  expect(() => verifyEmailCodeRequestSchema.parse({ code: '12345' })).toThrow();
  expect(confirmEmailLinkRequestSchema.parse({
    token: 'A'.repeat(43),
  })).toEqual({ token: 'A'.repeat(43) });
});
```

- [ ] **Step 2: 계약 테스트가 새 export 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run shared/contracts/src/identity/auth.spec.ts`

Expected: FAIL with missing passwordless schemas.

- [ ] **Step 3: strict Zod 계약을 최소 구현한다**

```ts
/** 이메일 challenge 시작 요청 계약. */
export const startEmailAuthenticationRequestSchema = z.object({
  email: z.email(),
}).strict();

/** 계정 존재 여부를 드러내지 않는 challenge 응답 계약. */
export const emailAuthenticationChallengeResponseSchema = z.object({
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  resendAt: z.iso.datetime(),
}).strict();

/** 이메일 코드 확인 요청 계약. */
export const verifyEmailCodeRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
}).strict();

/** 이메일 링크 확인 요청 계약. */
export const confirmEmailLinkRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

/** 이메일 challenge 시작 요청. */
export type StartEmailAuthenticationInput =
  z.infer<typeof startEmailAuthenticationRequestSchema>;
```

- [ ] **Step 4: 계약 test와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run shared/contracts/src/identity/auth.spec.ts && pnpm --filter @flex-thia/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: 계약을 커밋한다**

```bash
git add shared/contracts/src/identity/auth.ts shared/contracts/src/identity/auth.spec.ts
git commit -m "feat(identity): define passwordless contracts"
```

### Task 2: challenge 도메인과 원자적 1회 소비

**Files:**
- Create: `backend/domain/src/identity/email-challenge.ts`
- Create: `backend/domain/src/identity/email-challenge.spec.ts`
- Create: `backend/domain/src/identity/email-challenge.repository.ts`
- Create: `backend/domain/src/identity/passwordless-authentication.ts`
- Create: `backend/domain/src/identity/passwordless-authentication.service.ts`
- Create: `backend/domain/src/identity/passwordless-authentication.service.spec.ts`

**Interfaces:**
- Consumes: fixed limits from Global Constraints.
- Produces: `EmailChallengeRepository`, `PasswordlessAuthenticationProvider`, `EmailChallengeSender`, `PasswordlessAuthenticationService`.

- [ ] **Step 1: 정상화·원자 소비·provider 실패의 RED를 작성한다**

```ts
it('hufs.ac.kr 이메일을 정규화하고 challenge를 시작한다', async () => {
  const result = await service.start(' USER@hufs.ac.kr ', now);
  expect(repository.createWithinLimits).toHaveBeenCalledWith(expect.objectContaining({
    email: 'user@hufs.ac.kr',
    expiresAt: new Date(now.getTime() + 600_000),
    resendAt: new Date(now.getTime() + 60_000),
  }));
  expect(result).not.toHaveProperty('existingUser');
});

it('코드와 링크 중 먼저 성공한 수단만 인증한다', async () => {
  repository.consume.mockResolvedValueOnce(makeConsumedChallenge());
  repository.consume.mockRejectedValueOnce(
    new EmailChallengeError('CHALLENGE_ALREADY_USED'),
  );
  await service.completeCode(challengeId, '123456', now);
  await expect(service.completeLink(challengeId, linkToken, now))
    .rejects.toMatchObject({ code: 'CHALLENGE_ALREADY_USED' });
});

it('provider 실패 시 challenge를 소비 완료하지 않는다', async () => {
  provider.complete.mockRejectedValue(new Error('provider unavailable'));
  await expect(service.completeCode(challengeId, '123456', now)).rejects.toThrow();
  expect(repository.finalizeConsumption).not.toHaveBeenCalled();
  expect(repository.releaseConsumption).toHaveBeenCalledWith(challengeId);
});
```

- [ ] **Step 2: domain test가 모듈 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/domain/src/identity/email-challenge.spec.ts backend/domain/src/identity/passwordless-authentication.service.spec.ts`

Expected: FAIL with missing modules.

- [ ] **Step 3: port와 service를 최소 구현한다**

```ts
/** challenge 원자 소비 수단. */
export type EmailChallengeAnswer =
  | { kind: 'CODE'; answer: string }
  | { kind: 'LINK'; answer: string };

/** 이메일 challenge persistence port. */
export interface EmailChallengeRepository {
  createWithinLimits(input: {
    email: string;
    codeHmac: string;
    linkHmac: string;
    expiresAt: Date;
    resendAt: Date;
    now: Date;
    limits: {
      emailDaily: 5;
      globalDaily: 500;
      maxAttempts: 5;
    };
  }): Promise<EmailChallenge>;
  reserveConsumption(input: {
    challengeId: string;
    answer: EmailChallengeAnswer;
    now: Date;
  }): Promise<EmailChallenge>;
  finalizeConsumption(challengeId: string, now: Date): Promise<void>;
  releaseConsumption(challengeId: string): Promise<void>;
}

/** 외부 identity provider의 passwordless 완료 port. */
export interface PasswordlessAuthenticationProvider {
  complete(email: string): Promise<ProviderLoginResult>;
}

/** 코드와 링크를 한 메일로 보내는 port. */
export interface EmailChallengeSender {
  send(input: {
    email: string;
    code: string;
    linkUrl: string;
    expiresAt: Date;
  }): Promise<void>;
}
```

service는 `normalizeSchoolEmail()`에서 `@hufs.ac.kr`만 허용한다. `completeCode`와 `completeLink`는 같은 private `complete(answer)`를 호출하고 reserve → provider → finalize 순서를 사용하며 provider 오류에는 release한다.

- [ ] **Step 4: domain test와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/domain/src/identity/email-challenge.spec.ts backend/domain/src/identity/passwordless-authentication.service.spec.ts && pnpm --filter @flex-thia/domain typecheck`

Expected: PASS.

- [ ] **Step 5: challenge domain을 커밋한다**

```bash
git add backend/domain/src/identity/email-challenge.ts backend/domain/src/identity/email-challenge.spec.ts backend/domain/src/identity/email-challenge.repository.ts backend/domain/src/identity/passwordless-authentication.ts backend/domain/src/identity/passwordless-authentication.service.ts backend/domain/src/identity/passwordless-authentication.service.spec.ts
git commit -m "feat(identity): model email challenges"
```

### Task 3: identity schema와 transaction repository

**Files:**
- Modify: `backend/database/src/schema/identity.schema.ts`
- Modify: `backend/database/src/schema/schema.spec.ts`
- Create: `backend/database/src/repositories/drizzle-email-challenge.repository.ts`
- Create: `backend/database/src/repositories/drizzle-email-challenge.repository.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `EmailChallengeRepository`.
- Produces: rate limit, max attempts, code/link 경쟁, reserve/finalize/release를 보장하는 Drizzle adapter.

- [ ] **Step 1: schema와 동시성 RED를 작성한다**

```ts
it('challenge에 code와 link HMAC 및 소비 예약 상태를 저장한다', () => {
  expect(getTableConfig(authChallenges).columns.map(({ name }) => name))
    .toEqual(expect.arrayContaining([
      'code_hmac',
      'link_hmac',
      'resend_at',
      'reserved_at',
      'consumed_at',
      'delivery_status',
    ]));
});

it('동시 code와 link 성공 중 하나만 소비를 예약한다', async () => {
  const outcomes = await Promise.allSettled([
    repository.reserveConsumption({ challengeId, answer: code, now }),
    repository.reserveConsumption({ challengeId, answer: link, now }),
  ]);
  expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
});
```

cooldown 60초, email 5/day, global 500/day, 오답 5회의 boundary test를 추가한다.

- [ ] **Step 2: database tests가 schema/repository 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/schema.spec.ts backend/database/src/repositories/drizzle-email-challenge.repository.spec.ts`

Expected: FAIL with missing columns/repository.

- [ ] **Step 3: additive schema와 conditional update를 구현한다**

```ts
export const emailChallengeStatus = pgEnum('email_challenge_status', [
  'PENDING',
  'RESERVED',
  'SUCCEEDED',
  'EXPIRED',
]);
```

repository는 정규화 이메일의 transaction advisory lock 안에서 limit을 계산한다. reserve는 `status=PENDING`, `expires_at > now`, `attempts < 5` 조건부 update와 HMAC timing-safe 검증을 사용한다. 틀린 답은 attempts를 1 올리고 다섯 번째에는 `EXPIRED`; finalize는 RESERVED→SUCCEEDED; release는 RESERVED→PENDING으로만 바꾼다.

- [ ] **Step 4: database tests와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/schema.spec.ts backend/database/src/repositories/drizzle-email-challenge.repository.spec.ts && pnpm --filter @flex-thia/database typecheck`

Expected: PASS.

- [ ] **Step 5: repository를 커밋한다**

```bash
git add backend/database/src/schema/identity.schema.ts backend/database/src/schema/schema.spec.ts backend/database/src/repositories/drizzle-email-challenge.repository.ts backend/database/src/repositories/drizzle-email-challenge.repository.spec.ts
git commit -m "feat(database): store passwordless challenges"
```

### Task 4: crypto·SES sender·local outbox

**Files:**
- Modify: `backend/providers/src/crypto/challenge-crypto.ts`
- Modify: `backend/providers/src/crypto/challenge-crypto.spec.ts`
- Create: `backend/providers/src/messaging/ses-email-challenge.sender.ts`
- Create: `backend/providers/src/messaging/ses-email-challenge.sender.spec.ts`
- Create: `backend/providers/src/fakes/fake-email-challenge.sender.ts`
- Create: `backend/providers/src/fakes/fake-email-challenge.sender.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `EmailChallengeSender`.
- Produces: 6자리 code, 32-byte base64url link token, HMAC, code+link SES message, local outbox.

- [ ] **Step 1: 원문 비저장과 안전한 URL RED를 작성한다**

```ts
it('6자리 코드와 43자 링크 token을 생성하고 HMAC만 persistence에 전달한다', () => {
  const secret = crypto.createChallengeSecrets();
  expect(secret.code).toMatch(/^\d{6}$/);
  expect(secret.linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(secret.codeHmac).not.toContain(secret.code);
  expect(secret.linkHmac).not.toContain(secret.linkToken);
});

it('SES 메일에 코드와 인코딩된 확인 링크를 함께 넣는다', async () => {
  await sender.send({
    email: 'user@hufs.ac.kr',
    code: '123456',
    linkUrl: 'https://app.example/login/confirm?challengeId=id&token=A_B-c',
    expiresAt,
  });
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
    Destination: { ToAddresses: ['user@hufs.ac.kr'] },
  }));
});
```

- [ ] **Step 2: provider tests가 새 API 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/providers/src/crypto/challenge-crypto.spec.ts backend/providers/src/messaging/ses-email-challenge.sender.spec.ts backend/providers/src/fakes/fake-email-challenge.sender.spec.ts`

Expected: FAIL with missing exports/files.

- [ ] **Step 3: crypto와 sender를 최소 구현한다**

```ts
/** 코드·링크 원문과 저장 HMAC을 함께 만든다. */
createChallengeSecrets(): {
  code: string;
  linkToken: string;
  codeHmac: string;
  linkHmac: string;
};
```

SES sender는 plain text와 HTML 모두에 `10분 안에 사용`, code, link를 포함한다. fake sender는 `messages: Array<{ email; code; linkUrl; expiresAt }>`만 메모리에 기록하고 secret을 console에 쓰지 않는다.

- [ ] **Step 4: provider tests와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/providers/src/crypto/challenge-crypto.spec.ts backend/providers/src/messaging/ses-email-challenge.sender.spec.ts backend/providers/src/fakes/fake-email-challenge.sender.spec.ts && pnpm --filter @flex-thia/providers typecheck`

Expected: PASS.

- [ ] **Step 5: crypto/sender를 커밋한다**

```bash
git add backend/providers/src/crypto/challenge-crypto.ts backend/providers/src/crypto/challenge-crypto.spec.ts backend/providers/src/messaging backend/providers/src/fakes/fake-email-challenge.sender.ts backend/providers/src/fakes/fake-email-challenge.sender.spec.ts
git commit -m "feat(identity): send code and login link"
```

### Task 5: Cognito custom auth와 local provider

**Files:**
- Create: `backend/providers/src/identity/cognito-passwordless-authentication.provider.ts`
- Create: `backend/providers/src/identity/cognito-passwordless-authentication.provider.spec.ts`
- Create: `backend/providers/src/identity/fake-passwordless-authentication.provider.ts`
- Create: `backend/providers/src/identity/fake-passwordless-authentication.provider.spec.ts`
- Modify: `backend/domain/src/identity/authentication.ts`
- Modify: `backend/domain/src/identity/authentication.service.ts`
- Modify: `backend/domain/src/identity/authentication.service.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `PasswordlessAuthenticationProvider`, 기존 `ProviderLoginResult`, TOTP/refresh/revoke methods.
- Produces: password 없는 learner login과 기존 ADMIN TOTP 결과.

- [ ] **Step 1: 신규/기존 동일 결과와 관리자 MFA RED를 작성한다**

```ts
it('Cognito custom auth 성공을 token set으로 변환한다', async () => {
  cognito.send.mockResolvedValue(makeInitiateAuthResult());
  await expect(provider.complete('user@hufs.ac.kr')).resolves.toMatchObject({
    kind: 'AUTHENTICATED',
  });
});

it('관리자 SOFTWARE_TOKEN_MFA challenge를 보존한다', async () => {
  cognito.send.mockResolvedValue({
    ChallengeName: 'SOFTWARE_TOKEN_MFA',
    Session: 'opaque-session',
  });
  await expect(provider.complete('admin@hufs.ac.kr')).resolves.toEqual({
    kind: 'MFA_REQUIRED',
    challengeToken: 'opaque-session',
  });
});
```

- [ ] **Step 2: identity provider tests가 구현 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/providers/src/identity/cognito-passwordless-authentication.provider.spec.ts backend/providers/src/identity/fake-passwordless-authentication.provider.spec.ts backend/domain/src/identity/authentication.service.spec.ts`

Expected: FAIL with missing providers or old password `login`.

- [ ] **Step 3: `CUSTOM_AUTH` adapter와 fake를 최소 구현한다**

```ts
await this.client.send(new InitiateAuthCommand({
  AuthFlow: 'CUSTOM_AUTH',
  ClientId: this.clientId,
  AuthParameters: { USERNAME: email },
}));
```

활성 `AuthenticationProvider.login(email,password)`은 제거하고 passwordless completion을 통해 얻은 result를 기존 user upsert/MFA 로직에 전달한다. refresh/revoke와 TOTP setup/challenge는 기존 검증된 구현을 이동하거나 위임해 동작을 바꾸지 않는다. fake는 configured email별 role을 반환하며 production mode constructor에서 즉시 오류를 던진다.

- [ ] **Step 4: provider/domain tests가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/providers/src/identity/cognito-passwordless-authentication.provider.spec.ts backend/providers/src/identity/fake-passwordless-authentication.provider.spec.ts backend/domain/src/identity/authentication.service.spec.ts && pnpm --filter @flex-thia/providers typecheck && pnpm --filter @flex-thia/domain typecheck`

Expected: PASS.

- [ ] **Step 5: provider 변경을 커밋한다**

```bash
git add backend/providers/src/identity backend/domain/src/identity/authentication.ts backend/domain/src/identity/authentication.service.ts backend/domain/src/identity/authentication.service.spec.ts
git commit -m "feat(identity): authenticate without passwords"
```

### Task 6: Cognito custom challenge trigger handlers

**Files:**
- Create: `backend/worker/src/identity/define-auth-challenge.ts`
- Create: `backend/worker/src/identity/define-auth-challenge.spec.ts`
- Create: `backend/worker/src/identity/create-auth-challenge.ts`
- Create: `backend/worker/src/identity/create-auth-challenge.spec.ts`
- Create: `backend/worker/src/identity/verify-auth-challenge.ts`
- Create: `backend/worker/src/identity/verify-auth-challenge.spec.ts`

**Interfaces:**
- Consumes: Cognito Custom Message auth trigger event fields.
- Produces: pure handlers that do not log or expose code/link/session secrets.

- [ ] **Step 1: define/create/verify trigger RED를 작성한다**

```ts
it('성공한 custom challenge 뒤 token 발급을 지시한다', async () => {
  const result = await defineAuthChallenge(makeEvent({
    session: [{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: true }],
  }));
  expect(result.response).toMatchObject({
    issueTokens: true,
    failAuthentication: false,
  });
});

it('private challenge parameter와 answer가 같은지 timing-safe로 판정한다', async () => {
  const result = await verifyAuthChallenge(makeVerifyEvent({
    expectedHmac,
    answer: 'opaque-answer',
  }));
  expect(result.response.answerCorrect).toBe(true);
});
```

- [ ] **Step 2: worker tests가 handler 부재로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/worker exec vitest run src/identity`

Expected: FAIL with missing modules.

- [ ] **Step 3: 최대 5회와 secret-free trigger handlers를 구현한다**

define handler는 성공 1회면 token, 실패 5회면 fail, 그 외 custom challenge를 요청한다. create handler는 공개 parameter에 계정 존재 여부나 답을 넣지 않는다. verify handler는 HMAC 검증 결과만 `answerCorrect`에 넣고 event를 logging하지 않는다.

- [ ] **Step 4: worker tests와 typecheck가 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/worker exec vitest run src/identity && pnpm --filter @flex-thia/worker typecheck`

Expected: PASS.

- [ ] **Step 5: trigger handlers를 커밋한다**

```bash
git add backend/worker/src/identity
git commit -m "feat(worker): handle Cognito custom auth"
```

### Task 7: Controller·cookie·CSRF·OpenAPI-owned endpoint

**Files:**
- Modify: `backend/api/src/identity/identity.controller.ts`
- Modify: `backend/api/src/identity/identity.controller.spec.ts`
- Modify: `backend/api/src/identity/identity.module.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `POST /auth/challenges`, `/code`, `/link`, `/resend`; 기존 MFA/refresh/logout.

- [ ] **Step 1: endpoint와 cookie security RED를 작성한다**

```ts
it('링크 확인 POST에서만 refresh cookie를 쓴다', async () => {
  await controller.confirmLink(
    { challengeId },
    { token: linkToken },
    requestWithCsrf,
    response,
  );
  expect(response.cookie).toHaveBeenCalledWith(
    '__Host-flex-thia-refresh',
    refreshToken,
    expect.objectContaining({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 604_800_000,
    }),
  );
});

it('challenge 시작 성공과 실패가 계정 존재 여부를 노출하지 않는다', async () => {
  await expect(controller.startChallenge({ email: existingEmail }))
    .resolves.toEqual(genericChallengeResponse);
  await expect(controller.startChallenge({ email: newEmail }))
    .resolves.toEqual(genericChallengeResponse);
});
```

exact Origin과 CSRF header가 없는 cookie-writing POST는 403인 사례를 추가한다.

- [ ] **Step 2: API tests가 old login route 때문에 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/api/src/identity/identity.controller.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts`

Expected: FAIL with missing challenge routes or password DTO mismatch.

- [ ] **Step 3: Controller를 passwordless endpoint로 교체한다**

```ts
@Post('auth/challenges')
startChallenge(@Body() raw: unknown) {}

@Post('auth/challenges/:challengeId/code')
verifyCode(@Param() rawPath: unknown, @Body() rawBody: unknown) {}

@Post('auth/challenges/:challengeId/link')
confirmLink(@Param() rawPath: unknown, @Body() rawBody: unknown) {}

@Post('auth/challenges/:challengeId/resend')
resend(@Param() rawPath: unknown) {}
```

GET link API는 만들지 않는다. authenticated result만 cookie를 쓰고 MFA_REQUIRED는 challenge token만 반환한다. old `/auth/login` password endpoint는 제거한다.

- [ ] **Step 4: API tests와 typecheck가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/api/src/identity/identity.controller.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts && pnpm --filter @flex-thia/api typecheck`

Expected: PASS.

- [ ] **Step 5: HTTP boundary를 커밋한다**

```bash
git add backend/api/src/identity backend/api/src/common/errors/domain-exception.filter.ts backend/api/src/common/errors/domain-exception.filter.spec.ts
git commit -m "feat(api): expose passwordless authentication"
```

### Task 8: 프론트 API와 메모리 session

**Files:**
- Modify: `frontend/web/src/shared/api/auth/authApi.ts`
- Modify: `frontend/web/src/shared/api/auth/authApi.test.ts`
- Modify: `frontend/web/src/shared/api/auth/authSessionStore.ts`
- Modify: `frontend/web/src/shared/api/auth/authSessionStore.test.ts`
- Modify: `frontend/web/src/shared/api/apiRequest.ts`

**Interfaces:**
- Consumes: Task 1/7 HTTP.
- Produces: `startEmailAuthentication`, `verifyEmailCode`, `confirmEmailLink`, `resendEmailChallenge`.

- [ ] **Step 1: password 비전송과 POST confirm RED를 작성한다**

```ts
it('이메일 challenge 시작 요청에 password를 보내지 않는다', async () => {
  await startEmailAuthentication('user@hufs.ac.kr');
  expect(fetch).toHaveBeenCalledWith(
    expect.stringEndingWith('/auth/challenges'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'user@hufs.ac.kr' }),
    }),
  );
});

it('access token을 Web Storage에 기록하지 않는다', async () => {
  await verifyEmailCode(challengeId, '123456');
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(sessionStorage.setItem).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: auth API tests가 old request shape 때문에 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/shared/api/auth`

Expected: FAIL with password login request.

- [ ] **Step 3: API 함수와 challenge memory state를 구현한다**

```ts
/** 진행 중 이메일 challenge의 메모리 상태. */
export interface PendingEmailChallenge {
  challengeId: string;
  email: string;
  expiresAt: string;
  resendAt: string;
}
```

access token과 pending challenge는 module memory에만 둔다. refresh→`/me` 복구와 concurrent refresh coordinator는 기존 구현을 유지한다. cookie-writing POST에는 기존 CSRF header와 `credentials: 'include'`를 적용한다.

- [ ] **Step 4: frontend auth tests와 typecheck가 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/shared/api/auth && pnpm --filter @flex-thia/web typecheck`

Expected: PASS.

- [ ] **Step 5: frontend API를 커밋한다**

```bash
git add frontend/web/src/shared/api/auth frontend/web/src/shared/api/apiRequest.ts
git commit -m "feat(web): call passwordless auth API"
```

### Task 9: 이메일 코드와 링크 확인 화면

**Files:**
- Modify: `frontend/web/src/pages/login/model/loginFormSchema.ts`
- Modify: `frontend/web/src/pages/login/ui/LoginPageContainer.tsx`
- Modify: `frontend/web/src/pages/login/ui/LoginPageView.tsx`
- Modify: `frontend/web/src/pages/login/ui/LoginPage.test.tsx`
- Create: `frontend/web/src/pages/email-challenge/model/emailCodeFormSchema.ts`
- Create: `frontend/web/src/pages/email-challenge/ui/EmailChallengePageContainer.tsx`
- Create: `frontend/web/src/pages/email-challenge/ui/EmailChallengePageView.tsx`
- Create: `frontend/web/src/pages/email-challenge/ui/EmailChallengePage.test.tsx`
- Create: `frontend/web/src/pages/email-link-confirm/ui/EmailLinkConfirmPageContainer.tsx`
- Create: `frontend/web/src/pages/email-link-confirm/ui/EmailLinkConfirmPageView.tsx`
- Create: `frontend/web/src/pages/email-link-confirm/ui/EmailLinkConfirmPage.test.tsx`

**Interfaces:**
- Consumes: Task 8의 API/session functions.
- Produces: 이메일 입력→코드 입력, resend countdown, explicit link confirmation.

- [ ] **Step 1: 화면 흐름과 scanner-safe link RED를 작성한다**

```ts
it('로그인 화면은 학교 이메일만 요청한다', async () => {
  render(<LoginPageView {...props} />);
  expect(screen.getByLabelText('학교 이메일')).toBeVisible();
  expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();
});

it('링크 화면 mount만으로 확인 API를 호출하지 않는다', async () => {
  render(<EmailLinkConfirmPageContainer />);
  expect(confirmEmailLink).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '로그인 확인' }));
  expect(confirmEmailLink).toHaveBeenCalledOnce();
});
```

`resendAt` 전 button disabled, 성공 후 learner/admin redirect, 관리자 MFA redirect, refresh session recovery 회귀 test를 추가한다.

- [ ] **Step 2: page tests가 password UI와 missing pages로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/login src/pages/email-challenge src/pages/email-link-confirm`

Expected: FAIL.

- [ ] **Step 3: 세 화면을 최소 구현한다**

로그인 form은 email 하나만 제출한다. challenge 화면은 6자리 input, 남은 초, 재전송 button을 제공한다. link 화면은 URL의 `challengeId`와 `token`을 읽되 button click 전 네트워크 호출이 없고 root element에 no-referrer meta/header 정책을 요청한다.

- [ ] **Step 4: page tests와 accessibility assertion이 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/login src/pages/email-challenge src/pages/email-link-confirm && pnpm --filter @flex-thia/web typecheck`

Expected: PASS.

- [ ] **Step 5: 화면을 커밋한다**

```bash
git add frontend/web/src/pages/login frontend/web/src/pages/email-challenge frontend/web/src/pages/email-link-confirm
git commit -m "feat(web): add email login screens"
```

### Task 10: 관리자 사용자 상태와 beta invitation 추적

**Files:**
- Create: `shared/contracts/src/identity/user-management.ts`
- Create: `shared/contracts/src/identity/user-management.spec.ts`
- Create: `backend/domain/src/identity/user-management.ts`
- Create: `backend/domain/src/identity/user-management.spec.ts`
- Modify: `backend/domain/src/identity/user.repository.ts`
- Create: `backend/database/src/queries/drizzle-user-management.query.ts`
- Create: `backend/database/src/queries/drizzle-user-management.query.spec.ts`
- Create: `backend/api/src/identity/admin-user-management.controller.ts`
- Create: `backend/api/src/identity/admin-user-management.controller.spec.ts`
- Create: `frontend/web/src/pages/user-management/ui/UserManagementPage.tsx`
- Create: `frontend/web/src/pages/user-management/ui/UserManagementPage.test.tsx`

**Interfaces:**
- Consumes: `users.status`, ADMIN/MFA guards, audit service.
- Produces: list users, `ACTIVE | DISABLED` update, optional invitation record without signup gating.

- [ ] **Step 1: ADMIN 전용 상태 변경과 non-gating invitation RED를 작성한다**

```ts
it('ADMIN이 사용자 상태를 DISABLED로 변경하고 audit을 남긴다', async () => {
  await service.changeStatus(admin, userId, 'DISABLED', now);
  expect(repository.changeStatus).toHaveBeenCalledWith(userId, 'DISABLED', now);
  expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
    actorUserId: admin.id,
    targetUserId: userId,
    action: 'IDENTITY_USER_DISABLED',
  }));
});

it('초대 기록이 없어도 학교 이메일 challenge 시작을 허용한다', async () => {
  invitationRepository.findByEmail.mockResolvedValue(null);
  await expect(passwordlessService.start('new@hufs.ac.kr', now)).resolves.toBeDefined();
});
```

- [ ] **Step 2: management tests가 modules 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run shared/contracts/src/identity/user-management.spec.ts backend/domain/src/identity/user-management.spec.ts backend/database/src/queries/drizzle-user-management.query.spec.ts backend/api/src/identity/admin-user-management.controller.spec.ts`

Expected: FAIL with missing modules.

- [ ] **Step 3: 목록·상태 변경·추적 계약을 구현한다**

```ts
/** 관리 가능한 사용자 상태. */
export type ManagedIdentityUserStatus = 'ACTIVE' | 'DISABLED';

/** beta 안내 발송 추적이며 가입 권한에는 사용하지 않는다. */
export interface BetaInvitationRecord {
  id: string;
  email: string;
  invitedByUserId: string;
  sentAt: Date;
}
```

Controller는 ADMIN role과 enrolled MFA guard를 적용한다. 일반 인증 경로는 invitation repository를 조회하지 않는다. 상태 변경은 audit을 같은 use case에서 호출한다.

- [ ] **Step 4: 관리 tests와 frontend component test가 통과하는지 확인한다**

Run: `pnpm exec vitest run shared/contracts/src/identity/user-management.spec.ts backend/domain/src/identity/user-management.spec.ts backend/database/src/queries/drizzle-user-management.query.spec.ts backend/api/src/identity/admin-user-management.controller.spec.ts && pnpm --filter @flex-thia/web exec vitest run src/pages/user-management`

Expected: PASS.

- [ ] **Step 5: 사용자 관리를 커밋한다**

```bash
git add shared/contracts/src/identity/user-management.ts shared/contracts/src/identity/user-management.spec.ts backend/domain/src/identity/user-management.ts backend/domain/src/identity/user-management.spec.ts backend/domain/src/identity/user.repository.ts backend/database/src/queries/drizzle-user-management.query.ts backend/database/src/queries/drizzle-user-management.query.spec.ts backend/api/src/identity/admin-user-management.controller.ts backend/api/src/identity/admin-user-management.controller.spec.ts frontend/web/src/pages/user-management
git commit -m "feat(identity): manage beta users"
```

### Task 11: 기능 브랜치 검증과 조립 커밋 격리

**Files:**
- Modify: `shared/contracts/src/index.ts`
- Modify: `backend/domain/src/index.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `backend/providers/src/index.ts`
- Modify: `backend/providers/src/fakes/index.ts`

**Interfaces:**
- Consumes: Tasks 1–10.
- Produces: package public exports. App/infra/routes는 아직 조립하지 않는다.

- [ ] **Step 1: package import RED를 추가한다**

```ts
import {
  emailAuthenticationChallengeResponseSchema,
  userManagementListResponseSchema,
} from '@flex-thia/contracts';
import {
  PasswordlessAuthenticationService,
  UserManagementService,
} from '@flex-thia/domain';
```

- [ ] **Step 2: package typecheck가 export 누락으로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/contracts typecheck && pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/providers typecheck`

Expected: FAIL with missing exports.

- [ ] **Step 3: 새 public exports만 index에 추가한다**

각 package의 기존 export style을 따라 새 파일만 export한다. `app.module.ts`, OpenAPI, infra, route source, route tree, migration은 수정하지 않는다.

- [ ] **Step 4: 기능 브랜치 focused gate를 실행한다**

Run:

```bash
pnpm exec vitest run shared/contracts/src/identity
pnpm exec vitest run backend/domain/src/identity
pnpm exec vitest run backend/database/src/repositories/drizzle-email-challenge.repository.spec.ts backend/database/src/queries/drizzle-user-management.query.spec.ts
pnpm exec vitest run backend/providers/src/identity backend/providers/src/messaging
pnpm exec vitest run backend/api/src/identity
pnpm --filter @flex-thia/worker exec vitest run src/identity
pnpm --filter @flex-thia/web exec vitest run src/shared/api/auth src/pages/login src/pages/email-challenge src/pages/email-link-confirm src/pages/user-management
pnpm typecheck
pnpm structure:check
pnpm --filter @flex-thia/web architecture:check
```

Expected: PASS.

- [ ] **Step 5: export 조립을 격리 커밋한다**

```bash
git add shared/contracts/src/index.ts backend/domain/src/index.ts backend/database/src/index.ts backend/providers/src/index.ts backend/providers/src/fakes/index.ts
git commit -m "chore(identity): export passwordless modules"
```

### Task 12: 통합 담당자 — AppModule·OpenAPI·routes

**Files:**
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `backend/api/src/openapi/openapi.dto.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `frontend/web/src/app/routes/login.tsx`
- Modify: `frontend/web/src/app/routes/login.index.tsx`
- Create: `frontend/web/src/app/routes/login.challenge.tsx`
- Create: `frontend/web/src/app/routes/login.confirm.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.users.tsx`
- Modify: `frontend/web/src/app/routing/adminNavigation.ts`
- Generate: `frontend/web/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: merged identity feature branch.
- Produces: runtime module wiring, documented endpoints, reachable frontend routes.

- [ ] **Step 1: runtime wiring과 route reachability RED를 작성한다**

AppModule spec은 production에서 Cognito/SES/repository, local에서 fake provider/outbox가 주입되는지 확인한다. OpenAPI spec은 challenge 4개, TOTP, refresh/logout, `/me`, admin users를 확인하고 password login을 거부한다. route test는 `/login/challenge`, `/login/confirm`, admin users를 확인한다.

- [ ] **Step 2: focused tests가 조립 부재로 실패하는지 확인한다**

Run: `pnpm exec vitest run backend/api/src/app.module.spec.ts backend/api/src/openapi/openapi.spec.ts && pnpm --filter @flex-thia/web exec vitest run src/app/routing`

Expected: FAIL with providers/routes missing.

- [ ] **Step 3: root module과 routes를 최소 조립한다**

local에는 fake code `123456`과 outbox inspection을 dev-only로 주입한다. production에는 SES sender, Cognito provider, Drizzle repository를 주입한다. login confirm route는 mount 시 POST를 호출하지 않는다. routeTree는 기존 generator command로 재생성한다.

- [ ] **Step 4: API/web integration tests가 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/api/src/app.module.spec.ts backend/api/src/openapi/openapi.spec.ts && pnpm --filter @flex-thia/web exec vitest run src/app/routing src/pages/login src/pages/email-challenge src/pages/email-link-confirm`

Expected: PASS.

- [ ] **Step 5: runtime 조립을 커밋한다**

```bash
git add backend/api/src/app.module.ts backend/api/src/app.module.spec.ts backend/api/src/openapi frontend/web/src/app/routes frontend/web/src/app/routing/adminNavigation.ts frontend/web/src/routeTree.gen.ts
git commit -m "feat(identity): wire passwordless runtime"
```

### Task 13: 통합 담당자 — migration과 local seed

**Files:**
- Generate: `backend/database/drizzle/<next>_passwordless_identity.sql`
- Generate: `backend/database/drizzle/meta/<next>_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`
- Modify: `backend/database/seed/local.sql`

**Interfaces:**
- Consumes: Task 3/10 merged schema.
- Produces: additive challenge/beta tracking migration and local test users.

- [ ] **Step 1: migration을 순차 생성한다**

Run: `pnpm --filter @flex-thia/database db:generate`

Expected: challenge columns/status와 beta invitation tracking만 추가하고 users/sessions/content tables를 drop하지 않는다.

- [ ] **Step 2: migration SQL 안전성을 검사한다**

Run: `rg -n "DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM" backend/database/drizzle/<next>_passwordless_identity.sql`

Expected: 출력 없음.

- [ ] **Step 3: local seed를 passwordless 계정으로 정리한다**

learner `learner@hufs.ac.kr`, admin `admin@hufs.ac.kr`, ADMIN MFA enrolled 상태를 유지하고 password hash/fixture는 제거한다. local fake code는 DB가 아닌 AppModule fake 설정 `123456`에서만 온다.

- [ ] **Step 4: schema와 seed 검증이 통과하는지 확인한다**

Run: `pnpm exec vitest run backend/database/src/schema/schema.spec.ts backend/database/src/repositories/drizzle-email-challenge.repository.spec.ts && pnpm --filter @flex-thia/database typecheck`

Expected: PASS.

- [ ] **Step 5: migration을 커밋한다**

```bash
git add backend/database/drizzle backend/database/seed/local.sql
git commit -m "feat(database): migrate passwordless identity"
```

### Task 14: 통합 담당자 — Cognito·SES·API Gateway infra

**Files:**
- Modify: `infra/src/constructs/identity.ts`
- Modify: `infra/test/identity.spec.ts`
- Modify: `infra/src/constructs/http-api.ts`
- Modify: `infra/test/http-api.spec.ts`
- Modify: `infra/src/application-stack.ts`

**Interfaces:**
- Consumes: Task 6 handlers and Task 7 paths.
- Produces: Cognito custom auth triggers, 7일 refresh, 실제 `/api/v1` routes, 최소 SES 권한.

- [ ] **Step 1: CDK template RED를 작성한다**

```ts
template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
  ExplicitAuthFlows: Match.arrayWith(['ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
  RefreshTokenValidity: 7,
});
template.hasResourceProperties('AWS::Cognito::UserPool', {
  LambdaConfig: Match.objectLike({
    DefineAuthChallenge: Match.anyValue(),
    CreateAuthChallenge: Match.anyValue(),
    VerifyAuthChallengeResponse: Match.anyValue(),
  }),
});
```

HTTP API test는 `/api/v1/auth/challenges`, code/link/resend, TOTP, refresh/logout, `/api/v1/me`, admin users를 요구하고 old signup/password/phone/stepup routes를 거부한다.

- [ ] **Step 2: infra tests가 old password flow와 stale routes로 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/infra test`

Expected: FAIL.

- [ ] **Step 3: custom auth와 실제 HTTP routes를 조립한다**

UserPoolClient는 custom auth와 refresh만 learner login에 허용한다. 세 trigger Lambda permission을 UserPool에 연결한다. SES `SendEmail`은 configured identity/resource와 sender에만 허용한다. HTTP route는 Nest global prefix `/api/v1`과 정확히 일치시킨다.

- [ ] **Step 4: infra tests와 synth가 통과하는지 확인한다**

Run: `pnpm --filter @flex-thia/infra test && pnpm --filter @flex-thia/infra build`

Expected: PASS.

- [ ] **Step 5: infra 변경을 커밋한다**

```bash
git add infra/src/constructs/identity.ts infra/test/identity.spec.ts infra/src/constructs/http-api.ts infra/test/http-api.spec.ts infra/src/application-stack.ts
git commit -m "feat(infra): deploy passwordless identity"
```

### Task 15: 기존 password 경로 제거와 전체 검증

**Files:**
- Delete only when orphaned by Tasks 1–14: `backend/domain/src/auth/passwordless-auth.service.ts`
- Delete only when orphaned by Tasks 1–14: `backend/domain/src/auth/passwordless-auth.service.spec.ts`
- Delete only when orphaned by Tasks 1–14: `backend/providers/src/aws/cognito-identity.provider.ts`
- Delete only when orphaned by Tasks 1–14: `backend/providers/src/aws/cognito-identity.provider.spec.ts`
- Delete only when orphaned by Tasks 1–14: `backend/providers/src/aws/ses-challenge.sender.ts`
- Delete only when orphaned by Tasks 1–14: `backend/providers/src/aws/ses-challenge.sender.spec.ts`
- Delete only when orphaned by Tasks 1–14: `backend/providers/src/fakes/fake-identity-provider.ts`

**Interfaces:**
- Consumes: complete passwordless runtime.
- Produces: password-free source and verified `main`.

- [ ] **Step 1: password authentication references를 찾는다**

Run: `rg -n "password|ADMIN_USER_PASSWORD_AUTH|startSignup|resetPassword|/auth/login" backend frontend shared infra --glob '!**/*.md'`

Expected: 비밀번호 입력/login 흐름은 0건. 도메인 문서나 unrelated database credential config만 남는다.

- [ ] **Step 2: 이번 변경으로 고아가 된 legacy 파일과 export만 제거한다**

위 파일이 `rg` 결과에서 참조 0건일 때만 삭제하고 대응 index export를 제거한다. SMS step-up 등 별도 기능은 제거하지 않는다.

- [ ] **Step 3: 전체 품질 gate를 실행한다**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm structure:check
pnpm --filter @flex-thia/web architecture:check
pnpm --filter @flex-thia/web coverage
pnpm --filter @flex-thia/web build
pnpm --filter @flex-thia/infra test
```

Expected: 모든 command exit 0. watcher `EMFILE`만 발생하면 같은 check를 `CHOKIDAR_USEPOLLING=1`로 재실행한다.

- [ ] **Step 4: 보안 로그와 diff를 검사한다**

Run: `rg -n "console\\.|logger\\..*(code|token|session)|linkToken|codeHmac|linkHmac" backend --glob '!**/*.spec.ts' && git diff --check && git status --short`

Expected: secret 값 logging 없음, whitespace error 없음, migration/routeTree/infra는 각각 통합 커밋에만 포함.

- [ ] **Step 5: 제거 변경이 있으면 커밋한다**

```bash
git add backend/domain/src/auth backend/providers/src/aws backend/providers/src/fakes backend/domain/src/index.ts backend/providers/src/index.ts
git commit -m "refactor(identity): remove password auth paths"
```
