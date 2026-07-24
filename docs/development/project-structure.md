# FLEX THIA 프로젝트 폴더 구조

이 문서는 저장소를 처음 보는 개발자가 코드를 찾을 수 있도록 현재
구조를 설명한다. 코드 위치와 의존성 방향의 단일 규칙은
[프로젝트 폴더 구조 컨벤션](../../conventions/structure-convention.md)이며,
백엔드 기능 모듈의 목표 구조는
[백엔드 목표 아키텍처](backend-architecture.md)를 따른다.

## 전체 구조

```text
flex-thia/
├── backend/
│   ├── api/                    # NestJS HTTP 서버
│   ├── worker/                 # 비동기 작업 실행 함수
│   ├── domain/                 # 핵심 업무 규칙과 port
│   ├── database/               # PostgreSQL·Drizzle 구현
│   ├── providers/              # AWS·암호화·local fake adapter
│   └── config/                 # 환경 변수 읽기와 검증
├── frontend/                   # 프론트엔드 제품 영역
├── shared/
│   └── contracts/              # 프론트·백엔드의 공개 API 계약
├── infra/                      # AWS CDK
├── docs/                       # 설계·계획·개발·운영 설명
├── conventions/                # 코드와 구조 규칙
├── scripts/                    # 저장소 수준 검사 도구
├── compose.yaml                # 로컬 PostgreSQL 실행 설정
├── package.json                # 저장소 전체 명령
├── pnpm-workspace.yaml         # workspace 검색 범위
└── tsconfig.base.json          # 공통 TypeScript 설정
```

최상위는 기술 종류보다 제품 영역을 먼저 보여준다. 백엔드 작업은
`backend`, 프론트엔드 작업은 `frontend`, 양쪽이 공유할 수 있는 공개
계약은 `shared`에서 찾는다. 과거의 `apps`, `packages` 폴더는 사용하지
않으며 `pnpm structure:check`가 다시 생성된 과거 경로와 필수 workspace
누락을 검사한다.

## `backend`: 백엔드 제품 영역

### `backend/api`

브라우저의 HTTP 요청을 받는 NestJS 애플리케이션이다.

```text
backend/api/src/
├── identity/                   # 로그인·TOTP·refresh 경계와 guard
├── auth/                       # 비활성 Job 호환용 require-step-up 코드
├── commands/                   # 일회성 관리 명령
├── common/                     # 요청 사용자·오류·로그
├── health/                     # /health, /ready
├── jobs/                       # 다음 단계용 코드, 현재 HTTP 비활성
├── uploads/                    # 다음 단계용 코드, 현재 HTTP 비활성
├── app.module.ts               # 기능 모듈 조립
├── app.setup.ts                # api/v1 prefix와 공통 실행 설정
├── main.ts                     # 로컬 실행 진입점
└── lambda.ts                   # API Lambda 진입점
```

Controller와 guard는 HTTP 입력·출력과 요청 문맥에 집중한다. 업무 규칙,
SQL, 외부 SDK 세부 동작은 다른 backend workspace에 둔다. 현재 root
애플리케이션에는 Identity와 health/readiness만 연결되어 있다.

### `backend/worker`

SQS와 Step Functions 같은 비동기 이벤트를 받아 도메인 유스케이스를
호출한다.

```text
backend/worker/src/
├── database-runtime.ts         # worker DB 연결
├── job-starter.ts              # SQS에서 workflow 시작
└── foundation-task.ts          # 기초 Job 상태 전이
```

### `backend/domain`

프레임워크와 외부 기술을 모르는 모델, 업무 규칙, use case, repository와
provider port를 둔다. NestJS, Drizzle, AWS SDK에 의존하지 않으므로 핵심
규칙을 외부 서비스 없이 단위 테스트할 수 있다.

### `backend/database`

```text
backend/database/
├── drizzle/                    # 실제 DB에 적용할 migration SQL
└── src/
    ├── clients/                # PostgreSQL·Data API 연결
    ├── repositories/           # domain port의 저장 구현
    └── schema/                 # Drizzle 테이블 구조
```

DB row와 SQL 세부사항을 domain이나 API로 새어 나가지 않게 한다.

### `backend/providers`

```text
backend/providers/src/
├── identity/                   # Cognito·local fake 인증
├── aws/                        # 기존 AWS adapter
├── crypto/                     # token·code 암호화
└── fakes/                      # 로컬·단위 테스트 구현
```

DB가 아닌 외부 기술을 domain port에 연결한다. 새 adapter는 AWS라는
이유보다 `identity`, `storage`, `ai`, `tts` 같은 능력을 기준으로 찾을 수
있게 둔다.

### `backend/config`

환경 변수를 읽고 필수 값과 허용 형식을 검증한다. 여러 애플리케이션이
각자 `process.env`를 해석하지 않도록 런타임 설정 경계를 제공한다.

## `frontend`: 프론트엔드 제품 영역

아직 프론트엔드 애플리케이션은 생성되지 않았다. 구현을 시작할 때
`frontend/web`에 Vite + React 앱을 만들며 빈 scaffold는 미리 만들지
않는다.

프론트엔드 내부의 `src/shared`는 UI와 hook 같은 웹 내부 공용 코드다.
최상위 `shared`와 다른 경계이며 자세한 배치는
[프론트엔드 컴포넌트 컨벤션](../../conventions/frontend/component-convention.md)을
따른다.

## `shared`: 제품 영역 간 공개 코드

### `shared/contracts`

API 요청·응답 JSON을 Zod schema와 TypeScript 타입으로 정의한다.
백엔드는 요청 검증과 응답 직렬화에 사용하고, 프론트엔드는 같은 공개
계약을 사용한다.

`shared/contracts`에는 DB row, domain 내부 모델, 비밀번호, token처럼
외부에 공개하면 안 되는 구현 정보를 넣지 않는다. 또한 `backend`나
`frontend`에 의존하지 않는다.

## `infra`: AWS 실행 환경

```text
infra/
├── assets/                     # S3에 배포할 정적 파일
├── src/
│   ├── constructs/             # 공통 AWS 리소스 묶음
│   ├── app.ts                  # CDK 진입점
│   ├── data-stack.ts           # Aurora·S3·Secret
│   ├── application-stack.ts    # Cognito·Lambda·SQS·API
│   └── edge-stack.ts           # CloudFront·도메인·인증서
└── test/                       # CDK 단위 테스트
```

`infra`는 `backend` 실행 파일을 AWS 리소스와 연결하지만 업무 규칙은
소유하지 않는다. `pnpm infra:synth`는 CloudFormation 설계도를 만들 뿐
실제 AWS에 배포하지 않는다.

## 코드가 흐르는 방향

```text
브라우저
   ├──────────────> frontend/web
   │                      │
   │ HTTP                 └──> shared/contracts
   ▼
backend/api ───────┬──> shared/contracts
                   ├──> backend/domain
                   ├──> backend/database ──> backend/domain
                   ├──> backend/providers ─> backend/domain
                   └──> backend/config

AWS 이벤트 ──> backend/worker ──> 같은 backend workspace
```

애플리케이션 코드는 다른 workspace의 내부 파일을 상대 경로로 참조하지
않고 `@flex-thia/*` 공개 진입점으로 import한다.

## 새 코드는 어디에 둘까?

| 만들려는 코드 | 위치 |
| --- | --- |
| 로그인·TOTP HTTP route | `backend/api/src/identity` |
| 비동기 Lambda handler | `backend/worker/src/<기능>` |
| 상태 전이와 업무 규칙 | `backend/domain/src/<기능>` |
| 새 PostgreSQL 테이블 | `backend/database/src/schema` |
| repository 구현 | `backend/database/src/repositories` |
| Cognito·S3·AI adapter | `backend/providers/src/<능력>` |
| 환경 변수 schema | `backend/config/src` |
| 공개 요청·응답 schema | `shared/contracts/src/<기능>` |
| 프론트엔드 기능 | `frontend/web/src/features/<기능>` |
| 새 AWS 리소스 | `infra/src` 또는 `infra/src/constructs` |
| 실행·설계 설명 | `docs` |

한 곳에서만 쓰는 코드는 사용하는 기능 가까이에 둔다. 재사용 가능성만
예상해 `shared`나 공용 폴더로 미리 옮기지 않는다.

## 검사와 생성 폴더

- `pnpm structure:check`: 승인된 top-level workspace 구조 검사
- `pnpm lint`: TypeScript와 JavaScript 정적 검사
- `pnpm typecheck`: 전체 workspace 타입 검사
- `pnpm test`: Lambda bundle과 단위 테스트
- `pnpm build`: 전체 workspace TypeScript build

`node_modules`, `dist`, `infra/cdk.out`, `.pnpm-store`는 명령으로 다시
생성되는 결과다. 직접 수정하거나 새 소스의 원본으로 사용하지 않는다.
