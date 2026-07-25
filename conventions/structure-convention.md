# 프로젝트 폴더 구조 컨벤션

이 문서는 저장소의 최상위 폴더, workspace 책임, 코드 배치와 의존성
방향을 정의하는 **단일 기준 문서**다. `AGENTS.md`, `CLAUDE.md` 또는 다른
문서에 구조 규칙을 복제하지 않고 이 문서를 참조한다.

현재 폴더의 설명은
[프로젝트 폴더 구조](../docs/development/project-structure.md), 백엔드
기능 모듈의 세부 경계는
[백엔드 목표 아키텍처](../docs/development/backend-architecture.md)를
함께 참고한다. 내용이 충돌하면 코드 위치와 의존성 방향은 이 문서를
우선한다.

## 최상위 구조

```text
flex-thia/
├── backend/
│   ├── api/                    # NestJS HTTP 실행 프로그램
│   ├── worker/                 # 비동기 작업 실행 프로그램
│   ├── domain/                 # 프레임워크 독립 업무 규칙과 port
│   ├── database/               # Drizzle schema·migration·repository
│   ├── providers/              # AWS·암호화·local fake adapter
│   └── config/                 # 환경 변수 schema와 검증
├── frontend/
│   └── web/                    # Vite React 앱을 만들 때 생성
├── shared/
│   └── contracts/              # 프론트·백엔드가 공유하는 공개 API 계약
├── infra/                      # AWS CDK
├── docs/                       # 설계·계획·개발·운영 문서
└── conventions/                # 저장소 공통 작성 규칙
```

- 제품 영역을 먼저 찾을 수 있도록 백엔드는 `backend`, 프론트엔드는
  `frontend`, 양쪽의 공유 코드는 `shared`에 둔다.
- 과거 최상위 분류인 `apps`, `packages`는 다시 만들지 않는다.
- 실제 기능 없이 미래를 예상한 빈 workspace나 하위 폴더를 만들지
  않는다. 따라서 프론트엔드 구현 전에는 빈 `frontend/web` scaffold도
  만들지 않는다.
- 생성 결과인 `dist`, `cdk.out`, `node_modules`에는 소스 코드를 두지
  않는다.

## workspace 책임

| workspace | 책임 |
| --- | --- |
| `backend/api` | Controller, Guard, Decorator, Nest Module과 HTTP 조립 |
| `backend/worker` | SQS·Step Functions 등 비동기 이벤트 진입점 |
| `backend/domain` | 프레임워크 독립 모델·업무 규칙·use case·port |
| `backend/database` | Drizzle schema·migration·repository·query |
| `backend/providers` | Cognito·S3·AI·TTS·queue·암호화·local fake adapter |
| `backend/config` | 환경 변수 읽기와 런타임 설정 검증 |
| `frontend/web` | Vite React 애플리케이션 |
| `shared/contracts` | 공개 API 요청·응답 Zod schema와 공유 TypeScript 타입 |
| `infra` | AWS 리소스와 실행 프로그램의 배포 연결 |

한 곳에서만 쓰는 타입과 함수는 사용하는 workspace에 둔다. 둘 이상의
제품 영역이 실제로 공유하며 외부에 공개해도 안전한 계약만 `shared`로
옮긴다. 백엔드 내부 구현 편의를 위한 코드는 `shared`에 두지 않는다.

## 코드 배치 기준

| 코드의 책임 | 위치 |
| --- | --- |
| HTTP route와 인증 Guard | `backend/api/src/<기능>` |
| 비동기 이벤트 handler | `backend/worker/src/<기능>` |
| 상태 전이와 업무 규칙 | `backend/domain/src/<기능>` |
| DB schema·migration·repository | `backend/database` |
| 외부 서비스 adapter | `backend/providers/src/<능력>` |
| 환경 변수 schema | `backend/config/src` |
| 공개 요청·응답 계약 | `shared/contracts/src/<기능>` |
| 프론트엔드 기능과 화면 | `frontend/web/src` |
| AWS 리소스 | `infra/src` |
| 실행법·설계·운영 설명 | `docs` |

백엔드의 모든 workspace에서는 `identity`, `questions`, `learning`처럼 같은
기능 이름을 사용한다. 기능별 세부 책임과 목표 모듈 지도는
`docs/development/backend-architecture.md`를 따른다.

## 의존성 방향

```text
backend/api ───────┬──> shared/contracts
                   ├──> backend/domain
                   ├──> backend/database ──> backend/domain
                   ├──> backend/providers ─> backend/domain
                   └──> backend/config

backend/worker ────┬──> backend/domain
                   ├──> backend/database
                   ├──> backend/providers
                   └──> backend/config

frontend/web ──────────> shared/contracts
infra ─────────────────> backend 실행 산출물
```

- 다른 workspace의 코드는 상대 경로로 내부 파일을 참조하지 않고
  `@flex-thia/*` 공개 진입점으로 import한다.
- `backend/api`와 `backend/worker`는 서로의 `src`를 직접 import하지
  않는다.
- `backend/domain`은 NestJS, AWS SDK, Drizzle 같은 바깥 기술을 알지
  않는다.
- `shared/contracts`는 `backend`나 `frontend`에 의존하지 않는다.
- `frontend`는 `backend` 내부 workspace를 직접 import하지 않는다.
- `infra`에는 업무 규칙을 구현하지 않고 실행 환경과 권한 연결만 둔다.

## 공통 파일 배치

- 테스트는 대상 파일 옆에 `*.spec.ts`로 둔다. E2E 테스트 폴더는 만들지
  않는다.
- 한 workspace에서만 쓰는 설정과 helper는 해당 workspace 가까이에
  둔다.
- 책임이 드러나지 않는 root `utils`, `helpers`, `common-packages` 같은
  수집 폴더를 만들지 않는다.
- 새 최상위 영역이나 workspace가 필요하면 코드를 만들기 전에 이 문서의
  구조와 의존성 표를 먼저 갱신한다.
- `pnpm structure:check`가 실패하는 과거 폴더나 누락 workspace 상태를
  우회하지 않는다.

## 프론트엔드 내부 구조

`frontend/web`을 만들 때는 Vite + React 앱으로 구성하고
`app -> pages -> features -> shared` 방향으로 의존한다. 여기의
`frontend/web/src/shared`는 프론트엔드 내부 공용 코드이며, 최상위
`shared/contracts`와 역할이 다르다.

```text
frontend/web/src/
├── app/                       # 라우터·전역 provider
├── pages/{slice}/             # 라우트 단위 화면과 화면 전용 서버 상태
│   ├── ui/
│   ├── api/
│   ├── model/
│   └── lib/
├── features/{slice}/          # 재사용되는 사용자 행동과 그 상태
│   ├── ui/
│   ├── api/
│   ├── model/
│   └── lib/
├── shared/
│   ├── ui/
│   ├── api/
│   ├── model/
│   ├── lib/
│   └── test/
└── main.tsx
```

- 의존성은 `app -> pages -> features -> shared` 방향으로만 흐르며 같은
  layer의 다른 slice를 직접 import하지 않는다.
- 빈 `ui`, `api`, `model`, `lib` 폴더는 미리 만들지 않는다.
- 한 화면에서만 쓰는 조회·필터·조립 코드는 해당 `pages/{slice}`에
  유지하고, 둘 이상의 화면에서 재사용되는 사용자 행동만
  `features/{slice}`로 분리한다.
- 도메인 규칙을 몰라도 이해할 수 있고 여러 기능이 실제로 사용할 때만
  프론트엔드 내부 `shared`로 옮긴다.
- 공용 UI는 `shared/ui`에 두며 `shared/components`는 만들지 않는다.
- 다른 layer가 slice를 사용할 때만 slice root `index.ts`를 공개 API로
  두며, 소비자는 내부 segment를 우회하거나 재귀 barrel을 만들지 않는다.
- 프론트엔드 테스트는 대상 옆에 `*.test.ts` 또는 `*.test.tsx`로 두고,
  백엔드 테스트의 `*.spec.ts` 규칙은 유지한다.

주석 규칙은 [comment-convention.md](comment-convention.md), 프론트엔드
컴포넌트 규칙은
[component-convention.md](frontend/component-convention.md)를 따른다.
