# 저장소 최상위 폴더 재구성 설계

- 상태: 구현 완료
- 날짜: 2026-07-23
- 범위: 애플리케이션·공유 코드의 물리 경로와 이를 참조하는 설정·문서

## 1. 목적

현재 저장소는 실행 프로그램을 `apps`, 재사용 코드를 `packages`로 먼저
구분한다. 이 방식에서는 백엔드 범위를 이해하려면 `apps/api`,
`apps/worker`, 여러 `packages/*`를 조합해서 봐야 한다.

최상위에서 제품 영역을 바로 찾을 수 있도록 백엔드 코드는 `backend`,
프론트엔드 코드는 `frontend`, 양쪽이 공유하는 코드는 `shared`에 둔다.
기존 workspace와 패키지 공개 경계는 유지하고 물리 경로만 재구성한다.

## 2. 결정한 구조

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

아직 프론트엔드 애플리케이션이 없으므로 `frontend/web`의 빈 scaffold는
이번 작업에서 만들지 않는다. `apps`와 `packages`는 모든 내용을 옮긴 뒤
남기지 않는다.

## 3. 검토한 대안

### 3.1 선택: 제품 영역을 우선하는 얕은 구조

`backend/api`, `backend/domain`, `shared/contracts`처럼 최상위 영역 바로
아래에 workspace를 둔다. 경로가 짧고 저장소를 처음 보는 사람도 코드
소유 영역을 바로 판단할 수 있다.

### 3.2 제외: `backend/apps`, `backend/packages` 중첩

현재 분류를 보존하므로 이동 의미는 분명하지만 `backend/packages/domain`
같은 불필요한 중간 계층이 생긴다. 제품 영역을 먼저 보이게 하려는 목적에
비해 탐색 깊이가 늘어난다.

### 3.3 제외: 현재 `apps`·`packages` 유지

설정 변경은 가장 적지만 백엔드 범위가 여러 최상위 폴더에 흩어진다는
문제를 해결하지 못한다.

## 4. workspace와 공개 경계

물리 경로가 바뀌어도 패키지 이름과 코드 import는 유지한다.

| 새 경로 | package 이름 |
| --- | --- |
| `backend/api` | `@flex-thia/api` |
| `backend/worker` | `@flex-thia/worker` |
| `backend/domain` | `@flex-thia/domain` |
| `backend/database` | `@flex-thia/database` |
| `backend/providers` | `@flex-thia/providers` |
| `backend/config` | `@flex-thia/config` |
| `shared/contracts` | `@flex-thia/contracts` |

`pnpm-workspace.yaml`은 `backend/*`, `frontend/*`, `shared/*`, `infra`를
workspace로 찾는다. 현재 프론트엔드 workspace가 없어도 향후
`frontend/web`을 별도 설정 변경 없이 추가할 수 있다.

TypeScript alias는 새 경로를 가리키고, 애플리케이션 코드는 계속
`@flex-thia/*` 공개 진입점으로 import한다. 패키지 사이의 상대 경로
import를 새로 만들지 않는다.

## 5. 의존성 규칙

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

- `shared/contracts`는 `backend`나 `frontend`에 의존하지 않는다.
- `backend/domain`은 NestJS, Drizzle, AWS SDK에 의존하지 않는다.
- `backend/api`와 `backend/worker`는 서로의 내부 `src`를 참조하지 않는다.
- `frontend`는 `backend` 내부 package를 직접 import하지 않고 공개 계약만
  `shared/contracts`에서 사용한다.
- `infra`는 애플리케이션 소스와 빌드 산출물의 새 경로만 참조하며 업무
  규칙을 소유하지 않는다.

## 6. 구조 규칙의 단일 원본

`conventions/structure-convention.md`를 저장소 폴더 구조와 코드 배치 규칙의
단일 원본으로 사용한다. 이 문서에 다음을 명시한다.

- 허용된 최상위 소스 영역
- 각 workspace의 책임
- 코드 배치표
- 의존성 방향
- 새 workspace를 추가하는 기준
- 금지하는 과거 경로 `apps/*`, `packages/*`

`AGENTS.md`와 `CLAUDE.md`에는 경로 목록과 배치 규칙을 복제하지 않는다.
두 문서는 `conventions/structure-convention.md`를 먼저 읽고 따르도록
참조만 둔다.

`docs/development/project-structure.md`는 신규 참여자를 위한 설명 문서로
유지하지만, 규칙이 충돌할 때는 convention 문서가 우선한다고 명시한다.
백엔드의 기능 모듈과 계층 책임은
`docs/development/backend-architecture.md`가 보충한다.

## 7. 이동과 설정 변경

다음 이동은 Git rename으로 추적한다.

| 기존 경로 | 새 경로 |
| --- | --- |
| `apps/api` | `backend/api` |
| `apps/worker` | `backend/worker` |
| `packages/domain` | `backend/domain` |
| `packages/database` | `backend/database` |
| `packages/providers` | `backend/providers` |
| `packages/config` | `backend/config` |
| `packages/contracts` | `shared/contracts` |

경로를 직접 참조하는 다음 설정을 함께 갱신한다.

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml` importer 경로
- `tsconfig.base.json` path alias
- `vitest.config.ts` 테스트 검색 범위
- `eslint.config.mjs` migration 제외 경로
- CDK의 API·worker source와 build asset 경로
- GitHub workflow와 root script에 존재하는 명시적 경로

각 workspace 내부 상대 경로, package 이름, 데이터베이스 migration 내용,
런타임 API 계약은 변경하지 않는다.

## 8. 문서 갱신 범위

현재 개발 문서뿐 아니라 기존 설계·구현 계획·troubleshooting 문서의
경로와 Markdown 링크도 새 위치로 갱신한다. 문서의 과거 의사결정과 구현
순서는 바꾸지 않고 파일 위치만 현재 구조에 맞춘다.

사용자가 포함을 승인한 기존 미추적 문서도 경로를 갱신한 뒤 이번 작업
범위로 Git에 추가한다.

- `docs/development/backend-architecture.md`
- `docs/superpowers/plans/2026-07-23-backend-mvp-roadmap.md`
- `docs/superpowers/plans/2026-07-23-identity-auth-mvp.md`
- `docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`

## 9. 검증

다음 조건을 모두 확인한다.

1. `rg`로 소스·설정·문서에 과거 활성 경로가 남지 않는다.
2. pnpm이 모든 이동된 workspace를 인식한다.
3. TypeScript path alias와 package import가 해석된다.
4. API·worker Lambda build가 새 위치에서 성공한다.
5. CDK 테스트가 새 source·asset 경로를 사용한다.
6. lint, typecheck, 단위 테스트, workspace build가 통과한다.
7. `git diff --check`에 whitespace 오류가 없다.
8. 기존 기능 코드와 migration의 의미 변경이 없다.

기존 `.agents/skills/claude-review/agents/openai.yaml`의 범위 밖 Prettier
오류는 구조 변경 커밋에 포함하지 않는다. 전체 `pnpm check`가 이 파일에서
중단되면 나머지 검증 명령을 각각 실행하고 그 사실을 명시한다.

## 10. 커밋 경계

- 새 브랜치와 PR을 만들지 않는다.
- 사용자가 포함을 승인한 기존 문서와 구조 변경에 직접 필요한 파일만
  stage한다.
- Claude review 설정과 구조 변경에 무관한 파일은 수정하거나 stage하지
  않는다.
- 폴더 이동·설정·문서 경로 갱신은 하나의 구조 변경 작업으로 검증한다.
