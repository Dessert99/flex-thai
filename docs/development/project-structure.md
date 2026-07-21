# FLEX THIA 프로젝트 폴더 구조

이 문서는 인프라나 백엔드 구조가 익숙하지 않은 개발자가 “이 코드는
어디에 있고, 새 코드는 어디에 만들어야 하는가?”를 판단할 수 있도록
현재 저장소를 설명한다.

## 먼저 보는 전체 구조

```text
flex-thia/
├── .github/workflows/          # 코드 검사와 수동 production 배포 절차
├── apps/
│   ├── api/                    # HTTP 요청을 처리하는 NestJS 프로그램
│   └── worker/                 # AWS 이벤트가 호출하는 백그라운드 함수
├── packages/
│   ├── config/                 # 환경 변수 읽기와 검증
│   ├── contracts/              # HTTP 요청·응답 형식
│   ├── domain/                 # 서비스의 핵심 업무 규칙
│   ├── database/               # PostgreSQL 테이블과 데이터 접근
│   └── providers/              # AWS·암호화·로컬 fake 구현
├── infra/                      # AWS 리소스를 만드는 CDK 코드
├── docs/                       # 설계·구현 계획·개발 및 운영 설명
├── conventions/                # 코드를 작성할 때 지킬 규칙
├── docker-compose.yml          # 로컬 PostgreSQL 실행 설정
├── package.json                # 저장소 전체 명령과 공통 개발 도구
├── pnpm-workspace.yaml         # 하나로 관리할 workspace 목록
└── tsconfig.base.json          # 모든 TypeScript 코드의 공통 설정
```

`apps`의 각 폴더는 직접 실행되는 프로그램이다. `packages`는 그
프로그램들이 조립해서 쓰는 부품이며, 혼자 서버처럼 실행되지 않는다.
`infra`는 프로그램이 아니라 AWS에 필요한 서버와 관리형 서비스를
생성하는 설계도다.

`.github/workflows`는 GitHub 컴퓨터가 저장소 검사와 AWS 배포 순서를
실행하게 하는 절차다. 실제 production 배포는 자동으로 시작되지 않으며,
GitHub의 수동 실행과 `production` 환경 승인을 모두 거쳐야 한다.

## `apps`: 실제로 실행되는 프로그램

### `apps/api`

브라우저가 보낸 HTTP 요청을 받는 NestJS API다.

```text
apps/api/src/
├── auth/                       # 로그인과 관리자 추가 인증
├── commands/                   # 터미널에서 한 번 실행하는 관리 명령
├── common/
│   ├── auth/                   # 인증 guard와 요청 사용자 정보
│   ├── errors/                 # 공통 오류 응답
│   └── logging/                # 구조화 로그
├── health/                     # /health, /ready 확인
├── jobs/                       # AI 작업 생성·조회
├── uploads/                    # 파일 업로드 URL 발급
├── app.module.ts               # API 모듈을 한곳에 조립
├── app.setup.ts                # 필터·로그 등 공통 실행 설정
├── main.ts                     # 로컬 Node.js 실행 진입점
├── lambda.ts                   # AWS Lambda 실행 진입점
└── runtime-config.ts           # AWS Secret을 실행 시점에 읽는 설정
```

컨트롤러는 HTTP 입력을 받고 응답을 돌려주는 역할에 집중한다. 업무
규칙과 저장 방식은 아래 `packages`의 부품을 주입받아 사용한다. 따라서
API가 AWS SDK나 SQL을 직접 여기저기 호출하지 않는다.

### `apps/worker`

사람의 HTTP 요청을 기다리지 않고 AWS가 보낸 이벤트를 처리한다.

```text
apps/worker/src/
├── database-runtime.ts         # worker용 DB 연결
├── job-starter.ts              # SQS 메시지로 Step Functions 시작
└── foundation-task.ts          # 작업 상태 전이의 기초 함수
```

예를 들어 API가 “문항 생성 작업”을 큐에 넣으면 `job-starter`가 이를
받는다. 이 구조 덕분에 오래 걸리는 AI 작업 동안 HTTP 요청을 계속
붙잡아 두지 않아도 된다.

## `packages`: 실행 프로그램이 공유하는 부품

### `packages/domain`

FLEX THIA의 핵심 규칙을 둔다. 사용자 권한, 태국어 콘텐츠, 업로드, 작업
상태 같은 개념과 포트가 여기 속한다.

포트는 “사용자를 저장할 수 있어야 한다”처럼 필요한 기능의 모양만
정의한 인터페이스다. PostgreSQL이나 S3를 어떻게 호출하는지는 알지
않는다. 그래서 핵심 규칙을 AWS 없이도 빠르게 테스트할 수 있다.

### `packages/contracts`

API가 받거나 돌려줄 JSON의 모양을 Zod 스키마와 TypeScript 타입으로
정의한다. 브라우저와 API가 같은 계약을 보게 하는 경계다.

### `packages/config`

환경 변수를 읽고 필수 값과 허용 형식을 검사한다. 설정값을 아무
파일에서나 `process.env`로 직접 읽는 일을 줄인다.

### `packages/database`

```text
packages/database/
├── drizzle/                    # 실제 DB에 적용할 migration SQL
└── src/
    ├── clients/                # PostgreSQL 연결
    ├── repositories/           # domain 포트의 DB 구현
    └── schema/                 # 테이블 구조
```

Drizzle 스키마는 TypeScript로 표현한 테이블 설계이고, migration은 그
설계를 실제 PostgreSQL에 적용하는 변경 기록이다. repository는 업무
코드가 SQL 세부사항을 몰라도 데이터를 읽고 쓸 수 있게 연결한다.

### `packages/providers`

```text
packages/providers/src/
├── aws/                        # Cognito·S3·SQS·SNS 실제 구현
├── crypto/                     # code·토큰 해시 등 암호화 구현
└── fakes/                      # 로컬 개발과 단위 테스트용 메모리 구현
```

domain이 정의한 포트를 외부 기술로 구현하는 곳이다. 운영에서는 `aws`
구현을, 로컬과 테스트에서는 비용 없는 `fakes` 구현을 선택한다.

## `infra`: AWS 설계도

```text
infra/
├── assets/                     # S3에 배포할 최소 정적 파일
├── src/
│   ├── constructs/             # 여러 Stack에서 조립하는 AWS 리소스 묶음
│   ├── app.ts                  # CDK 실행 진입점
│   ├── config.ts               # 배포 환경 설정
│   ├── data-stack.ts           # Aurora·S3·Secret
│   ├── application-stack.ts    # Cognito·Lambda·SQS·Step Functions·API
│   └── edge-stack.ts           # CloudFront·도메인·인증서
└── test/                       # CDK 설계가 의도한 리소스를 만드는지 검사
```

CDK 코드는 AWS 서비스에 보낼 CloudFormation 설계도를 TypeScript로
작성한 것이다. `pnpm infra:synth`는 설계도를 만들 뿐 실제 AWS를
변경하지 않는다. 실제 AWS 계정에 생성하는 일은 별도의 배포 명령과
승인이 필요하다.

업무 규칙은 `infra`에 넣지 않는다. 이곳은 어떤 Lambda가 어떤 큐를
읽고, 어떤 bucket에 접근할 수 있는지처럼 실행 환경과 연결만
정의한다.

## `docs`와 `conventions`

- `docs/development`: 개발 환경, 배포, 폴더 구조처럼 계속 참고할 설명
- `docs/superpowers/specs`: 무엇을 왜 만들지 합의한 설계
- `docs/superpowers/plans`: 합의한 설계를 어떤 순서로 구현할지 적은 계획
- `conventions`: 새 코드의 위치, 컴포넌트, 주석 작성 규칙

설계 문서는 의사결정의 배경이고, 실제 구현 상태는 현재 코드와 테스트가
기준이다. 계획에 적혀 있어도 코드에 없으면 아직 구현되지 않은 것이다.

## 코드가 흐르는 방향

```text
브라우저
   │ HTTP
   ▼
apps/api ──> packages/domain
   │               ▲
   ├──> packages/database
   └──> packages/providers ──> AWS 서비스

SQS·Cognito·Step Functions
   │ 이벤트
   ▼
apps/worker ──> 같은 packages 부품
```

가장 중요한 규칙은 안쪽의 업무 규칙이 바깥 기술을 직접 알지 않는
것이다. `packages/domain`이 “S3”가 아니라 “파일 저장소”를 요구하면,
로컬 fake에서 AWS S3로 바꾸어도 핵심 규칙은 그대로 유지된다.

## 새 코드는 어디에 둘까?

| 만들려는 코드 | 위치 |
| --- | --- |
| 로그인 HTTP 주소 | `apps/api/src/auth` |
| 오래 걸리는 AI 작업의 Lambda 진입점 | `apps/worker/src` |
| 작업 상태가 바뀌는 업무 규칙 | `packages/domain/src/jobs` |
| 새 HTTP 요청 스키마 | `packages/contracts/src` |
| 새 PostgreSQL 테이블 | `packages/database/src/schema` |
| 그 테이블을 읽고 쓰는 구현 | `packages/database/src/repositories` |
| 새 AWS SDK adapter | `packages/providers/src/aws` |
| 로컬 테스트용 adapter | `packages/providers/src/fakes` |
| 새 AWS 리소스 | `infra/src` 또는 `infra/src/constructs` |
| 실행 방법 | `docs/development` |

코드가 한 곳에서만 쓰인다면 사용하는 모듈 가까이에 둔다. 두 곳에서 쓸
것 같다는 예상만으로 공용 package에 먼저 옮기지 않는다.

## 아직 없는 프론트엔드

`apps/web`은 아직 생성되지 않았다. 만들 때는 Vite + React 앱으로
추가하며, 상세한 배치 규칙은
[폴더 구조 컨벤션](../../conventions/structure-convention.md)을 따른다.
루트의 빈 `frontend` 폴더는 프론트엔드 소스 위치가 아니다.

## TypeScript 7 사용 방식

이 저장소에서 애플리케이션과 인프라를 검사하고 빌드하는 `tsc`는
TypeScript 7.0.2 네이티브 컴파일러다.

```bash
pnpm exec tsc --version
pnpm typecheck
pnpm build
```

TypeScript 7은 기존 JavaScript 기반 compiler API를 제공하지 않는다.
그래서 `package.json`의 이름이 `typescript`인 의존성은
typescript-eslint 같은 개발 도구를 위한 공식 TypeScript 6 호환
package다. 프로젝트 빌드가 TypeScript 6이라는 뜻이 아니다.

- `@typescript/native`: 프로젝트 검사·빌드에 쓰는 TypeScript 7
- `typescript`: ESLint 도구가 읽는 TypeScript 6 API 호환층

새 workspace도 루트의 `tsconfig.base.json`을 상속하고 자체
`typecheck`, `build` 명령에서 `tsc`를 사용해야 한다.

## 소스가 아닌 폴더

- `node_modules`: pnpm이 설치한 외부 라이브러리
- `dist`: TypeScript 빌드 결과
- `infra/cdk.out`: CDK가 생성한 CloudFormation 결과
- `.pnpm-store`: 내려받은 package 저장 공간

이 폴더들은 명령을 다시 실행하면 생성된다. 직접 고치거나 새 소스의
원본으로 사용하지 않는다.

루트의 빈 `backend`, `frontend`는 초기 자리 표시자이므로 새 코드를
넣지 않는다. 삭제 여부는 별도 정리 작업에서 결정한다.
