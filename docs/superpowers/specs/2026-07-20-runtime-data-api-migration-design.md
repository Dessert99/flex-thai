# Runtime Data API migration 설계

## 문제와 재현 근거

`drizzle-kit migrate`는 AWS SDK RDS Data API client `3.817.0`을 내부에
번들하지만, 현재 `drizzle-orm 0.45.2`는 프로젝트의 AWS SDK `3.1089.0`으로
`ExecuteStatementCommand`를 만든다. 구버전 client에 신버전 command를
전달하면 첫 `CREATE SCHEMA`에서 다음 middleware 오류가 발생한다.

```text
serializerMiddleware is not found when adding endpointV2Middleware middleware before serializerMiddleware
```

같은 Aurora에서 현재 SDK로 37개 SQL을 직접 실행한 경우와 Drizzle runtime
`migrate()`를 실행한 경우는 모두 성공했고 transaction을 rollback했다. GitHub
deploy role의 Data API·Secret 권한도 실제 리소스에 대해 모두 허용됐다.

## 검토한 방식

1. 프로젝트 SDK를 Drizzle Kit 번들 버전인 `3.817.0`으로 고정하면 현재
   오류는 피할 수 있지만 보안·호환성 업데이트를 오래된 번들에 종속시킨다.
2. Drizzle Kit만 올리면 새 배포판의 번들 SDK와 다시 맞을 수 있지만, CLI가
   별도 SDK를 번들하는 구조와 오류 로그 유실은 그대로 남는다.
3. database package가 현재 SDK client를 직접 만들고 Drizzle runtime
   `migrate()`를 호출하면 client와 command가 같은 의존성 그래프를 사용하고
   오류 출력도 프로젝트가 통제한다.

세 번째 방식을 사용한다. Drizzle은 AWS Data API runtime migrator를 공식
제공하고, 이미 rollback 진단에서 현재 dependency 조합의 전체 migration이
성공했다.

## 구성과 데이터 흐름

`src/commands/migrate-data-api.ts`는 `RDS_RESOURCE_ARN`,
`RDS_SECRET_ARN`, `DATABASE_NAME`, `AWS_REGION`을 fail-fast로 읽는다.
같은 package에 설치된 `RDSDataClient`를 만들고
`drizzle-orm/aws-data-api/pg`에 전달한 뒤
`drizzle-orm/aws-data-api/pg/migrator`의 `migrate()`를 호출한다.

```text
GitHub Actions
  → Aurora 준비 대기
  → tsx migrate-data-api.ts
  → 현재 RDSDataClient
  → 현재 Drizzle ORM command
  → runtime migrate()
```

package script 이름 `db:migrate:data-api`와 workflow 호출은 유지한다.
호출자 변경 없이 구현만 CLI에서 runtime command로 바뀐다. CLI 전용
`drizzle.data-api.config.ts`는 orphan이 되므로 제거한다. 로컬 migration과
SQL 생성에는 기존 `drizzle-kit`을 계속 사용한다.

## 오류와 자원 정리

runtime command는 migration SQL을 보내기 전에 query를 기록하되 parameter
값은 기록하지 않는다. 실패하면 원본 `Error`를 `console.error`로 남기고
`process.exit()`를 호출하지 않은 채 `process.exitCode = 1`로 종료해 stderr가
flush될 시간을 보장한다. 성공·실패와 관계없이 `RDSDataClient.destroy()`를
호출한다.

## 테스트와 검증

회귀 테스트는 production package script가 `drizzle-kit migrate`가 아니라
`tsx src/commands/migrate-data-api.ts`를 호출하는지 검증한다. command의
실행 경계는 주입 가능한 작은 함수로 분리해 성공 시 완료 로그, 실패 시 원본
오류 로그와 rethrow, 항상 client 정리를 단위 테스트한다.

database test·typecheck와 전체 `pnpm check`, CDK synth를 실행한다. 실제
Aurora에서는 새 runtime migrator를 외부 transaction에 가두고 commit을
가로챈 뒤 rollback하여 37단계 전체가 성공하고 DB에 schema·table이 남지
않는지 확인한다.
