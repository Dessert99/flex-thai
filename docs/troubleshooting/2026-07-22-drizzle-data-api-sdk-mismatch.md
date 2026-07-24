# Drizzle Kit의 Data API migration이 AWS SDK middleware 오류로 실패함

> 교훈: 객체를 만드는 라이브러리와 실행하는 클라이언트가 같은 런타임 규약을 공유해야 하며, 내부 의존성을 따로 번들한 CLI와 프로젝트 SDK를 섞지 마라.

- 날짜: 2026-07-22 · 영역: packages · 커밋: `7d74e70`

## 주요 개념

### AWS SDK client와 command

AWS SDK v3는 “무엇을 요청할지”를 담은 command 객체와 “어디로 어떻게 보낼지”를
담은 client를 분리한다. RDS Data API에서는 `ExecuteStatementCommand`를
`RDSDataClient.send()`에 전달해 SQL을 실행한다.

Client는 인증, endpoint 선택, 직렬화 같은 middleware를 순서대로 조립한다.
Client와 command가 서로 다른 내부 규약을 기대하면 SQL이 Aurora에 도착하기 전에
middleware 조립 단계에서 실패할 수 있다.

### CLI의 번들 의존성과 프로젝트 의존성

CLI는 터미널에서 실행하는 프로그램이다. Drizzle Kit CLI는 편리한 migration
명령을 제공하지만, 자신이 사용하는 일부 AWS SDK 코드를 내부 결과물에 함께 묶어
배포한다.

프로젝트의 `drizzle-orm`은 workspace에 설치된 AWS SDK로 command를 만들었다.
당시 Drizzle Kit 내부 client는 `3.817.0`, 프로젝트 SDK는 `3.1089.0`이어서 서로
다른 세대의 middleware 구성을 한 실행 경로에서 사용했다.

### Runtime migrator

Runtime migrator는 별도 CLI가 아니라 애플리케이션 코드가 직접 migration 함수를
호출하는 방식이다. 이 프로젝트에서는 같은 `backend/database`에 설치된
`RDSDataClient`와 Drizzle ORM의 `migrate()`를 연결하므로 client와 command가 같은
의존성 그래프를 사용한다.

## 증상

1. Aurora 준비 확인은 성공했지만 이어진 `drizzle-kit migrate --config drizzle.data-api.config.ts`가 첫 `CREATE SCHEMA`에서 실패했다.
2. GitHub Actions에서는 Drizzle Kit가 원본 오류를 출력하지 않고 상태 코드 1만 남겨 직접 재현이 필요했다.
3. 같은 설정으로 진단하자 아래 middleware 오류가 발생했다.

    ```text
    serializerMiddleware is not found when adding endpointV2Middleware middleware before serializerMiddleware
    ```

## 원인

1. `drizzle-orm 0.45.2`는 프로젝트의 AWS SDK `3.1089.0`을 사용해 `ExecuteStatementCommand`를 만들었다.
2. `drizzle-kit`의 Data API driver는 내부에 번들된 AWS SDK client `3.817.0`으로 그 command를 실행했다.
3. 구버전 client의 middleware stack에 신버전 command가 기대하는 `endpointV2Middleware`를 추가하는 과정에서 기준이 되는 `serializerMiddleware`를 찾지 못했다.
4. 같은 major version의 AWS SDK v3 패키지는 내부 버전 차이가 커도 안전하게 혼용할 수 있다는 가정이 깨졌다.

## 어떻게 찾았나

1. 준비 확인 명령이 성공했으므로 Aurora 재개 문제와 기본 Data API 접근 권한을 먼저 배제했다.
2. GitHub 로그가 원본 오류를 숨겨 동일한 Aurora와 자격 증명으로 migration 첫 SQL을 진단 실행했다.
3. lockfile과 설치된 패키지를 대조해 command를 만드는 프로젝트 SDK와 client를 제공하는 Drizzle Kit 번들의 버전 차이를 확인했다.
4. 현재 프로젝트 SDK로 37개 migration SQL을 직접 실행한 경우와 Drizzle runtime `migrate()`를 실행한 경우가 모두 성공해 원인을 CLI의 혼합 실행 경로로 좁혔다.
5. 진단 transaction을 rollback해 실제 schema와 table이 남지 않은 것도 확인했다.

## 해결

1. `db:migrate:data-api`가 Drizzle Kit CLI 대신 `tsx src/commands/migrate-data-api.ts`를 실행하게 변경했다.
2. 새 command는 같은 package의 `RDSDataClient`를 Drizzle ORM에 전달하고 runtime `migrate()`를 호출한다.
3. 실패 시 원본 `Error`를 stderr에 남기고 client를 항상 `destroy()`하며, 로그가 flush되도록 `process.exitCode = 1`로 종료한다.
4. 프로젝트 SDK를 오래된 Drizzle Kit 번들 버전에 맞추는 방법은 업데이트를 막고 같은 문제가 반복될 수 있어 사용하지 않았다.
5. CLI 전용이 되어 사용처가 사라진 `drizzle.data-api.config.ts`는 제거했다.

## 재발 방지

1. `migrate-data-api.spec.ts`에서 운영 script가 `drizzle-kit migrate`가 아니라 프로젝트 runtime command를 호출하는지 검증한다.
2. `run-data-api-migration.spec.ts`에서 성공·실패 로그와 실패 원본 보존, client 정리를 검증한다.
3. AWS SDK를 갱신할 때 Data API client와 Drizzle runtime을 같은 workspace 의존성 그래프에서 함께 검증한다.
