# 서울 리전에서 Aurora PostgreSQL 16.3 클러스터 생성이 실패함

> 교훈: 관리형 데이터베이스의 엔진 버전은 서비스 전체가 아니라 실제 배포 리전에서 제공되는 버전인지 확인하고 설계도에 고정하라.

- 날짜: 2026-07-22 · 영역: infra · 커밋: `c6c21bc`

## 주요 개념

### PostgreSQL과 Aurora PostgreSQL

PostgreSQL은 관계형 데이터베이스 소프트웨어이고, Aurora PostgreSQL은 AWS가
PostgreSQL과 호환되도록 운영하는 관리형 데이터베이스다. 애플리케이션은
PostgreSQL 문법과 드라이버를 사용하지만, 실제 서버의 설치·복제·장애 복구는
AWS가 담당한다.

이 프로젝트는 직접 PostgreSQL 서버를 관리하는 대신 `FlexThiaDataProd` stack에서
Aurora PostgreSQL 클러스터를 만든다. 따라서 사용할 수 있는 엔진 버전은 PostgreSQL
공식 배포 목록만이 아니라 AWS가 서울 리전의 Aurora에서 제공하는 목록에도 있어야 한다.

### AWS 리전과 엔진 버전

AWS 리전은 서울 `ap-northeast-2`처럼 데이터 센터와 서비스 자원을 묶는 지리적
운영 단위다. 같은 AWS 서비스라도 새 버전의 출시와 이전 버전의 신규 생성 지원
여부가 리전마다 다를 수 있다.

CDK의 `AuroraPostgresEngineVersion` 상수가 존재한다는 사실은 CDK가 그 값을
CloudFormation에 적을 수 있다는 뜻일 뿐, 선택한 리전에서 그 버전의 새 클러스터를
만들 수 있다는 보장은 아니다.

### CloudFormation stack과 rollback

CloudFormation stack은 함께 만들고 변경하고 삭제할 AWS 자원의 묶음이다.
`FlexThiaDataProd`에는 Aurora와 S3, Secrets Manager 같은 데이터 자원이 들어 있다.

stack 안의 핵심 자원 생성이 실패하면 CloudFormation은 이미 만들던 자원을 되돌리는
rollback을 수행한다. 그래서 DB 클러스터 하나의 버전 오류가 stack 전체의
`ROLLBACK_COMPLETE`로 나타났다.

## 증상

1. GitHub Actions에서 CDK로 서울 리전의 `FlexThiaDataProd` stack을 배포하려 했다.
2. `AWS::RDS::DBCluster` 생성이 `CREATE_FAILED`가 되면서 stack 전체가 `ROLLBACK_COMPLETE`로 끝났다.
3. CloudFormation은 지정한 Aurora PostgreSQL 버전을 찾지 못했다는 오류를 반환했다.

    ```text
    Cannot find version 16.3 for aurora-postgresql
    ```

## 원인

1. `infra/src/data-stack.ts`는 Aurora PostgreSQL 엔진을 `VER_16_3`으로 명시했다.
2. CDK는 이 값을 CloudFormation 설계도의 `EngineVersion: 16.3`으로 변환했다.
3. 서울 리전은 당시 Aurora PostgreSQL 16.3을 신규 클러스터 버전으로 제공하지 않았으므로 RDS가 생성 요청을 거부했다.
4. CDK 라이브러리에 선언된 버전은 모든 리전에서 현재 생성 가능할 것이라는 가정이 깨졌다.

## 어떻게 찾았나

1. GitHub Actions의 마지막 상태만 보면 CDK 배포 전체가 실패한 것처럼 보였다.
2. CloudFormation의 `FlexThiaDataProd` 이벤트에서 최초 `CREATE_FAILED` 자원이 `AWS::RDS::DBCluster`임을 확인했다.
3. 해당 이벤트의 `Cannot find version 16.3 for aurora-postgresql` 메시지로 IAM, 네트워크, 용량 설정이 아니라 엔진 버전 선택 문제로 범위를 좁혔다.
4. 서울 리전에서 제공되고 `db.serverless`로 생성 가능한 16.13을 확인해 대체 버전으로 선택했다.

## 해결

1. `infra/src/data-stack.ts`의 엔진 버전을 `VER_16_3`에서 `VER_16_13`으로 변경했다.
2. 버전 지정을 없애 AWS 기본값에 맡기는 방법은 배포 시점마다 결과가 달라질 수 있어 사용하지 않았다.
3. 다시 배포해 `FlexThiaDataProd`가 `CREATE_COMPLETE`가 되고 Aurora 클러스터가 생성되는 것을 확인했다.

## 재발 방지

1. `infra/test/data-stack.spec.ts`에서 합성된 `AWS::RDS::DBCluster`의 `EngineVersion`이 `16.13`인지 검증한다.
2. 엔진 버전을 올릴 때는 CDK 상수의 존재뿐 아니라 대상 리전의 실제 지원 여부와 `pnpm infra:synth` 결과를 함께 확인한다.
