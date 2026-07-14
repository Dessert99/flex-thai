# 폴더 구조 컨벤션

이 문서는 현재 파일 전체가 아니라 `apps/web`, `apps/api`, `packages/shared`의 대표 구조와 의존 규칙만 설명한다.

- `{domain}`은 반복 가능한 도메인 이름 자리다.
- `...`은 같은 규칙을 따르는 파일·폴더를 생략했다는 뜻이다.
- 파일 추가가 아니라 구조와 책임이 바뀔 때 문서를 갱신한다.

## 대표 구조

```text
thai-flex/
├── apps/
│   ├── web/                         # Vite + React
│   │   └── src/
│   │       ├── app/                 # 앱 진입·라우터·전역 설정
│   │       ├── pages/{domain}/      # 라우트 단위 화면
│   │       ├── features/{domain}/
│   │       │   ├── components/      # 도메인 전용 UI
│   │       │   ├── hooks/           # 도메인 전용 React 훅
│   │       │   ├── types/           # 도메인 전용 타입
│   │       │   └── utils/           # 도메인 전용 순수 함수
│   │       ├── shared/
│   │       │   ├── ui/              # 도메인 무관 UI
│   │       │   ├── api/             # HTTP 클라이언트·QueryClient
│   │       │   ├── hooks/           # 여러 도메인이 쓰는 React 훅
│   │       │   ├── types/           # 여러 도메인이 쓰는 타입
│   │       │   ├── utils/           # 도메인 무관 순수 함수
│   │       │   └── test/            # 테스트 전역 설정
│   │       └── main.tsx
│   └── api/                         # NestJS
│       └── src/
│           ├── {domain}/
│           │   ├── {domain}.module.ts
│           │   ├── {domain}.controller.ts
│           │   ├── {domain}.service.ts
│           │   └── {domain}.dto.ts
│           ├── db/                  # 데이터베이스 기반 코드
│           ├── content-import/      # 콘텐츠 가져오기 파이프라인
│           ├── app.module.ts
│           └── main.ts
├── packages/
│   └── shared/
│       └── src/
│           ├── {domain}.ts          # 공유 타입·Zod 스키마·상수
│           ├── {domain}.test.ts
│           └── index.ts             # 공개 배럴
└── content-factory/                 # workspace 밖의 Python 파이프라인
```

- feature 파일은 필요할 때 `components`, `hooks`, `types`, `utils`로 분류하고 빈 폴더는 미리 만들지 않는다.
- 같은 도메인에서 재사용하면 해당 feature에 유지한다.
- 여러 도메인에서 재사용하고 도메인 규칙을 몰라도 이해할 수 있을 때만 같은 역할의 `shared` 폴더로 옮긴다.
- 공용 컴포넌트는 `shared/ui`에 두며 `shared/components`는 만들지 않는다.

## 의존 방향

```text
apps/web ─┐
          ├──> packages/shared
apps/api ─┘
```

- 프론트엔드는 `app -> pages -> features -> shared` 순서로만 의존한다.
- 백엔드는 도메인별 Nest module을 경계로 controller·service·DTO를 모은다.
- web과 api는 서로의 `src`를 직접 import하지 않는다.
- `packages/shared`는 어떤 `apps/*` 코드에도 의존하지 않는다.

## `packages/shared` 기준

- web과 api가 함께 쓰는 TypeScript 타입·Zod 스키마·상수만 둔다.
- 한쪽 앱에서만 쓰는 타입은 해당 앱에 둔다.
- 두 앱은 `@thai-flex/shared` 공개 배럴로만 import하고 내부 경로를 직접 참조하지 않는다.
- 브라우저와 Node.js가 함께 소비하므로 React·NestJS·플랫폼 전용 API에 의존하지 않는다.
- 계약 변경 후에는 shared를 먼저 빌드하고 소비 앱을 검증한다.

주석 규칙은 [comment-convention.md](comment-convention.md), 프론트엔드 컴포넌트 규칙은 [component-convention.md](frontend/component-convention.md)를 따른다.
