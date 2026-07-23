# 백엔드 기반 로컬 실행 가이드

이 문서는 인프라와 백엔드가 익숙하지 않은 개발자가 FLEX THIA의 기초
백엔드를 자기 컴퓨터에서 실행하는 방법을 설명한다.

## 먼저 알아둘 프로그램의 정체

- **NestJS API**는 브라우저의 HTTP 요청을 받아 인증, 업로드, 작업 생성
  규칙을 실행하는 Node.js 프로그램이다.
- **PostgreSQL**은 사용자와 작업 상태를 디스크에 보존하는 별도
  프로그램이다. API를 껐다 켜도 데이터가 남는다.
- **Docker**는 로컬 컴퓨터에서 PostgreSQL을 정해진 설정으로 실행하는
  환경이다. AWS 서비스가 아니며 개발할 때만 사용한다.
- **Drizzle migration**은 TypeScript로 정의한 테이블 구조를 실제
  PostgreSQL에 만드는 작업이다.
- **Lambda build**는 NestJS API와 worker 코드를 AWS Lambda가 바로 호출할
  수 있는 JavaScript 묶음으로 만드는 작업이다. 빌드 자체는 AWS에
  배포하지 않는다.

현재 Identity MVP의 로컬 실행은 Cognito 대신 비용이 들지 않는 fake
인증 adapter를 사용한다. 데이터 저장소는 Docker PostgreSQL을 사용하므로
사용자와 MFA 상태는 운영 환경과 같은 테이블 구조로 확인할 수 있다.
Job·upload·phone·SMS 코드는 다음 단계 호환을 위해 남아 있지만 root
애플리케이션에는 연결되지 않는다.

## 1. 한 번만 준비하기

저장소 루트에서 다음 명령을 순서대로 실행한다.

```bash
corepack enable
pnpm install
docker compose up -d postgres
pnpm --filter @flex-thia/database db:migrate:local
```

- `corepack enable`: 저장소가 지정한 pnpm 버전을 사용할 수 있게 한다.
- `pnpm install`: 각 프로그램이 사용하는 라이브러리를 설치한다.
- `docker compose up -d postgres`: PostgreSQL 컴퓨터 한 대를 로컬
  컨테이너로 실행한다.
- `db:migrate:local`: 빈 DB에 users, uploads, jobs 같은 테이블을 만든다.

Docker Desktop이 일시정지되어 있으면 PostgreSQL도 응답하지 않는다.
Docker Desktop을 다시 시작하거나 재개한 뒤 위 두 DB 명령을 실행한다.

## 2. API 실행하기

기본 로컬 값은 코드에 안전한 개발 전용 값으로 들어 있다. 주소나 학교
도메인을 바꾸려면 `.env.example` 값을 현재 터미널의 환경 변수로 설정한
뒤 다음 명령을 실행한다.

```bash
pnpm --filter @flex-thia/api dev
```

API는 기본적으로 `http://localhost:3000`에서 요청을 기다린다. 다른
터미널에서 다음 두 주소를 확인한다.

```bash
curl http://localhost:3000/health
curl -i http://localhost:3000/ready
```

- `/health`는 API 프로그램 자체만 확인하므로 DB가 잠들어도 `ok`다.
- `/ready`는 DB에 `select 1`을 보내 확인한다. DB가 재개 중이면
  `503 DB_RESUMING`과 `Retry-After: 3`을 반환한다.

## 3. 사전 준비 계정으로 로그인하기

공개 signup과 셀프 password reset은 제공하지 않는다. 로컬 fake 계정은
`.env.example`의 다음 값을 사용한다.

```text
FAKE_USER_EMAIL=admin@hufs.ac.kr
FAKE_USER_PASSWORD=LocalOnly1!
FAKE_USER_SUB=local-admin-sub
```

로그인은 허용된 exact Origin과 `X-CSRF-Protection: 1`을 함께 보낸다.

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -H 'origin: http://localhost:5173' \
  -H 'x-csrf-protection: 1' \
  -d '{"email":"admin@hufs.ac.kr","password":"LocalOnly1!"}'
```

로컬 계정은 TOTP를 요구하므로 `MFA_REQUIRED`와 `challengeToken`이
돌아온다. 해당 token과 고정 개발 code `123456`을 challenge endpoint에
보내면 access token이 body에 오고 refresh token은 cookie에만 저장된다.

```bash
curl -X POST http://localhost:3000/api/v1/auth/mfa/totp/challenge \
  -H 'content-type: application/json' \
  -H 'origin: http://localhost:5173' \
  -H 'x-csrf-protection: 1' \
  -c cookies.txt \
  -d '{"email":"admin@hufs.ac.kr","challengeToken":"CHALLENGE_TOKEN","code":"123456"}'
```

access token은 localStorage가 아니라 애플리케이션 메모리에만 둔다.
refresh cookie는 `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`인
`__Host-flex-thia-refresh`이고 수명은 7일이다. 브라우저에서 개발할 때는
Vite의 `/api` proxy를 `http://localhost:3000`으로 연결해 프론트와 API
요청 경계를 일관되게 유지한다.

refresh와 logout 요청에도 cookie credentials, exact Origin,
`X-CSRF-Protection: 1`이 필요하다.

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'origin: http://localhost:5173' \
  -H 'x-csrf-protection: 1' \
  -b cookies.txt -c cookies.txt

curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H 'origin: http://localhost:5173' \
  -H 'x-csrf-protection: 1' \
  -b cookies.txt
```

첫 challenge 완료로 DB 사용자가 생기면, 최초 한 번만 변경되지 않는
Cognito `sub`를 정확히 지정해 관리자로 승격한다.

```bash
pnpm --filter @flex-thia/api bootstrap-admin --sub=local-admin-sub
```

관리자는 보호 기능을 쓰기 전에 TOTP 등록도 완료해야 한다. 로컬 인증
guard에는 `x-dev-user-sub`, TOTP 설정 호출에는 직전에 받은 bearer access
token을 함께 전달한다. setup 응답의 secret을 인증 앱에 등록한 뒤 verify에
code `123456`을 보낸다.

```bash
curl -X POST http://localhost:3000/api/v1/auth/mfa/totp/setup \
  -H 'authorization: Bearer ACCESS_TOKEN' \
  -H 'x-dev-user-sub: local-admin-sub'

curl -X POST http://localhost:3000/api/v1/auth/mfa/totp/setup/verify \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer ACCESS_TOKEN' \
  -H 'x-dev-user-sub: local-admin-sub' \
  -d '{"code":"123456"}'
```

## 4. 검사와 Lambda 묶음 만들기

```bash
pnpm check
pnpm build:lambda
```

`pnpm check`는 포맷, lint, 타입, 단위 테스트, 일반 TypeScript 빌드를
차례로 검사한다. `pnpm build:lambda`는 다음 AWS 실행 파일을 만든다.

이때 타입 검사와 일반 빌드는 TypeScript 7.0.2 네이티브 컴파일러를
사용한다. `package.json`의 `typescript` 의존성은 아직 네이티브
compiler API를 읽지 못하는 ESLint 도구를 위한 TypeScript 6 호환층일
뿐이다. 자세한 배경과 폴더별 책임은
[프로젝트 폴더 구조](project-structure.md)를 참고한다.

- `apps/api/dist/lambda.js`: API Gateway가 호출하는 NestJS API
- `apps/worker/dist/job-starter.js`: SQS 메시지로 Step Functions를 시작
- `apps/worker/dist/foundation-task.js`: Job 상태 전이의 기초 작업
  트리거

## 로컬과 AWS의 대응 관계

| 로컬에서 실행하는 것 | AWS 운영 환경의 대응 서비스 |
| --- | --- |
| `pnpm ... api dev` Node.js 프로세스 | API Gateway가 호출하는 Lambda |
| Docker PostgreSQL | Aurora PostgreSQL Serverless v2 |
| fake Identity 인증 | Cognito User Pool |
| 비활성 Job·upload 호환 코드 | 이후 단계에서 S3·SQS에 다시 연결 |
| 터미널 로그 | CloudWatch Logs |

로컬에서 실제 이메일, SMS, AI, TTS 유료 API는 호출하지 않는다.

## AWS 연결을 시작할 때

코드 구현과 실제 계정 연결은 분리되어 있다. AWS 계정을 준비할 때는
[AWS 계정 준비 가이드](aws-account-setup.md)를 먼저 따라가고, 값 등록이
끝난 뒤 [AWS 배포와 복구 가이드](aws-deployment.md)로 최초 배포를
진행한다.
