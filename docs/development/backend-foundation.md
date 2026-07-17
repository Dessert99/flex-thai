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

로컬에서는 Cognito, S3, SQS, SNS 대신 비용이 들지 않는 fake adapter를
사용한다. 데이터 저장소만 Docker PostgreSQL을 사용하므로 테이블 구조와
소유권 규칙은 운영 환경과 같은 방식으로 확인할 수 있다.

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

## 3. 로컬 사용자와 관리자 만들기

로컬 fake 인증은 `.env.example`의 학교 이메일과 고정 개발 code를
사용한다.

```bash
curl -X POST http://localhost:3000/auth/challenges \
  -H 'content-type: application/json' \
  -d '{"email":"admin@school.ac.kr"}'
```

응답의 `challengeId`를 아래 주소에 넣고 code `123456`을 보낸다. 이
과정에서 `local-admin-sub` 사용자가 DB에 처음 생성된다.

```bash
curl -X POST http://localhost:3000/auth/challenges/CHALLENGE_ID/code \
  -H 'content-type: application/json' \
  -d '{"code":"123456"}'
```

최초 한 번만 해당 Cognito `sub`를 관리자로 승격한다. 이메일의 `+tag`나
도메인으로 관리자를 추론하지 않고, 변경되지 않는 `sub`를 정확히
지정한다.

```bash
pnpm --filter @flex-thia/api bootstrap-admin --sub=local-admin-sub
```

보호 API를 로컬에서 호출할 때는 access token 대신 다음 개발 전용
헤더를 사용한다.

```text
x-dev-user-sub: local-admin-sub
```

관리자 step-up의 로컬 OTP는 `123456`이다. 운영에서는 이 값이 고정되지
않고 SNS가 Cognito에서 검증된 전화번호로 무작위 OTP를 보낸다.

## 4. 검사와 Lambda 묶음 만들기

```bash
pnpm check
pnpm build:lambda
```

`pnpm check`는 포맷, lint, 타입, 단위 테스트, 일반 TypeScript 빌드를
차례로 검사한다. `pnpm build:lambda`는 다음 AWS 실행 파일을 만든다.

- `apps/api/dist/lambda.js`: API Gateway가 호출하는 NestJS API
- `apps/worker/dist/job-starter.js`: SQS 메시지로 Step Functions를 시작
- `apps/worker/dist/foundation-task.js`: Job 상태 전이의 기초 작업
- `apps/worker/dist/*-auth-challenge.js`: Cognito passwordless 인증
  트리거

## 로컬과 AWS의 대응 관계

| 로컬에서 실행하는 것 | AWS 운영 환경의 대응 서비스 |
| --- | --- |
| `pnpm ... api dev` Node.js 프로세스 | API Gateway가 호출하는 Lambda |
| Docker PostgreSQL | Aurora PostgreSQL Serverless v2 |
| fake identity/phone | Cognito와 SNS |
| fake upload storage | private Input S3 |
| fake job queue | SQS와 DLQ |
| 터미널 로그 | CloudWatch Logs |

로컬에서 실제 이메일, SMS, AI, TTS 유료 API는 호출하지 않는다.
