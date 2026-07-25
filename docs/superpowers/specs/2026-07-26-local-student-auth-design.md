# 로컬 학생 인증 설계

## 목적

로컬 `fake` 인증에서 관리자와 학생이 각자의 계정으로 로그인하고, 로그인
과정에서 발급된 access token의 실제 subject가 `/me`와 역할 검사에
사용되게 한다. 실제 Cognito 동작과 공개 HTTP 계약은 변경하지 않는다.

## 계정

| 역할 | 이메일 | 비밀번호 | subject | 로그인 MFA |
| --- | --- | --- | --- | --- |
| 관리자 | `admin@hufs.ac.kr` | `qwer1234!@#` | `local-admin-sub` | `123456` |
| 학생 | `learner@hufs.ac.kr` | `qwer1234!@#` | `local-learner-sub` | 없음 |

관리자 계정의 기존 환경 변수와 시드는 유지한다. 학생 계정에는 별도의
`FAKE_LEARNER_SUB`, `FAKE_LEARNER_EMAIL`, `FAKE_LEARNER_PASSWORD` 환경
변수를 추가하고 같은 값을 `test`, `frontend-dev` 프로필에서 사용한다.

## 인증 흐름

`FakeAuthenticationProvider`는 하나의 계정 대신 관리자와 학생 계정 목록을
받는다. 각 계정은 독립된 salt와 비밀번호 digest를 가지며 관리자만 TOTP
challenge를 요구한다.

fake provider가 access token을 발급할 때 token과 subject를 메모리에서
연결한다. refresh token과 MFA challenge도 발급 계정과 연결해, refresh와
MFA 완료 뒤에도 같은 계정의 subject와 이메일을 유지한다.

fake 모드의 `CognitoAuthorizerGuard`는 프록시가 삽입한 subject 헤더를
사용하지 않는다. 요청의 Bearer access token을 root module이 전달한 local
resolver로 확인하고 subject를 얻은 뒤 기존 사용자 repository 조회와 상태
검사를 그대로 수행한다. Cognito 모드의 API Gateway claim 검사는 변경하지
않는다.

Vite와 Nginx 프록시에서는 고정 `X-Dev-User-Sub` 설정을 제거한다. 브라우저가
이미 공개 계약에 따라 보내는 Authorization header가 그대로 API에
전달되므로 별도의 프론트엔드 계약이나 상태는 추가하지 않는다.

## 시드 연결

`users`에 `local-learner-sub`를 가진 ACTIVE `LEARNER` 사용자를 추가한다.
학생은 관리자 MFA 상태를 갖지 않는다.

학습 이력, 저장 문제, 저장 어휘는 학생 사용자 ID를 참조한다. 콘텐츠
가져오기처럼 관리자 행동으로 생성된 시드는 기존 관리자 사용자 ID를
계속 참조한다. 따라서 두 계정이 같은 콘텐츠 그래프를 보더라도 개인 학습
데이터와 관리자 작업 소유권은 역할에 맞게 분리된다.

## 오류와 보안 경계

- 등록되지 않은 이메일, 잘못된 비밀번호, 알 수 없는 access/refresh token은
  기존 인증 오류로 거부한다.
- 다른 이메일로 관리자 MFA challenge를 완료할 수 없다.
- `NODE_ENV=production`에서 fake 인증을 금지하는 기존 검증을 유지한다.
- 클라이언트가 subject를 직접 선택하는 header는 사용하지 않는다.
- 실제 Cognito provider, API Gateway claim 형식, 공개 로그인·`/me` 응답
  schema는 변경하지 않는다.

## 테스트와 검증

테스트 설명은 한국어로 작성하고 다음 순서로 TDD를 수행한다.

1. 다중 계정 로그인, 학생 MFA 생략, 계정별 refresh, access token subject
   해석을 fake provider 실패 테스트로 추가한다.
2. fake Guard가 Bearer token resolver의 subject를 사용하고 고정 header를
   신뢰하지 않는 실패 테스트를 추가한다.
3. 환경 설정과 root module이 두 계정과 resolver를 조립하는 실패 테스트를
   추가한다.
4. 로컬 시드에서 학생 개인 데이터와 관리자 작업 데이터의 연결을 검증하는
   실패 테스트를 추가한다.
5. 관련 단위 테스트, lint, typecheck, Docker Compose 프로필 구성을
   검증한다.
6. 실행 중인 로컬 환경에서 관리자 로그인과 MFA, 학생 로그인, `/me`,
   학생 API 허용, 학생의 관리자 API 거부를 확인한다.

브라우저·API E2E 스펙이나 러너는 저장소에 추가하지 않는다.

