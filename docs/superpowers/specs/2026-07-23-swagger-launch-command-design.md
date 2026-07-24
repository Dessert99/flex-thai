# Swagger 실행 명령 설계

- 상태: 승인
- 범위: 로컬 Swagger 확인용 `pnpm run swagger` 명령
- 기준일: 2026-07-23

## 1. 목적

저장소 루트에서 `pnpm run swagger` 한 번으로 로컬 NestJS API 서버를
시작하고, 서버가 준비된 뒤 기본 브라우저에서 Swagger UI를 자동으로 연다.
Swagger 확인 자체에는 PostgreSQL이 필요하지 않으므로 Docker Compose는
이 명령의 실행 범위에 포함하지 않는다.

## 2. 명령 계약

- 저장소 루트의 `swagger` script는 `@flex-thia/api` workspace의 같은
  이름 script를 실행한다.
- API workspace의 `swagger` script는 전용 TypeScript 진입점을 한 번
  실행한다.
- 기본 포트는 기존 로컬 API와 같은 `3000`이다.
- `PORT` 환경 변수가 있으면 해당 포트를 사용한다.
- 서버 listen이 성공한 뒤
  `http://localhost:<port>/api/docs`를 기본 브라우저로 연다.
- `Ctrl+C`를 누르면 API 서버 프로세스가 종료된다.
- hot reload는 제공하지 않는다. 코드 변경을 반영하려면 명령을 다시
  실행한다.

## 3. 애플리케이션 구성

기존 `main.ts`에 섞여 있는 로컬 HTTP 서버 생성·설정·listen 로직을 작은
공용 함수로 분리한다. 일반 `dev` 진입점과 새 Swagger 진입점은 이 함수를
함께 사용하므로 Nest 애플리케이션 설정이 중복되지 않는다.

Swagger 진입점은 공용 서버 함수에 비운영 환경을 명시적으로 전달한다.
따라서 셸의 `NODE_ENV` 값과 무관하게 Swagger route가 활성화되며, 기존
운영 Lambda의 Swagger 비노출 정책은 바꾸지 않는다.

Swagger UI 경로는 기존 OpenAPI 설정에서 공개 상수로 제공한다. 브라우저
URL도 이 상수를 사용해 문서 route와 실행 명령 사이의 경로 중복을 없앤다.

## 4. 브라우저 실행

기본 브라우저 실행에는 운영체제별 명령을 직접 조합하지 않고 Node.js의
`open` 패키지를 개발 의존성으로 사용한다. 이 의존성은 로컬 편의 명령에서만
사용하며 Lambda 산출물이나 제품 런타임에는 포함하지 않는다.

브라우저 실행이 실패해도 이미 시작된 API 서버는 유지한다. 터미널에 실패
메시지와 직접 열 수 있는 Swagger URL을 출력한다. 서버 listen 자체가
실패하면 브라우저를 열지 않고 기존 시작 오류를 그대로 반환한다.

## 5. 실행 흐름

1. 루트 script가 API workspace의 `swagger` script를 실행한다.
2. Swagger 진입점이 `PORT` 또는 기본값 `3000`을 결정한다.
3. 공용 로컬 서버 함수가 Nest 애플리케이션을 만들고 Swagger를 포함한
   공통 설정을 적용한 뒤 listen한다.
4. listen 성공 후 Swagger UI URL을 구성한다.
5. 기본 브라우저를 열고, 실패하면 같은 URL을 터미널에 안내한다.

## 6. 테스트와 검증

브라우저 E2E 테스트는 추가하지 않는다. 의존성을 주입할 수 있는 실행
함수의 단위 테스트로 다음을 검증한다.

- 기본 포트와 사용자 지정 포트가 Swagger URL에 반영된다.
- 서버 시작이 완료된 뒤 브라우저 열기 함수가 호출된다.
- 서버 시작이 실패하면 브라우저를 열지 않는다.
- 브라우저 실행이 실패해도 실행 함수가 오류를 다시 던지지 않고 URL을
  안내한다.

구현 후 API 단위 테스트, lint, typecheck와 build를 실행한다. 실제 명령은
브라우저를 자동으로 여는 부수효과가 있으므로 검증 시 짧게 실행해 서버
기동과 URL 응답을 확인한 뒤 종료한다.

## 7. 제외 범위

- Docker Compose 또는 PostgreSQL 자동 실행
- Swagger 전용 별도 HTTP 서버
- 제품 API endpoint 비활성화
- 운영 환경의 Swagger 노출
- hot reload와 파일 감시
- 브라우저·API E2E 테스트

## 8. 완료 조건

- 저장소 루트에서 `pnpm run swagger`가 동작한다.
- 기본적으로 `http://localhost:3000/api/docs`가 자동으로 열린다.
- `PORT`로 지정한 포트에서도 서버와 브라우저 URL이 일치한다.
- Swagger 확인을 위해 Docker를 먼저 실행할 필요가 없다.
- 브라우저 실행 실패 시 서버가 유지되고 접속 URL이 출력된다.
- 기존 `pnpm --filter @flex-thia/api dev`와 Lambda 동작은 유지된다.
