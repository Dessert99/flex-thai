# shared/components primitives 지침

이 디렉터리의 모든 공용 primitive 컴포넌트에 적용한다.

- primitives 컴포넌트의 테스트 코드(`*.test.*`, `*.spec.*`)를 만들지 않는다.
- 모든 primitive 컴포넌트 파일에는 같은 이름의 `*.stories.tsx` 파일을 반드시 만든다. 예: `button.tsx` → `button.stories.tsx`.
- 한 파일에서 함께 내보내는 하위 컴포넌트는 해당 파일의 스토리에서 조합해 보여준다.
- Storybook 제목은 `Shared/UI/{컴포넌트명}`으로 통일한다.
- 기본 상태와 지원하는 주요 variant·크기·비활성·오류 상태를 스토리로 제공한다. 필요한 Provider와 상호작용 예시도 포함한다.
- 컴포넌트를 추가하거나 변경할 때 스토리도 함께 작성하거나 갱신한다. 스토리가 없으면 작업 완료로 간주하지 않는다.
- 검증은 Storybook 화면 확인·빌드와 lint·typecheck로 한다. Storybook `play` 함수에도 테스트 assertion을 추가하지 않는다.

- shadcn 컴포넌트는 공식 CLI 생성물을 그대로 사용한다. 생성 코드와 의존성을 자체 구현으로 바꾸지 않는다. `cn`은 공식 `cn` 패키지에서 가져온다.
