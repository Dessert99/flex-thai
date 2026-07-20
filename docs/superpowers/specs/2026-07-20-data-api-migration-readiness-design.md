# Aurora Data API migration 준비 대기 설계

## 문제와 근거

`FlexThiaDataProd` 생성 직후 Drizzle migration이 실행되면서
`DatabaseResumingException`으로 실패했다. 같은 Aurora에 `select 1`을
호출했을 때 처음에는 같은 오류가 발생했고 15초 뒤에는 성공했다. GitHub
deploy role의 Data API transaction 권한과 Secret 읽기 권한은 실제
리소스 ARN에 대해 모두 허용됐다.

따라서 원인은 migration SQL이나 IAM이 아니라 0 ACU Aurora가 요청을 받아
재개되는 동안 workflow가 준비 상태를 기다리지 않은 것이다. AWS도
auto-pause를 사용하는 연결 로직에서 일시적 연결 오류를 재시도하고, 일반적인
재개 시간을 약 15초로 고려하라고 안내한다.

## 검토한 방식

1. 고정 시간만큼 `sleep`하면 구현은 짧지만 실제 재개 상태를 확인하지 못하고
   느린 재개에서는 다시 실패한다.
2. workflow의 Bash 반복문으로 AWS CLI를 호출하면 의존성은 적지만 재시도
   분기와 종료 조건을 단위 테스트하기 어렵다.
3. database package에 테스트 가능한 TypeScript waiter와 실행 command를
   두면 관찰된 일시 오류만 재시도하고 workflow는 command 하나만 호출한다.

세 번째 방식을 사용한다. 이미 database package가 RDS Data API SDK와 운영
연결 환경 변수를 소유하므로 책임 경계도 일치한다.

## 동작

`waitForDataApi`는 전달받은 probe를 최대 20회 실행하고 각 실패 사이에
5초를 기다린다. `DatabaseResumingException`이면 재개 진행 상황을 알리고
다시 시도한다. probe가 성공하면 즉시 끝내고 migration으로 넘어간다.

command는 `RDS_RESOURCE_ARN`, `RDS_SECRET_ARN`, `DATABASE_NAME`,
`AWS_REGION`을 읽어 RDS Data API로 `select 1`을 실행한다. workflow는
DataStack output을 환경 변수로 등록한 다음 이 command를 실행하고, 성공한
경우에만 기존 Drizzle migration을 실행한다.

## 오류 경계

재시도 대상은 실제 관찰한 `DatabaseResumingException`만 허용한다. IAM
거부, 잘못된 Secret, 잘못된 DB 이름과 그 밖의 오류는 기다려도 해결되지
않으므로 첫 실패를 그대로 반환한다. 20회 안에 준비되지 않으면 마지막
`DatabaseResumingException`을 반환해 API·Edge 배포를 중단한다.

## 테스트와 검증

단위 테스트는 재개 오류 뒤 성공, 비일시 오류의 즉시 실패, 최대 시도 초과를
각각 검증한다. workflow 연결 후 database test·typecheck, 전체 `pnpm check`,
CDK synth를 실행한다. 실제 Aurora에는 command만 실행해 준비 확인이
성공하는지 검증하고 migration 자체는 production workflow가 실행하게 한다.

재배포 전에는 서울·버지니아 CDK bootstrap, Route 53 hosted zone과 도메인,
현재 CloudFormation 상태, `cdk diff`의 replacement·deletion 여부를
읽기 전용으로 확인한다.
