# 태국어 학습 및 문제 서비스

- 태국어를 효율적으로 학습하여 FLEX 시험을 빠른 시일 내에 통과할 수 있도록 돕는 서비스

## 기술 스택

- 프론트엔드: VITE, tailwind css, shadcn, tanstack query
- 백엔드: NestJS

## 프로젝트 코딩 지침

### 1. 주석 컨벤션을 적용한다

모든 새 코드와 변경되는 코드는 `conventions/comment-convention.md`를 따른다.

### 2. 테스트 설명은 한국어로 작성한다

Vitest/Jest 계열 테스트의 `describe`, `it`, `test` 설명 문자열은 한국어로 쓴다.

- 테스트 이름은 사용자가 읽는 동작 설명이므로 영어 문장으로 남기지 않는다.
- 코드 식별자가 필요하면 설명 안에 식별자를 섞되, 문장 자체는 한국어로 쓴다.
- 기존 테스트를 수정할 때는 해당 파일의 `describe`, `it`, `test` 설명 문자열도 함께 한국어로 맞춘다.

### 3. 프로젝트 구조와 프론트엔드 컨벤션

코드 위치와 의존성 방향은 `conventions/structure-convention.md`를 단일
기준으로 따른다. 프론트엔드 컴포넌트 작업은
`conventions/frontend/component-convention.md`도 함께 따른다.

### 4. 백엔드 아키텍처

백엔드 작업은 `conventions/structure-convention.md`와
`docs/development/backend-architecture.md`를 작업 전에 읽고 따른다.
경로 목록과 배치 규칙은 이 문서에 복제하지 않는다.

### 5. E2E 테스트는 두지 않는다

이 프로젝트는 E2E 테스트(브라우저·API 통합 포함)를 추가하지 않는다.

- Playwright 등 E2E 러너·설정·스펙을 새로 만들지 않는다.
- 검증은 단위/컴포넌트 테스트(Vitest)와 lint·typecheck로 한다.
- 사용자가 명시적으로 요청하지 않는 한 E2E 스캐폴딩을 제안하거나 도입하지 않는다.
