# Aurora PostgreSQL 리전 호환 버전 수정 설계

## 문제

운영 `DataStack`은 Aurora PostgreSQL `16.3`을 고정하지만 서울 리전은 이
버전을 더 이상 신규 DB cluster 버전으로 제공하지 않는다. 이 때문에
CloudFormation이 `AWS::RDS::DBCluster` 생성을 거부하고 전체 운영 배포가
`ROLLBACK_COMPLETE`로 끝난다.

## 결정

서울 리전에서 현재 제공되고 `db.serverless`로 생성 가능한 PostgreSQL
`16.13`을 명시적으로 고정한다. 배포 결과를 재현할 수 있도록 버전 지정을
제거하거나 AWS 기본 버전에 맡기지 않는다.

## 변경 범위

`DataStack`의 엔진 버전을 `VER_16_13`으로 바꾸고, 합성된
`AWS::RDS::DBCluster`의 `EngineVersion`이 `16.13`인지 기존 단위 테스트에서
검증한다. 다른 Aurora 용량, auto-pause, Data API, 보존 정책은 변경하지
않는다.

## 검증

먼저 `EngineVersion: 16.13` assertion을 추가해 현재 `16.3` 설계도에서
테스트가 실패하는지 확인한다. 엔진 버전 변경 후 같은 테스트와 infra
typecheck, CDK synth를 실행해 코드와 CloudFormation 설계도가 모두
`16.13`을 사용하는지 확인한다.
