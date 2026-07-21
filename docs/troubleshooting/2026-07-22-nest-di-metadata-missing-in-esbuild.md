# API Lambda에서 NestJS가 AuthController 의존성을 찾지 못해 500을 반환함

> 교훈: decorator 기반 자동 주입을 사용하는 프레임워크는 compiler가 생성하는 runtime metadata가 실제 배포 bundle에도 남는지 검증하라.

- 날짜: 2026-07-22 · 영역: api · 커밋: 없음

## 주요 개념

### NestJS 의존성 주입

의존성 주입은 class가 필요한 객체를 직접 만들지 않고 외부 container가 생성해
전달하는 방식이다. NestJS는 module의 `providers`에 등록된 객체를 controller의
constructor parameter에 넣는다.

NestJS가 무엇을 넣을지 아는 방법은 두 가지다. `@Inject(TOKEN)`처럼 token을
명시하거나, TypeScript가 decorator metadata에 남긴 class type을 읽어 자동으로
찾을 수 있다. 후자는 소스의 type 정보가 JavaScript runtime metadata로 보존돼야
한다.

### TypeScript type과 runtime metadata

TypeScript의 type은 일반적으로 JavaScript로 변환할 때 사라진다.
`emitDecoratorMetadata`를 지원하는 TypeScript compiler는 decorator가 붙은 class에
`design:paramtypes` metadata를 추가해 constructor type 일부를 runtime에 남길 수
있다.

이 프로젝트의 production Lambda는 `tsc` 결과가 아니라 esbuild가 TypeScript
소스를 바로 bundle한 파일을 실행한다. 따라서 단위 테스트에서 NestJS가 class
type을 알아냈더라도 실제 bundle에 같은 metadata가 없으면 production 동작이
달라질 수 있다.

### 명시적 injection token

`@Inject(USER_REPOSITORY)`는 interface처럼 runtime에 존재하지 않는 type 대신
명시적인 token으로 provider를 찾게 한다. `AuthController`의 두 번째 parameter는
이 방식을 사용했지만 첫 번째 `PasswordAuthService`는 type 기반 자동 주입에
의존했다.

이번 bundle에는 두 번째 parameter의 명시적 token 정보만 남고 첫 번째 parameter의
class metadata가 남지 않아 NestJS가 첫 인수를 식별하지 못했다.

## 증상

1. ESM 파일 확장자 문제를 수정해 Lambda가 bundle을 읽기 시작했지만 `/health`와 `/ready`는 계속 HTTP 500을 반환했다.
2. CloudWatch는 `AuthController`의 첫 번째 constructor parameter를 해결하지 못했다고 기록했다.
3. 확인한 오류는 아래와 같다.

    ```text
    UndefinedDependencyException: Nest can't resolve dependencies of the
    AuthController (?, Symbol(USER_REPOSITORY)). Please make sure that the
    argument at index [0] is available in the current module.
    ```

## 원인

1. `AuthModule.register()`에는 `PasswordAuthService` provider가 등록돼 있어 provider 객체 자체가 빠진 상태는 아니었다.
2. `AuthController`의 첫 번째 parameter는 `PasswordAuthService` type만 사용하고 `@Inject(...)` token을 명시하지 않았다.
3. esbuild로 만든 production bundle에는 첫 번째 parameter를 가리키는 `design:paramtypes` metadata가 없고 두 번째 parameter의 `@Inject(USER_REPOSITORY)` 정보만 남았다.
4. NestJS는 index 0에 넣을 token을 알 수 없어 애플리케이션 초기화를 중단했다.
5. TypeScript 설정의 decorator metadata 옵션이 esbuild production bundle에도 같은 방식으로 적용될 것이라는 가정이 깨졌다.

## 어떻게 찾았나

1. CloudFormation과 Lambda module 로딩은 성공했지만 HTTP 500이므로 CloudWatch의 NestJS 초기화 log를 확인했다.
2. 오류의 index 0과 `AuthController` constructor를 대조해 첫 번째 인수 `PasswordAuthService`로 범위를 좁혔다.
3. `AuthModule.register()`에 해당 service provider가 실제로 등록돼 있어 단순 provider 누락 가설을 배제했다.
4. 배포 bundle을 확인해 `USER_REPOSITORY`의 명시적 parameter decorator는 있지만 `PasswordAuthService`를 나타내는 `design:paramtypes`가 없음을 확인했다.
5. 다른 NestJS class도 type 기반 자동 주입을 사용하므로 `AuthController` 한 곳만의 오타가 아니라 compilation 방식과 DI 경계의 문제임을 확인했다.

## 해결

1. 현재 상태는 미해결이다.
2. 사용자가 인프라 사전 작업 범위를 넘어 백엔드 코드를 계속 수정하지 말라고 요청해 production 코드 변경을 중단했다.
3. 이후 백엔드 설계에서 필요한 provider를 모두 명시적 token으로 주입할지, NestJS decorator metadata를 보존하는 compilation 경로를 사용할지 먼저 결정해야 한다.
4. 수정할 때는 `AuthController` 한 곳뿐 아니라 production Lambda가 초기화하는 모든 controller와 provider의 constructor 주입을 함께 점검해야 한다.
