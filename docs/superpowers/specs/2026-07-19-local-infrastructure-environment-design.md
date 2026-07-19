# 로컬 인프라 환경 설정 설계

## 목표

개발자가 운영 인프라의 `cdk diff`를 실행할 때마다 여러 값을 터미널에
`export`하지 않도록 한다. 로컬 설정은 Git에 포함되지 않는 전용 환경
파일에 저장하되, GitHub Actions의 운영 배포 방식과 CDK context 계약은
그대로 유지한다.

## 선택한 방식

저장소 루트에 다음 두 파일을 둔다.

- `.env.infrastructure.example`: 필요한 항목과 예시를 기록하며 Git에
  포함한다.
- `.env.infrastructure.local`: 실제 로컬 값을 기록하며 기존 `.gitignore`
  규칙으로 Git에서 제외한다.

전용 TypeScript 실행기가 `.env.infrastructure.local`을 읽고 검증한 다음
기존 CDK 명령에 `-c` context를 전달한다. `infra/src/app.ts`와 GitHub
Actions workflow는 변경하지 않는다.

## 설정 책임 분리

`.env.infrastructure.local`에는 다음과 같은 비밀이 아닌 배포 설정만
저장한다.

- AWS SSO profile 이름
- AWS account ID
- 루트 도메인과 Route 53 hosted zone ID
- 비용 알림 이메일과 허용 이메일 도메인
- GitHub 저장소 이름
- 월 예산
- 공개 키 파일 경로

다음 값은 환경 파일에 저장하지 않는다.

- AWS access key와 SSO token
- 미디어 서명 private key
- GitHub OIDC 배포 role의 secret 값

AWS 인증 정보는 AWS CLI가 `~/.aws`와 SSO cache에서 관리한다. 미디어
private key는 현재 로컬 PEM 파일과 배포 후 AWS Secrets Manager에서
관리한다. 공개 키는 환경 파일에 복사하지 않고 지정된 파일을 실행 시점에
읽는다.

## 실행 흐름

로컬 운영 diff 명령은 다음 순서로 동작한다.

1. `.env.infrastructure.local`을 읽는다.
2. 필수 설정과 공개 키 파일을 검증한다.
3. 지정된 AWS SSO profile로 현재 account ID를 조회한다.
4. 조회한 account ID가 설정한 account ID와 같은지 확인한다.
5. 공개 키 파일을 읽어 기존 CDK context를 구성한다.
6. `cdk diff --all --no-change-set`을 실행한다.

로그인 세션이 만료된 경우 실행기는 실패 이유와 `aws sso login --profile
<profile>` 명령을 안내한다. 로그인 자체를 자동으로 시작하지 않는다.

## 명령과 범위

루트 `package.json`에 로컬 전용 명령 하나를 추가한다.

```bash
pnpm infra:diff:prod
```

이 명령은 AWS 상태를 읽고 CloudFormation 차이를 계산할 뿐, `cdk deploy`를
실행하지 않는다. 운영 배포 명령은 추가하지 않아 실수로 과금 자원을
생성할 가능성을 줄인다.

## 오류 처리

다음 상황에서는 CDK를 실행하지 않고 명확한 오류로 종료한다.

- 로컬 환경 파일이 없음
- 필수 값이 비어 있거나 형식이 잘못됨
- 공개 키 파일이 없거나 PEM 공개 키가 아님
- AWS profile 인증이 만료됨
- 로그인한 AWS account와 설정한 account가 다름

오류 메시지에는 private key나 환경 변수 전체 값을 출력하지 않는다.

## 테스트와 문서

- 환경 파일 파싱과 필수 값 검증을 단위 테스트한다.
- CDK 인수 구성을 단위 테스트해 기존 context 이름이 유지되는지 확인한다.
- 실제 `aws`나 `cdk` 프로세스는 단위 테스트에서 실행하지 않는다.
- `.env.infrastructure.example`과 AWS 배포 문서에 로컬 diff 사용법을
  반영한다.

## 성공 기준

- 새 터미널에서도 실제 값의 재입력 없이 `pnpm infra:diff:prod`를 실행할 수
  있다.
- Git에 실제 로컬 환경 파일과 private key가 포함되지 않는다.
- GitHub production 배포 설정과 workflow 동작은 바뀌지 않는다.
- 실행기가 잘못된 AWS account에 대한 diff 실행을 차단한다.
- 테스트, lint, typecheck, format 검사가 통과한다.
