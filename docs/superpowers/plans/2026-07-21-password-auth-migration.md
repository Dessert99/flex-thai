# 비밀번호 인증 전환 구현 계획

**목표:** 이메일 인증 성공 전에는 Cognito 회원을 만들지 않고, 비밀번호 평문을 저장하지 않는 가입·로그인·재설정 흐름을 구현한다.

**구조:** 도메인이 인증 흐름과 상한을 결정하고, DB repository가 상한 검사와 challenge 생성을 원자적으로 처리한다. AWS provider는 Cognito·SES·SSM·SNS 호출만 담당하며 API와 CDK는 이 port들을 조립한다.

## 1. DB challenge 모델 전환

- `auth_challenges`에서 custom auth session/link/email hash를 제거하고 `email`, `purpose`, 조회 인덱스를 추가한다.
- repository 테스트를 먼저 새 계약에 맞춰 실패시킨 뒤, 최근 60초·24시간 상한 검사와 INSERT를 한 트랜잭션으로 구현한다.
- Drizzle migration을 생성한다.
- 검증: `pnpm --filter @flex-thia/database test && pnpm --filter @flex-thia/database typecheck`

## 2. 인증 도메인 전환

- passwordless 서비스를 가입 요청·가입 확인·로그인·재설정 요청·재설정 완료 서비스로 교체한다.
- 학교 이메일, 코드 만료/최대 시도, 비밀번호 정책, 기존 계정 확인, 상한 도달 동작을 단위 테스트로 먼저 고정한다.
- 코드 HMAC 외에는 비밀번호를 포함한 비밀 원문을 저장 port로 전달하지 않는다.
- 검증: `pnpm --filter @flex-thia/domain test && pnpm --filter @flex-thia/domain typecheck`

## 3. AWS 및 local provider 전환

- Cognito custom auth 대신 `AdminCreateUser`, `AdminSetUserPassword`, `AdminInitiateAuth`를 사용한다.
- SES 이메일에서 link를 제거하고 6자리 코드만 보낸다.
- challenge session 암복호화를 제거하고, SSM 상한 조회와 SNS 상한 알림 adapter를 추가한다.
- fake provider도 비밀번호 평문을 저장하지 않는다.
- 검증: `pnpm --filter @flex-thia/providers test && pnpm --filter @flex-thia/providers typecheck`

## 4. API 계약과 조립 전환

- 공개 route를 `/auth/signup`, `/auth/signup/verify`, `/auth/login`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/refresh`, `/auth/logout`으로 교체한다.
- 성공 토큰은 기존 쿠키 정책과 사용자 upsert를 재사용하고, 오류 HTTP 상태를 갱신한다.
- SSM·SES·SNS provider를 production에, 정적/fake provider를 local에 조립한다.
- 검증: `pnpm --filter @flex-thia/api test && pnpm --filter @flex-thia/api typecheck`

## 5. worker와 인프라 정리

- custom auth trigger 파일과 Lambda 연결을 제거한다.
- Cognito password policy와 서버 전용 password auth flow를 설정하고 서울 SMS용 `snsRegion`은 도쿄로 바로잡는다.
- session key secret을 제거하고 API의 SES/SSM/SNS 환경변수·최소 IAM 권한·신규 route·상한 Parameter Store 값을 추가한다.
- 관련 CDK 테스트를 먼저 새 기대값으로 바꾸고 구현한다.
- 검증: `pnpm --filter @flex-thia/worker build:lambda && pnpm infra:test && pnpm infra:synth`

## 6. 전체 회귀 검증

- `school.ac.kr`, custom auth, session key, 제거한 route가 실행 코드에 남지 않았는지 검색한다.
- 전체 format·lint·typecheck·test·build를 실행한다.
- 검증: `pnpm check`
