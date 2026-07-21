# 비밀번호 인증 전환과 회원 생성 과금 취약점 제거

이 문서는 그 자체로 작업 지시서다. 이 문서만 읽고 작업을 시작할 수 있어야 한다.
프로젝트 공통 규칙은 `AGENTS.md`와 `conventions/`를 따른다.

---

## 1. 배경

태국어 FLEX 시험 대비 학습 서비스. 한국외대(`hufs.ac.kr`) 학생을 대상으로 한다.

- 백엔드: NestJS on Lambda, Aurora Serverless v2 (Data API), Cognito, SES, SQS, Step Functions
- 인프라: AWS CDK (`infra/`), 서울 리전 + 버지니아(CloudFront)
- 현재 상태: **아직 production 배포 전. 테스트 단계.**

현재 인증은 **비밀번호 없는(passwordless) 이메일 코드 로그인**으로 구현되어 있다.
`docs/superpowers/plans/2026-07-17-aws-infrastructure-foundation.md`에서 의도적으로 선택한 설계였다.

---

## 2. 문제: 인증 없는 회원 생성 경로 (요금 폭탄)

### 2.1 취약 경로

`POST /auth/challenges` — 인증 없음, CSRF 가드 없음, captcha 없음, 횟수 제한 없음.

호출 흐름:

| 단계 | 위치 | 결과 |
| --- | --- | --- |
| 1 | [auth.controller.ts:58](../../../apps/api/src/auth/auth.controller.ts#L58) | 인증 검사 없이 진입 |
| 2 | [passwordless-auth.service.ts:83](../../../packages/domain/src/auth/passwordless-auth.service.ts#L83) | 이메일 도메인만 검사 |
| 3 | [cognito-identity.provider.ts:64](../../../packages/providers/src/aws/cognito-identity.provider.ts#L64) | `AdminGetUser` |
| 4 | [cognito-identity.provider.ts:75](../../../packages/providers/src/aws/cognito-identity.provider.ts#L75) | **`AdminCreateUser` — Cognito 회원 영구 생성** |
| 5 | [cognito-identity.provider.ts:90](../../../packages/providers/src/aws/cognito-identity.provider.ts#L90) | `InitiateAuth CUSTOM_AUTH` |
| 6 | [create-auth-challenge.ts:43-55](../../../apps/worker/src/auth/create-auth-challenge.ts#L43-L55) | Aurora INSERT + SES 발송 |

### 2.2 근본 원인

Cognito 요금은 MAU(Monthly Active User) 기준이고, AWS 정의상 **회원 생성과 조회만으로도 과금 대상**이다.

> "A user is counted as a MAU if, within a calendar month, customers' application generates an
> identity operation for that user, like **administrative creation or update**, sign-up, sign-in,
> sign-out, token refresh, password change, a user account attribute update, or
> **an attribute query on a user (AdminGetUser API)**."
> — https://aws.amazon.com/cognito/pricing/

- 커스텀 인증 Lambda 트리거를 쓰므로 Essentials 티어: **1만 MAU 무료, 이후 MAU당 $0.015**
- 로그인 성공 여부와 무관하게 3~4단계에서 이미 과금이 확정된다
- 생성된 회원은 Cognito에 영구히 남는다

**즉 이 엔드포인트는 "요청 1건 = $0.015 결제"이며 인터넷에 무인증으로 열려 있다.**

### 2.3 기존 방어가 모두 무력한 이유

| 방어 | 무력한 이유 |
| --- | --- |
| Cognito JWT | 이 라우트는 authorizer 없는 공개 루프에 있다 ([http-api.ts:158-168](../../../infra/src/constructs/http-api.ts#L158-L168)) |
| `CsrfGuard` | `refresh`/`logout`에만 적용 |
| 이메일 도메인 allowlist | 골뱅이 뒤만 검사. 앞부분은 무한한 고유값을 만들 수 있다 |
| `selfSignUpEnabled: false` | 공개 `SignUp` API만 막는다. **`AdminCreateUser`에는 적용되지 않는다** |
| Lambda 예약 동시성 5 | Lambda 요금만 막는다. Cognito·SES 요금은 못 막는다 |
| API Gateway throttle | `defaultRouteSettings`는 **라우트별** 적용이라 이 라우트 혼자 5 rps를 쓴다 ([http-api.ts:198-201](../../../infra/src/constructs/http-api.ts#L198-L201)) |
| AWS WAF | HTTP API(apigwv2)에는 붙일 수 없다 |
| AWS Budget | 알림 전용. 비용 데이터가 8~24시간 지연되어 사후 통지에 그친다 |

### 2.4 피해 규모

라우트 throttle 5 rps 기준:

```
5 req/s × 86,400 s = 432,000 회원/일
(432,000 − 10,000 무료) × $0.015 ≈ $6,330/일  (약 890만 원)
30일 지속 시 ≈ $194,000/월
```

부수 피해: 존재하지 않는 메일 주소로 대량 발송 → SES 반송률 급등 →
**5% 초과 시 계정 심사, 10% 초과 시 발송 정지** → 실제 학생이 로그인 불가.

---

## 3. 요구사항 변경

사용자가 원래 의도한 인증 방식은 다음과 같으며, 현재 구현과 다르다.

1. 이메일 + **비밀번호** 가입
2. **`hufs.ac.kr`** 이메일만 허용 (현재 코드는 전부 `school.ac.kr` 자리표시자)
3. 회원가입 시 이메일 인증 필요 — **6자리 코드 입력 방식**

---

## 4. 설계 시 반드시 피해야 할 함정 두 가지

### 함정 1: 비밀번호 방식으로 바꾸는 것만으로는 해결되지 않는다

Cognito 표준 가입(`SignUp`)은 **가입 요청 즉시 회원 레코드를 만든다.** "미인증" 상태일 뿐
과금 정의상 `sign-up`은 명백한 과금 작업이다.

```
공격 페이로드 변화:
  현재    { "email": "zzz1@hufs.ac.kr" }
  변경 후 { "email": "zzz1@hufs.ac.kr", "password": "aaaa1234!" }
```

공격자가 타이핑할 글자가 늘어날 뿐 요금 구조는 동일하다.

**관건은 인증 방식(비밀번호 유무)이 아니라 "회원을 언제 만드느냐"다.**

| 설계 | 회원 생성 시점 | 안전 |
| --- | --- | --- |
| 현재 | 요청 즉시 | ❌ |
| 비밀번호 + Cognito 표준 가입 | 가입 요청 즉시 | ❌ 동일 |
| **이메일 인증 성공 후 생성** | 사용자가 실제 메일함을 연 뒤 | ✅ |

### 함정 2: 자가 가입을 켜면 상한이 우회된다

`selfSignUpEnabled: true`로 바꾸면 Cognito의 공개 `SignUp` 엔드포인트가 인터넷에 직접 열린다.
공격자는 우리 API를 건너뛰고 Cognito를 직접 호출하므로 **API에 건 모든 상한이 무효화된다.**

```
selfSignUp OFF:  브라우저 ──→ 우리 API ──→ Cognito     문이 하나. 상한 유효.
selfSignUp ON:   브라우저 ──→ 우리 API ──→ Cognito
                          └───────────────→ Cognito     상한 우회.
```

**`selfSignUpEnabled: false`를 유지한다.** 비밀번호 재설정도 Cognito 기본 계정 복구
(`accountRecovery`)를 열지 않고 우리 API가 이메일 코드로 처리한다. Cognito 쪽에
공개 창구를 하나도 만들지 않는 것이 원칙이다.

---

## 5. 해결 설계

### 5.1 가입을 2단계로 분리한다 (핵심)

```
① POST /auth/signup            { email }
     → hufs.ac.kr 도메인 검사
     → 발송 상한 검사
     → auth_challenges에 6자리 코드 HMAC 저장
     → SES로 코드 발송
     → ⚠️ Cognito를 전혀 호출하지 않는다

② POST /auth/signup/verify     { challengeId, code, password }
     → 코드 검증 성공한 경우에만
     → AdminCreateUser + 비밀번호 영구 설정
     → 토큰 발급
```

효과:

| | 요청 1건 비용 | 공격자가 회원 생성 가능? |
| --- | --- | --- |
| 현재 | $0.015 (약 21원) | ✅ 무제한 |
| ①단계 | SES 1통 (약 0.14원) | ❌ 불가 |

Cognito 회원은 **실제 메일함 소유자에게만** 생성된다. 공격자는 수십만 개의 메일함을 열 수 없다.
이 설계는 요금 문제를 상한으로 누르는 것이 아니라 **원인을 제거한다.**

비밀번호를 ②에서 받는 이유가 하나 더 있다 — ①에서 받으면 인증 대기 시간(10분) 동안
비밀번호를 DB에 보관해야 한다. ②에서 받으면 그럴 필요가 없다.

`auth_challenges`에는 인증이 끝난 뒤 Cognito 계정을 만들 수 있도록 정규화한 이메일을 저장한다.
이메일은 가입 완료 후에도 `users.email`에 보관하는 계정 식별 정보이므로, 복호화할 수 없는 임의
해시로 바꾸지 않는다. 대신 인증 코드는 원문이 아니라 HMAC만 저장한다.

**비밀번호 평문은 DB, S3, Secrets Manager, 환경변수, 애플리케이션 로그 어디에도 저장하지 않는다.**
HTTPS 요청을 처리하는 동안 API 프로세스 메모리에만 잠시 존재하며, 가입·재설정 때
`AdminSetUserPassword(Permanent: true)`로 Cognito에 전달하고 로그인 때
`AdminInitiateAuth`에 전달한 뒤 버린다. 애플리케이션은 Cognito 내부의 비밀번호 표현을 조회하거나
보관하지 않는다.

비밀번호 정책은 Cognito와 API 입력 검증에서 동일하게 **최소 8자, 영문 대문자·소문자·숫자·기호
각 1개 이상**으로 둔다.

화면 구성:

```
화면1: [ 이메일 ]                                  → "코드를 보냈습니다"
화면2: [ 코드 6자리 ] [ 비밀번호 ] [ 비밀번호 확인 ] → 가입 완료
```

### 5.2 나머지 흐름

```
로그인:      POST /auth/login              { email, password }
             → AdminInitiateAuth (ADMIN_USER_PASSWORD_AUTH)

재설정 요청: POST /auth/password/forgot    { email }
             → 기존 회원만 대상, 상한 적용, 코드 발송
             ← 계정 존재 여부와 무관하게 { accepted, challengeId }

재설정 완료: POST /auth/password/reset     { challengeId, code, newPassword }
             → 코드 검증 후 AdminSetUserPassword

유지:        POST /auth/refresh, POST /auth/logout
```

비밀번호 검증은 `ADMIN_USER_PASSWORD_AUTH`(서버 전용)만 연다.
`ALLOW_USER_PASSWORD_AUTH`/`ALLOW_USER_SRP_AUTH`는 열지 않는다 — 함정 2와 같은 이유다.

### 5.3 발송 상한 (①단계와 재설정 요청에 적용)

| 제한 | 값 | 막는 것 |
| --- | --- | --- |
| 이메일당 쿨다운 | 60초 | 특정 메일함 폭탄 |
| 이메일당 하루 | 5회 | 반복 남용 |
| **전체 하루** | 500회 | 메일 요금 + SES 반송률 급등 |

카운트 기준은 `auth_challenges.createdAt`이다. 값은 Parameter Store에 둔다 —
[observability.ts:189-203](../../../infra/src/constructs/observability.ts#L189-L203)에 동일 패턴이 있어
재배포 없이 조정할 수 있다.

전체 상한에 걸리면 알림이 가야 한다. 상한 도달은 "공격 중" 또는 "상한이 너무 낮음"을 뜻하므로
사람이 즉시 확인해야 한다.

상한 검사와 challenge 생성은 하나의 DB 트랜잭션에서 직렬화한다. 검사와 INSERT를 따로 실행하면
동시에 들어온 요청들이 같은 남은 수량을 보고 전체 상한을 넘길 수 있기 때문이다. 하루는 시간대가
바뀔 때 기준이 흔들리지 않도록 요청 시각부터 거슬러 올라간 **최근 24시간**으로 계산한다.

**트레이드오프(수용):** 공격자가 하루 상한을 소진하면 그날 신규 가입이 막힌다.
기존 회원 로그인은 영향받지 않는다(신규 생성 경로를 거치지 않으므로).
요금 폭탄보다 일시적 가입 중단이 낫다는 판단이다.

---

## 6. 작업 계획

의존 방향(`packages` → `apps` → `infra`)을 따라 안쪽부터 진행한다.

### 1단계 — DB 스키마

- [identity.schema.ts:52-68](../../../packages/database/src/schema/identity.schema.ts#L52-L68) `authChallenges` 변경
  - 제거: `emailHash`, `cognitoSessionCiphertext`, `linkHmac`
  - 추가: 정규화한 `email`, `purpose` (`SIGNUP` | `PASSWORD_RESET`),
    `email + createdAt` 및 `createdAt` 인덱스(상한 카운트용)
- 마이그레이션 생성
- **검증:** repository 테스트 통과

### 2단계 — 도메인

- `packages/domain/src/auth/passwordless-auth.service.ts`를 가입·로그인·재설정 서비스로 교체
- 발송 상한 로직 추가
- `challenge.repository.ts`의 `IdentityProvider`·`AuthChallengeRepository` port 재정의
- **검증:** 단위 테스트 통과. `describe`/`it` 설명은 한국어

### 3단계 — 프로바이더

- `cognito-identity.provider.ts`를 `AdminInitiateAuth` / `AdminSetUserPassword` 기반으로 교체
- `ses-challenge.sender.ts`에서 링크 발송 제거 (코드만 발송)
- `challenge-crypto.ts`의 `encryptSession`/`decryptSession` 제거
  — passwordless 전용이며 다른 사용처가 없음을 확인했다
- **검증:** spec 통과

### 4단계 — API

- `auth.controller.ts` 라우트 교체 (`/auth/challenges/*` 제거, 5.2의 라우트 추가)
- `auth.module.ts` 배선 갱신
- **검증:** controller 테스트 통과

### 5단계 — worker 정리

- 삭제: `apps/worker/src/auth/define-auth-challenge.ts`, `create-auth-challenge.ts`,
  `verify-auth-challenge.ts`, `runtime.ts`와 각 spec
- **검증:** `pnpm build:lambda` 성공

### 6단계 — 인프라

- [identity.ts:104-111](../../../infra/src/constructs/identity.ts#L104-L111)
  `explicitAuthFlows` → `['ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']`
- [identity.ts:42-49](../../../infra/src/constructs/identity.ts#L42-L49) `passwordPolicy` 추가.
  `selfSignUpEnabled: false`와 `accountRecovery: NONE`은 **유지**
- [identity.ts:81-92](../../../infra/src/constructs/identity.ts#L81-L92) 커스텀 인증 트리거 3개 제거
- [data-stack.ts:114-125](../../../infra/src/data-stack.ts#L114-L125) `ChallengeSessionKey` 시크릿 제거
  (사용처가 사라짐). `ChallengeHmacPepper`는 코드 해싱에 계속 필요하므로 유지
- [http-api.ts:158-188](../../../infra/src/constructs/http-api.ts#L158-L188) 라우트 목록 갱신,
  환경변수에서 `CHALLENGE_SESSION_KEY_SECRET_ARN` 제거
- [config.ts:17](../../../infra/src/config.ts#L17)과
  [api-env.ts:28](../../../packages/config/src/api-env.ts#L28) 도메인 기본값 → `hufs.ac.kr`
  (테스트·문서의 `school.ac.kr` 자리표시자도 함께 정리)
- 상한값 3개를 Parameter Store에 추가
- **검증:** `pnpm infra:test`, `pnpm infra:synth` 성공

### 7단계 — 전체 검증

- **검증:** `pnpm check` (format + lint + typecheck + test + build) 전부 통과

---

## 7. 범위 밖 (건드리지 않는다)

- 관리자 step-up 인증, 전화번호 검증, 업로드, jobs — 모두 JWT 기반이라 영향 없음
- **P0-2 (SMS 펌핑)**: [phone-verification.controller.ts:49](../../../apps/api/src/auth/phone-verification.controller.ts#L49)의
  정규식 `/^\+[1-9]\d{7,14}$/`가 전 세계 번호를 허용하고 쿨다운·국가 제한이 없다.
  현재 유일한 방어는 SNS 계정 월 SMS 지출 한도(수동 콘솔 설정)뿐이다.
  **이번 작업 범위 밖이지만 배포 전에 반드시 별건으로 처리해야 한다.**
- CloudFront `errorResponses`가 `/media/*`의 403까지 200으로 바꾸는 문제
- `mediaBucket`에 lifecycle rule이 없는 문제

---

## 8. 완료 기준

- [ ] 인증 없이 호출 가능한 엔드포인트 중 Cognito 회원을 생성하는 것이 하나도 없다
- [ ] 이메일 인증 코드를 통과하지 않고는 Cognito 회원이 생성되지 않는다
- [ ] `selfSignUpEnabled: false`이고 Cognito 쪽 공개 인증 창구가 열려 있지 않다
- [ ] 발송 상한 3종이 동작하고 전체 상한 도달 시 알림이 간다
- [ ] 허용 이메일 도메인이 `hufs.ac.kr`이다
- [ ] `pnpm check` 전체 통과
