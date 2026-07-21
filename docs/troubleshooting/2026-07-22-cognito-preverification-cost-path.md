# 이메일 인증 전에 Cognito 회원을 만드는 공개 경로가 발견됨

> 교훈: 가입 보안은 인증 방식보다 외부 과금 자원을 만드는 시점을 기준으로 설계하고, 소유권 확인 전에는 영구 회원을 생성하지 마라.

- 날짜: 2026-07-22 · 영역: api · 커밋: `fb5d342`

## 주요 개념

### Cognito MAU 과금

[Cognito 가격 정책](https://aws.amazon.com/cognito/pricing/)은 한 달 동안 identity
operation이 발생한 회원을 MAU(Monthly Active User)로 계산한다. 로그인 성공만이
아니라 관리자 회원 생성과 `AdminGetUser` 같은 회원 속성 조회도 활성 동작에
포함된다.

따라서 공격자가 로그인을 완료하지 않아도 공개 API가 고유한 이메일마다
`AdminCreateUser`나 `AdminGetUser`를 호출하면 회원 레코드와 과금 대상이 늘 수 있다.

### 인증과 회원 생성 시점

이메일 인증은 사용자가 실제 메일함을 소유했는지 확인하는 절차다. 회원 생성은
Cognito에 장기간 남는 계정을 만드는 별도 절차다.

기존 passwordless 흐름은 인증 코드를 보내기 전에 Cognito 회원부터 만들었다.
비밀번호 가입으로 이름만 바꾸고 표준 `SignUp`을 사용해도 가입 요청 시 회원이 먼저
생기므로 비용 경계는 달라지지 않는다.

### 공개 endpoint와 상한

회원가입 시작 endpoint는 아직 로그인하지 않은 사용자가 호출해야 하므로 공개될
수밖에 없다. 공개 endpoint가 직접 Cognito 회원을 만들면 이메일 도메인 검사만으로는
로컬 부분을 계속 바꾼 대량 요청을 막지 못한다.

이 프로젝트는 공개 단계에서 Cognito를 호출하지 않고, 발송 횟수에 이메일별
쿨다운·일일 한도와 서비스 전체 24시간 한도를 둔다. 실제 이메일 코드를 확인한
요청만 영구 회원 생성 단계로 넘어간다.

## 증상

1. 비밀번호 인증 전환 설계를 검토하던 중 인증 없는 `POST /auth/challenges`가 요청마다 Cognito 회원을 만들 수 있는 경로를 발견했다.
2. 해당 route에는 로그인, CSRF, captcha, 요청 횟수 제한이 없고 허용 이메일 도메인만 검사했다.
3. 실제 공격이나 과금 증가는 관찰하지 않았으며 production 배포 전에 코드 검토로 발견한 취약점이다.

## 원인

1. 기존 `PasswordlessAuthService`는 이메일 도메인을 검사한 뒤 `AdminGetUser`로 회원을 조회했다.
2. 회원이 없으면 `CognitoIdentityProvider`가 이메일 소유권을 확인하기 전에 `AdminCreateUser`를 호출했다.
3. 그 뒤에야 custom auth challenge를 시작하고 이메일 코드를 발송했으므로 인증 실패 여부와 관계없이 영구 회원이 먼저 생겼다.
4. 이메일 인증 코드를 보내려면 Cognito 회원이 먼저 필요하다는 passwordless 흐름의 전제가 공개 과금 경로를 만들었다.

## 어떻게 찾았나

1. 과금 우려 때문에 Cognito가 어떤 동작을 MAU로 세는지 확인했다.
2. 공개 controller에서 domain service와 provider까지 호출 경로를 따라가 `AdminGetUser → AdminCreateUser → custom challenge` 순서를 확인했다.
3. `selfSignUpEnabled: false`는 공개 Cognito `SignUp`만 막고 서버의 `AdminCreateUser`는 막지 않는다는 점을 확인했다.
4. API Gateway throttle과 Lambda 예약 동시성은 호출 속도만 늦출 뿐 Cognito 회원 생성 자체를 막지 못하므로 근본 해결이 아님을 확인했다.
5. 비밀번호 방식도 가입 요청 즉시 Cognito 회원을 만들면 같은 문제가 남아 회원 생성 시점을 인증 뒤로 옮겨야 한다고 결론냈다.

## 해결

1. 가입을 `POST /auth/signup`의 코드 발송과 `POST /auth/signup/verify`의 코드 확인·회원 생성으로 분리했다.
2. 첫 단계는 Aurora에 코드 HMAC과 이메일을 저장하고 SES로 코드를 보낼 뿐 Cognito를 호출하지 않게 했다.
3. 두 번째 단계에서 이메일 코드가 맞는 경우에만 `AdminCreateUser`와 영구 비밀번호 설정을 실행하게 했다.
4. Cognito의 `selfSignUpEnabled: false`와 계정 복구 비활성화를 유지해 클라이언트가 프로젝트 API의 상한을 우회하지 못하게 했다.
5. 비밀번호는 요청 처리 메모리에서 Cognito로 전달할 뿐 DB, Secret, 로그에 평문으로 저장하지 않게 했다.
6. 이메일별 60초 쿨다운, 최근 24시간 5회, 서비스 전체 최근 24시간 500회의 발송 상한을 추가했다.

## 재발 방지

1. domain 테스트에서 인증 코드 검증 전 Cognito 회원 생성이 호출되지 않는지 검증한다.
2. provider 테스트에서 관리자 비밀번호 인증과 영구 비밀번호 설정 명령만 사용하는지 검증한다.
3. infra 테스트에서 자가 가입과 custom auth trigger가 꺼지고 서버 전용 비밀번호 인증만 열리는지 검증한다.
4. controller와 저장소 테스트에서 가입 2단계, 코드 HMAC, 발송 상한 동작을 검증한다.
