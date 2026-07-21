# Aurora 생성 직후 Data API migration이 재개 중 오류로 실패함

> 교훈: 일시 중지될 수 있는 관리형 자원은 생성 완료와 요청 처리 가능 상태를 구분하고, 실제 요청으로 준비 상태를 확인하라.

- 날짜: 2026-07-22 · 영역: packages · 커밋: `f596146`

## 주요 개념

### Aurora Serverless v2와 0 ACU

Aurora Serverless v2는 요청량에 맞춰 데이터베이스 처리 용량을 조절한다. 처리
용량은 ACU(Aurora Capacity Unit)로 표현하며, 이 프로젝트는 사용하지 않을 때
비용을 줄이기 위해 최소 용량을 0 ACU로 두고 자동 일시 중지를 허용한다.

0 ACU 상태의 클러스터는 첫 요청을 받으면 다시 깨어나는 시간이 필요하다. AWS
자원 생성 상태가 `CREATE_COMPLETE`여도 일시 중지된 데이터베이스가 즉시 SQL을
처리할 수 있다는 뜻은 아니다.

### RDS Data API와 migration

RDS Data API는 애플리케이션이 데이터베이스 연결을 직접 오래 유지하지 않고 HTTPS
방식의 AWS API로 SQL을 실행하게 해 준다. 이 프로젝트의 배포 workflow는
`RDS_RESOURCE_ARN`, `RDS_SECRET_ARN`, `DATABASE_NAME`을 읽어 Aurora에 migration을
적용한다.

Migration은 테이블과 인덱스처럼 데이터베이스 구조를 순서대로 바꾸는 작업이다.
Data stack 생성 직후 실행되므로 Aurora가 SQL을 받을 준비가 되지 않았다면
애플리케이션 stack으로 넘어가기 전에 배포가 멈춘다.

### 준비 상태 확인

고정된 시간만 기다리는 `sleep`은 자원이 실제로 준비됐는지 확인하지 않는다.
준비 상태 확인은 운영에서 사용할 경로와 같은 Data API로 `select 1` 같은 무해한
SQL을 보내 성공 여부를 보는 방식이다.

이번 문제에서는 Aurora가 재개 중임을 뜻하는 `DatabaseResumingException`만
재시도하고, 권한이나 잘못된 Secret 같은 오류는 기다려도 해결되지 않으므로 즉시
실패하게 했다.

## 증상

1. `FlexThiaDataProd`가 처음 생성된 직후 GitHub Actions가 `drizzle-kit migrate`를 실행했다.
2. 로그는 `applying migrations` 뒤 구체적인 원인을 출력하지 않은 채 상태 코드 1로 끝났다.
3. 같은 Aurora에 Data API로 `select 1`을 보내자 처음에는 아래 오류가 발생했고 약 15초 뒤에는 성공했다.

    ```text
    DatabaseResumingException
    ```

## 원인

1. CloudFormation은 Aurora 클러스터 자원 생성이 끝나자 `CREATE_COMPLETE`를 반환했다.
2. 비용 절감을 위해 0 ACU 자동 일시 중지를 사용하는 Aurora는 첫 SQL 요청 시 별도의 재개 시간이 필요했다.
3. 배포 workflow는 자원 생성 완료 직후 준비 확인 없이 migration을 실행했다.
4. CloudFormation의 생성 완료를 데이터베이스의 즉시 요청 처리 가능 상태와 같다고 본 가정이 깨졌다.

## 어떻게 찾았나

1. 먼저 GitHub 배포 역할의 Data API transaction 권한과 Secret 읽기 권한이 실제 자원 ARN에 허용되는지 확인했다.
2. 같은 자격 증명과 자원 정보로 `select 1`을 호출해 `DatabaseResumingException`을 재현했으므로 IAM 문제를 배제했다.
3. 15초 뒤 같은 호출이 성공해 SQL 내용이나 migration 파일보다 Aurora 재개 시점에 원인이 있음을 확인했다.
4. 모든 오류를 재시도하면 실제 설정 오류를 숨길 수 있으므로 관찰한 `DatabaseResumingException`만 일시 오류로 분류했다.

## 해결

1. `packages/database/src/commands/wait-for-data-api.ts`에서 Data API로 `select 1`을 보내는 준비 확인 명령을 추가했다.
2. `DatabaseResumingException`이면 5초 간격으로 최대 20회 재시도하고, 다른 오류는 첫 시도에서 그대로 반환하게 했다.
3. `.github/workflows/deploy-production.yml`에서 준비 확인이 성공한 경우에만 운영 migration을 실행하게 했다.
4. 고정 `sleep`은 빠르게 준비된 경우에도 기다리고 느린 경우를 보장하지 못하므로 사용하지 않았다.

## 재발 방지

1. `wait-for-data-api.spec.ts`에서 재개 오류 뒤 성공, 비일시 오류의 즉시 실패, 최대 시도 초과를 각각 검증한다.
2. 배포 순서를 `Data stack 배포 → Data API 준비 확인 → migration → Application stack 배포`로 유지한다.
