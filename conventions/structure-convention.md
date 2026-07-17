# 폴더 구조 컨벤션

이 문서는 새 코드를 어디에 둘지 판단하는 규칙만 설명한다. 현재 폴더의
전체 모습과 각 폴더의 자세한 설명은
[프로젝트 폴더 구조](../docs/development/project-structure.md)를 참고한다.

## 기본 원칙

- 실행 프로그램은 `apps`, 재사용 코드는 `packages`, AWS 리소스 정의는
  `infra`에 둔다.
- 파일은 실제로 필요할 때 만든다. 미래에 쓸 것 같은 빈 폴더나 공통
  추상화를 미리 만들지 않는다.
- `apps/api`와 `apps/worker`는 서로의 `src`를 직접 import하지 않는다.
- 다른 workspace의 코드는 `@flex-thia/*` 공개 진입점으로 import한다.
- 테스트는 대상 파일 옆에 `*.spec.ts`로 둔다. E2E 테스트 폴더는 만들지
  않는다.
- 생성 결과인 `dist`, `cdk.out`, `node_modules`에는 소스 코드를 두지
  않는다.
- 루트의 빈 `backend`, `frontend`는 초기 저장소의 자리 표시자다. 새
  코드는 그 안에 두지 않는다.

## 코드 배치 기준

| 코드의 책임 | 위치 |
| --- | --- |
| 프레임워크와 무관한 업무 규칙·포트 | `packages/domain` |
| HTTP 요청·응답 Zod 스키마 | `packages/contracts` |
| 환경 변수 읽기와 검증 | `packages/config` |
| DB 스키마·migration·repository | `packages/database` |
| AWS SDK·암호화·로컬 fake 구현 | `packages/providers` |
| HTTP 요청을 받는 NestJS 코드 | `apps/api` |
| SQS·Step Functions·Cognito가 호출하는 함수 | `apps/worker` |
| AWS 리소스를 만드는 CDK 코드 | `infra` |
| 실행법·설계·운영 설명 | `docs` |

한 곳에서만 쓰는 타입과 함수는 사용하는 모듈에 둔다. 둘 이상의
workspace가 실제로 공유할 때만 알맞은 `packages/*`로 옮긴다.

## 의존 방향

```text
apps/api ─────┐
apps/worker ──┼──> packages/*
infra ────────┘

packages/database ──> packages/domain
packages/providers ─> packages/domain
```

- `packages/*`는 `apps/*`에 의존하지 않는다.
- `packages/domain`은 NestJS, AWS SDK, Drizzle 같은 바깥 기술을 알지
  않는다.
- `infra`에는 업무 규칙을 구현하지 않는다. 어떤 AWS 컴퓨터와 서비스를
  어떻게 연결할지만 선언한다.

## 프론트엔드 추가 시

아직 `apps/web`은 만들어지지 않았다. 만들 때는 Vite + React 앱으로
구성하고 `app -> pages -> features -> shared` 방향으로 의존한다.

```text
apps/web/src/
├── app/                       # 라우터·전역 provider
├── pages/{domain}/            # 라우트 단위 화면
├── features/{domain}/
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── utils/
├── shared/
│   ├── ui/
│   ├── api/
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   └── test/
└── main.tsx
```

- 빈 `components`, `hooks`, `types`, `utils` 폴더는 미리 만들지 않는다.
- 한 기능에서만 쓰는 코드는 해당 `features/{domain}`에 유지한다.
- 도메인 규칙을 몰라도 이해할 수 있고 여러 기능이 실제로 사용할 때만
  `shared`로 옮긴다.
- 공용 UI는 `shared/ui`에 두며 `shared/components`는 만들지 않는다.

주석 규칙은 [comment-convention.md](comment-convention.md), 프론트엔드
컴포넌트 규칙은
[component-convention.md](frontend/component-convention.md)를 따른다.
