# 트러블슈팅 기록

문제를 해결한 뒤 나중에 다시 읽고 배울 수 있도록 남긴 기록이다. 증상만이
아니라 왜 그렇게 동작했는지와 처음에 왜 잘못 짚었는지를 함께 남긴다.

아래 표는 증상이 아니라 교훈을 싣는다. 지금 같은 에러를 겪는 중이라면
폴더 전체를 에러 문구로 검색하고, 복습이 목적이라면 이 표만 훑는다.

새 문서는 `/troubleshooting-doc` 스킬로 작성한다. 규칙은
[.agents/skills/troubleshooting-doc/SKILL.md](../../.agents/skills/troubleshooting-doc/SKILL.md)에
있다.

- 파일명: `YYYY-MM-DD-slug.md` (slug는 영어 kebab-case)
- 영역: `infra` `api` `worker` `web` `backend` `shared` `tooling`

## 목록

| 날짜 | 영역 | 교훈 | 문서 |
| --- | --- | --- | --- |
| 2026-07-22 | api | decorator 기반 자동 주입을 사용하는 프레임워크는 compiler가 생성하는 runtime metadata가 실제 배포 bundle에도 남는지 검증하라. | [API Lambda에서 NestJS가 AuthController 의존성을 찾지 못해 500을 반환함](./2026-07-22-nest-di-metadata-missing-in-esbuild.md) |
| 2026-07-22 | api | JavaScript module 형식은 빌드 옵션만으로 결정되지 않으므로, 배포 파일의 확장자와 런타임 해석 규칙까지 함께 맞춰라. | [API Lambda가 ESM bundle을 CommonJS로 읽어 시작하지 못함](./2026-07-22-api-lambda-esm-extension.md) |
| 2026-07-22 | api | 가입 보안은 인증 방식보다 외부 과금 자원을 만드는 시점을 기준으로 설계하고, 소유권 확인 전에는 영구 회원을 생성하지 마라. | [이메일 인증 전에 Cognito 회원을 만드는 공개 경로가 발견됨](./2026-07-22-cognito-preverification-cost-path.md) |
| 2026-07-22 | infra | CloudFormation의 최초 생성 실패와 rollback 중 발생한 정리 실패를 분리하고, 의존 자원이 해제된 뒤 실패 stack만 정리하라. | [Application stack rollback이 사용 중인 ACM 인증서를 삭제하지 못함](./2026-07-22-cloudformation-rollback-certificate-in-use.md) |
| 2026-07-22 | infra | 한 리전에 만드는 서비스가 다른 서비스도 같은 리전을 쓴다고 가정하지 말고, 서비스 간 리전 대응 규칙을 별도로 확인하라. | [서울 Cognito User Pool이 잘못된 SNS 리전으로 생성에 실패함](./2026-07-22-cognito-sms-region-mismatch.md) |
| 2026-07-22 | infra | 예약 동시성의 합만 계산하지 말고 계정·리전 할당량과 AWS가 요구하는 미예약 최소치까지 포함해 배포 가능성을 확인하라. | [Lambda 예약 동시성을 설정하자 Application stack 생성이 실패함](./2026-07-22-lambda-reserved-concurrency-quota.md) |
| 2026-07-22 | backend | 객체를 만드는 라이브러리와 실행하는 클라이언트가 같은 런타임 규약을 공유해야 하며, 내부 의존성을 따로 번들한 CLI와 프로젝트 SDK를 섞지 마라. | [Drizzle Kit의 Data API migration이 AWS SDK middleware 오류로 실패함](./2026-07-22-drizzle-data-api-sdk-mismatch.md) |
| 2026-07-22 | backend | 일시 중지될 수 있는 관리형 자원은 생성 완료와 요청 처리 가능 상태를 구분하고, 실제 요청으로 준비 상태를 확인하라. | [Aurora 생성 직후 Data API migration이 재개 중 오류로 실패함](./2026-07-22-aurora-data-api-resuming.md) |
| 2026-07-22 | infra | 관리형 데이터베이스의 엔진 버전은 서비스 전체가 아니라 실제 배포 리전에서 제공되는 버전인지 확인하고 설계도에 고정하라. | [서울 리전에서 Aurora PostgreSQL 16.3 클러스터 생성이 실패함](./2026-07-22-aurora-postgresql-version-unavailable.md) |
| 2026-07-22 | infra | 여러 줄 파일 내용은 CLI의 key-value 인수로 운반하지 말고, 입력 경계에서 정규화한 뒤 다중행을 보존하는 별도 전달 수단을 사용하라. | [CloudFront 공개 키의 개행이 CDK 설정 경계에 그대로 남음](./2026-07-22-cdk-context-multiline-pem.md) |
| 2026-07-20 | tooling | 워크스페이스 도구는 실제 실행 디렉터리에 직접 선언하고, 번들링 테스트는 깨끗한 설치와 제한된 병렬성에서 검증하라. | [GitHub Actions의 CDK 번들링이 esbuild를 찾지 못함](./2026-07-20-ci-cdk-esbuild-not-found.md) |
