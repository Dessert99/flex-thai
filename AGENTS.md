# 태국어 학습 및 문제 서비스

- 태국어를 효율적으로 학습하여 FLEX 시험을 빠른 시일 내에 통과할 수 있도록 돕는 서비스

## 기술 스택

- 프론트엔드: VITE, tailwind css, shadcn, tanstack query
- 백엔드: NestJS

## 프로젝트 코딩 지침

### 1. 프로젝트 구조와 프론트엔드 컨벤션

코드 위치와 의존성 방향은 `conventions/structure-convention.md`를 단일
기준으로 따른다.

### 2. E2E 테스트는 두지 않는다

이 프로젝트는 E2E 테스트(브라우저·API 통합 포함)를 추가하지 않는다.

- Playwright 등 E2E 러너·설정·스펙을 새로 만들지 않는다.
- 검증은 단위/컴포넌트 테스트(Vitest)와 lint·typecheck로 한다.
- 사용자가 명시적으로 요청하지 않는 한 E2E 스캐폴딩을 제안하거나 도입하지 않는다.
