# 프로젝트 폴더 구조 컨벤션

이 문서는 저장소의 최상위 폴더, workspace 책임, 코드 배치와 의존성
방향을 정의하는 **단일 기준 문서**다. `AGENTS.md`, `CLAUDE.md` 또는 다른
문서에 구조 규칙을 복제하지 않고 이 문서를 참조한다.

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
│   └── web/                    # Vite React 애플리케이션
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
  않는다.
- 생성 결과인 `dist`, `cdk.out`, `node_modules`에는 소스 코드를 두지
  않는다.

## workspace 책임

| workspace | 책임 |
| --- | --- |
| `backend/api` | Controller, Guard, Decorator, Nest Module과 HTTP 조립 |
| `backend/worker` | SQS·Step Functions 등 비동기 이벤트 진입점 |
| `backend/domain` | 프레임워크 독립 모델·업무 규칙·use case·port |
| `backend/database` | Drizzle schema·migration·repository·query |
| `backend/providers` | Cognito·S3·AI·queue·암호화·local fake adapter |
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
기능 이름을 사용한다.

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
  않는다. `shared/ui` primitives의 테스트·스토리 작성은
  `frontend/web/src/shared/ui/AGENTS.md`를 따른다.
- 한 workspace에서만 쓰는 설정과 helper는 해당 workspace 가까이에
  둔다.
- 책임이 드러나지 않는 root `utils`, `helpers`, `common-packages` 같은
  수집 폴더를 만들지 않는다.
- 새 최상위 영역이나 workspace가 필요하면 코드를 만들기 전에 이 문서의
  구조와 의존성 표를 먼저 갱신한다.
- `pnpm structure:check`가 실패하는 과거 폴더나 누락 workspace 상태를
  우회하지 않는다.

## 프론트엔드 내부 구조

`frontend/web`은 Vite + React 앱으로 구성하고
`app -> pages -> features -> shared` 방향으로 의존한다. 여기의
`frontend/web/src/shared`는 프론트엔드 내부 공용 코드이며, 최상위
`shared/contracts`와 역할이 다르다.

```text
frontend/web/src/
├── app/                       # 라우터·전역 provider·앱 레이아웃
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
│   ├── ui/                    # 공용 primitive만 배치
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
- `shared/ui`에는 공용 primitive만 둔다. 사이드바·Provider 조합만
  `app/layouts/SidebarLayout.tsx`에서 공유한다. 페이지 헤더·본문 너비·여백·
  카드 배치와 로딩·빈 결과·오류 안내는 각 페이지에서 직접 구성한다.
  앱의 세션·라우트 상태 안내도 해당 사용처에서 직접 구성한다.
  이를 위한 공용 PageState나 feedback 계층을 만들지 않는다.
  페이지 배치는 검토·수정 중이므로 사이드바 외에 레이아웃만을 위한 컴포넌트를 추출하지
  않는다. primitive와 페이지별 카드·기능 컴포넌트는 유지한다.
  페이지 JSX를 분리하도록 강제하는 파일·함수 줄 수 제한은 적용하지 않는다.
  기능·화면 전용 조합은 해당 slice의 `ui`에 두며 `shared/components`는
  만들지 않는다.
- Storybook은 `shared/ui`의 primitive만 수집한다.
- 다른 layer가 slice를 사용할 때만 slice root `index.ts`를 공개 API로
  두며, 소비자는 내부 segment를 우회하거나 재귀 barrel을 만들지 않는다.
- 프론트엔드 테스트는 대상 옆에 `*.test.ts` 또는 `*.test.tsx`로 두고,
  백엔드 테스트의 `*.spec.ts` 규칙은 유지한다.

### 프론트엔드 라우트 구조

- `app/routes`는 TanStack Router의 파일 기반 라우팅을 사용하며, 접근
  권한과 기능별 디렉터리로 계층을 표현한다. 여러 경로를 점으로 연결한
  긴 파일명은 사용하지 않는다.
- `_authenticated/route.tsx`에서 로그인 확인과 공통 사이드바를 제공하고, `_learner`에는 학습
  화면을, `admin`에는 관리자 화면을 둔다. `admin/_enrollment`는 TOTP 등록
  화면, `admin/_enrolled`는 TOTP 등록을 마친 관리자의 화면을 담당한다.
- 로그인 기본 홈은 역할과 무관하게 `/learn`이다. 학습 메뉴 아래에 관리자만
  운영자 메뉴를 별도 섹션으로 보며, `/admin` 하위에서는 추가 권한을 검사한다.
- 공통 접근 검사나 레이아웃은 `route.tsx`, 기본 화면은 `index.tsx`,
  동적 경로는 `$questionId` 같은 이름으로 표현한다. 공통 처리가 없는
  디렉터리에는 `route.tsx`를 만들지 않는다.
- 목록·상세·하위 작업은 기능별 폴더로 묶고, 단일 화면은 `users.tsx`처럼
  파일로 둔다. 화면 구현은 `pages`에 유지한다.
- 라우트 옆 테스트 파일은 `-route.test.ts`처럼 `-` 접두사를 붙여 라우트
  생성 대상에서 제외한다. `src/routeTree.gen.ts`는 자동 생성 결과다.
- 앱 내부 화면 이동에는 `@tanstack/react-router`의 `Link`를 사용한다.
  동적 경로는 `params`, 검색 조건은 `search`로 전달한다. 일반 `a`는
  외부 링크·다운로드·메일·전화·현재 문서 내 앵커 이동에 사용한다.

## 프론트엔드 UI 규칙

- 새 UI primitive는 shadcn 레지스트리를 먼저 확인하고, 생성물은 vendored
  코드로 취급해 직접 수정하지 않는다. 프로젝트 확장은 상위 컴포넌트로
  조합한다.
- 화면에서는 동일 primitive를 직접 반복 구현하지 않고 `shared/ui`의
  공개 컴포넌트를 사용한다.
- 색상과 반경은 `frontend/web/src/app/styles/theme.css`의 semantic token을
  참조하며 리터럴 색상을 추가하지 않는다.
- 직접 작성한 컴포넌트 파일은 `PascalCase.tsx`, hook과 로직 파일은
  `camelCase.ts`를 사용한다. 여러 파일을 공개하는 폴더에만 `index.ts`를
  둔다.
