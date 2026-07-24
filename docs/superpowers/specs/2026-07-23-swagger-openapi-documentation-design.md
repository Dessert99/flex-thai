# Swagger·OpenAPI 문서화 설계

- 상태: 승인
- 범위: 현재 활성 HTTP API와 이후 추가되는 모든 공개 HTTP API
- 기준일: 2026-07-23

## 1. 목적

FLEX THIA 백엔드의 공개 HTTP 계약을 사람이 탐색할 수 있는 Swagger UI와
도구가 소비할 수 있는 OpenAPI JSON으로 제공한다. 런타임 검증에 사용하는
Zod schema를 문서 schema의 단일 원본으로 유지하고, 새 API가 문서 없이
추가되지 않도록 계획·아키텍처 규칙과 자동 검증을 함께 둔다.

## 2. 노출 정책

- 로컬·개발 환경에서만 Swagger route를 등록한다.
- Swagger UI는 `/api/docs`에서 제공한다.
- OpenAPI JSON은 `/api/openapi.json`에서 제공한다.
- 운영 환경에서는 UI와 JSON route를 모두 등록하지 않는다.
- 문서 route는 제품 API의 `/api/v1` global prefix에 포함하지 않는다.

환경 판정은 API 애플리케이션 설정이 사용하는 `NODE_ENV`를 기준으로 한다.
`production`이면 문서를 비활성화하고, 그 밖의 로컬·개발 실행에서는
활성화한다.

## 3. 문서화 범위

현재 root application에 등록된 다음 endpoint를 문서화한다.

| 영역 | endpoint |
| --- | --- |
| 인증 | `POST /api/v1/auth/login` |
| 인증 | `POST /api/v1/auth/mfa/totp/challenge` |
| 인증 | `POST /api/v1/auth/mfa/totp/setup` |
| 인증 | `POST /api/v1/auth/mfa/totp/setup/verify` |
| 인증 | `POST /api/v1/auth/refresh` |
| 인증 | `POST /api/v1/auth/logout` |
| 사용자 | `GET /api/v1/me` |
| 상태 | `GET /health` |
| 상태 | `GET /ready` |

root application에 등록되지 않은 legacy `jobs`, `uploads` Controller는
문서에 포함하지 않는다. 이후 공개 Controller를 root application에
등록할 때는 같은 변경에서 Swagger 문서와 문서 검증 테스트를 추가한다.

## 4. 계약의 단일 원본

공개 요청·응답 schema는 계속 `shared/contracts`의 Zod schema가 소유한다.
`backend/api`는 `nestjs-zod`의 `createZodDto`로 얇은 Swagger DTO class를
만들어 Nest reflection에 연결한다.

- Zod schema와 TypeScript type을 별도로 복제하지 않는다.
- Swagger 전용 `class-validator` DTO를 만들지 않는다.
- Controller의 현재 Zod parse와 공개 오류 변환 동작은 유지한다.
- Swagger DTO는 HTTP 문서 metadata를 제공하며 업무 규칙을 포함하지
  않는다.
- 공통 RFC 9457 Problem Details schema도 같은 방식으로 재사용한다.

## 5. OpenAPI 구성

`backend/api/src/openapi`가 문서 생성을 소유한다.

- `@nestjs/swagger`의 `DocumentBuilder`와 `SwaggerModule`을 사용한다.
- 문서 제목은 `FLEX THIA API`, 버전은 `1.0`으로 고정한다.
- 태그는 `Authentication`, `Identity`, `Health`를 사용한다.
- Bearer access token과 HttpOnly refresh cookie 보안 scheme을 등록한다.
- 각 operation은 요약, 성공 상태, 요청·응답 schema와 공개 오류 응답을
  명시한다.
- 관리자 TOTP endpoint에는 Bearer 인증과 관리자 역할 조건을 설명한다.
- refresh와 logout에는 refresh cookie 사용을 설명한다.
- CSRF guard가 적용된 endpoint에는 same-origin 요청 조건을 설명한다.
- logout의 `204 No Content`에는 response body schema를 두지 않는다.

## 6. 애플리케이션 연결

공통 bootstrap 경로에서 global prefix, filter, CORS를 설정한 뒤 OpenAPI를
설정한다. 로컬 HTTP 서버와 Lambda가 같은 애플리케이션 설정 함수를
사용하므로 환경 판정도 한 곳에서 수행한다.

문서 설정 함수는 다음 책임만 가진다.

1. 환경이 `production`인지 판정한다.
2. 비운영 환경이면 OpenAPI document factory를 만든다.
3. Swagger UI와 JSON route를 지정된 경로에 등록한다.

운영 환경에서는 `SwaggerModule.setup`을 호출하지 않아 route 자체가
생기지 않게 한다.

## 7. 오류와 보안 문서

공개 오류는 `application/problem+json`과 `ProblemDetailsResponse`로
문서화한다. operation 성격에 따라 다음 상태를 명시한다.

- `400`: Zod 입력 검증 실패
- `401`: 자격 증명, access token, refresh token 또는 MFA challenge 실패
- `403`: 역할, MFA 등록 또는 CSRF 정책 거부
- `409`: 현재 사용자 상태와 요청이 충돌
- `500`: 예상하지 못한 서버 오류

Swagger는 보안 동작을 대체하지 않는다. 문서 UI의 실행 기능도 기존
Guard, cookie, CORS와 동일한 검증을 거친다.

## 8. 테스트

브라우저·API E2E 테스트는 추가하지 않는다. Nest testing application에서
OpenAPI document를 생성하는 단위 테스트로 다음을 확인한다.

- 비운영 환경에서 지정된 UI·JSON 경로가 설정된다.
- 운영 환경에서는 Swagger 설정이 호출되지 않는다.
- 현재 활성 endpoint 아홉 개만 OpenAPI paths에 존재한다.
- legacy `jobs`, `uploads` path가 없다.
- 요청·응답 schema, Bearer와 cookie security scheme이 존재한다.
- logout은 `204`이고 response content가 없다.
- Problem Details 오류 응답이 공개 schema를 참조한다.

전체 검증은 `pnpm lint`, `pnpm typecheck`, API 단위 테스트와 workspace
build를 포함한다.

## 9. 필수 규칙 반영

다음 문서에 Swagger 문서화 의무를 반영한다.

- `docs/superpowers/plans/2026-07-23-identity-auth-mvp.md`
- `docs/superpowers/plans/2026-07-23-backend-mvp-roadmap.md`
- `docs/development/backend-architecture.md`

규칙은 다음과 같다.

> root application에 등록하는 모든 공개 HTTP endpoint는 같은 변경에서
> 요청·응답·인증·오류 Swagger 문서와 OpenAPI document 단위 테스트를
> 추가해야 한다.

## 10. 제외 범위

- 운영 Swagger 인증 UI
- 정적 OpenAPI 파일을 저장소에 생성·커밋하는 작업
- 프론트엔드 client code generation
- legacy `jobs`, `uploads` API 복원
- Swagger를 위한 도메인·DB·인프라 변경
- 브라우저 또는 API E2E 테스트

## 11. 완료 조건

- 비운영 환경에서 `/api/docs`, `/api/openapi.json`을 사용할 수 있다.
- 운영 환경에는 두 route가 존재하지 않는다.
- 현재 활성 endpoint의 계약과 보안·오류 조건이 OpenAPI에 나타난다.
- Zod schema가 런타임 검증과 Swagger schema의 단일 원본이다.
- 계획과 백엔드 아키텍처에 이후 API의 Swagger 필수 규칙이 반영된다.
- lint, typecheck, 단위 테스트와 build가 통과한다.
