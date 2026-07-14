# 프론트엔드 컴포넌트 컨벤션

이 문서는 `apps/web`의 React 컴포넌트에 적용한다. 파일 위치와 import 방향은 [structure-convention.md](../structure-convention.md)를 따른다.

## 위치

- 도메인 전용 컴포넌트는 `features/{domain}/components`에 둔다.
- 여러 도메인에서 재사용하고 도메인 규칙을 모르는 컴포넌트만 `shared/ui`에 둔다.
- `shared/components`는 만들지 않으며 실제 재사용 전에는 `shared`로 옮기지 않는다.

## 책임

- 모든 컴포넌트는 단일 책임 원칙을 준수한다.
- 서로 다른 상태나 사용자 행동을 담당하는 컴포넌트는 별도 컴포넌트와 파일로 분리한다.
- `pages` 컴포넌트는 화면을 조립하고 도메인 행동은 `features`에 위임한다.
- `features` 컴포넌트는 하나의 사용자 행동과 그 상태를 담당한다.
- `shared/ui` 컴포넌트는 도메인과 서버 통신을 모르며 여러 화면에서 재사용할 수 있어야 한다.
- 줄 수가 아니라 책임이 둘 이상일 때 분리하고, 실제 재사용 전에는 범용 컴포넌트로 추상화하지 않는다.

## Props와 상태

- Props 타입은 컴포넌트 가까이에 명시하고 구현 세부가 아니라 역할을 드러내는 이름을 쓴다.
- 이벤트 Props는 `onSave`, `onSelect`처럼 `on{행동}`으로 이름 짓는다.
- 상태는 사용하는 가장 가까운 컴포넌트에 두고, 여러 컴포넌트가 함께 소유할 때만 끌어올린다.
- 서버 상태는 `shared/hooks`의 React Query 경계에서 관리하며 `shared/ui`에 넣지 않는다.
- 렌더링 중에는 요청·저장 같은 부수효과를 실행하지 않는다.

## UI와 스타일

- 새 UI 프리미티브는 shadcn 레지스트리를 먼저 확인하고, 있으면 `pnpm --filter @thai-flex/web dlx shadcn@latest add <name>`으로 추가한다.
- shadcn 생성물은 vendored 코드로 취급해 직접 수정하지 않고 상위 컴포넌트에서 조합한다.
- 화면 코드에서는 원시 `<button>`, `<input>`, `<select>`, `<textarea>` 대신 `shared/ui`를 사용한다.
- 색과 반경은 [theme.css](../../apps/web/src/app/styles/theme.css)의 토큰을 시맨틱 Tailwind 클래스로 참조하며 리터럴 색상을 쓰지 않는다.

## 접근성과 테스트

- 의미에 맞는 HTML 요소와 label을 사용하고 키보드 조작·focus 표시를 보존한다.
- 테스트는 대상 옆의 `*.test.tsx`에 두고 구현 세부보다 사용자의 동작과 화면 결과를 검증한다.
- `describe`, `it`, `test` 설명은 한국어로 작성한다.

## 네이밍과 예외

- 직접 작성한 컴포넌트 파일은 `PascalCase.tsx`, 훅과 로직 파일은 `camelCase.ts`를 쓴다.
- 여러 파일을 공개하는 폴더에만 `index.ts`를 두며 단일 파일에는 만들지 않는다.
- shadcn CLI 생성물은 파일명, export 주석, 원시 태그 규칙의 예외로 두고 생성된 형식을 유지한다.
- 주석은 [comment-convention.md](../comment-convention.md)를 따른다.

`apps/web`에서 직접 작성한 모든 컴포넌트에 적용하며 shadcn CLI 생성물은 위 예외를 유지한다.
