# Lambda 예약 동시성을 설정하자 Application stack 생성이 실패함

> 교훈: 예약 동시성의 합만 계산하지 말고 계정·리전 할당량과 AWS가 요구하는 미예약 최소치까지 포함해 배포 가능성을 확인하라.

- 날짜: 2026-07-22 · 영역: infra · 커밋: 없음

## 주요 개념

### Lambda와 동시 실행

AWS Lambda는 요청이 들어올 때 미리 배포한 함수 코드를 실행하는 서비스다. 한
요청을 처리 중인 함수 실행 하나를 동시 실행 하나로 센다. 동시 실행 한도가
10이면 같은 순간에 최대 10개의 Lambda 실행 환경을 사용할 수 있다는 뜻이지,
함수가 총 10번만 실행된다는 뜻은 아니다.

이 프로젝트에서는 NestJS API와 비동기 작업 worker를 Lambda로 배포한다. 실제
트래픽이 아직 없어도 CloudFormation이 함수에 예약 동시성을 설정하는 순간 계정
할당량 규칙을 검사한다.

### 계정 동시 실행 할당량과 예약 동시성

계정 동시 실행 할당량은 한 AWS 계정이 한 리전에서 모든 Lambda 함수에 함께 쓸 수
있는 최대 동시 실행 수다. 예약 동시성은 그 공용 한도 중 일부를 특정 함수 몫으로
미리 떼어 두는 설정이다.

AWS는 예약하지 않은 다른 함수도 실행할 수 있도록 공용 풀에 최소 10을 남기도록
요구한다. 이 최소치는 프로젝트가 낮추는 설정이 아니다. 따라서 계정 할당량이
10인 상태에서는 1이라도 예약하면 공용 풀이 10보다 작아져 예약 설정 자체가
거부된다.

### 기본 할당량과 적용된 할당량

Service Quotas 화면의 “AWS 기본 할당량 값”은 일반적인 기본값이고, “적용된 계정
수준 할당량 값”은 현재 계정에 실제로 적용되는 값이다. 당시 화면에는 기본값
1,000과 적용값 10이 함께 표시돼 혼동이 생겼다.

배포 가능성을 판단할 때는 기본값 1,000이 아니라 서울 리전의 적용값 10을 사용해야
했다.

## 증상

1. `FlexThiaApplicationProd`가 비동기 작업 Lambda `AsyncJobs/FoundationTask`를 생성하던 중 실패했다.
2. 다른 SQS, SES, 인증 Lambda 생성도 취소되고 stack은 `ROLLBACK_COMPLETE`가 됐다.
3. CloudFormation은 아래 오류를 반환했다.

    ```text
    Specified ReservedConcurrentExecutions for function decreases account's
    UnreservedConcurrentExecution below its minimum value of [10].
    ```

## 원인

1. 인프라는 API Lambda에 5, 두 비동기 작업 Lambda에 각각 2의 예약 동시성을 두도록 설계됐다.
2. 서울 리전 계정에 실제 적용된 Lambda 동시 실행 할당량은 당시 10이었다.
3. 첫 예약 동시성을 적용하면 미예약 공용 풀이 10보다 작아져 AWS의 최소 미예약 수량 규칙을 위반했다.
4. Service Quotas에 보인 AWS 기본값 1,000이 이미 계정에 적용됐을 것이라는 초기 판단이 잘못됐다.

## 어떻게 찾았나

1. CloudFormation 이벤트에서 여러 `CREATE_FAILED` 중 최초 원인이 `AsyncJobsFoundationTask0D31083D`임을 확인했다.
2. 오류의 `UnreservedConcurrentExecution below its minimum value of [10]`을 보고 코드 번들이나 IAM이 아니라 할당량 경계로 범위를 좁혔다.
3. Lambda Service Quotas 상세 화면에서 `AWS 기본 할당량 값`은 1,000이지만 `적용된 계정 수준 할당량 값`은 10임을 확인했다.
4. 처음에는 화면의 1,000을 현재 값으로 잘못 읽었으나 두 값을 구분한 뒤 배포 오류와 정확히 일치함을 확인했다.

## 해결

1. 서울 `ap-northeast-2` 리전의 `Concurrent executions` 계정 할당량을 10에서 1,000으로 늘리는 요청을 제출했다.
2. AWS가 요청을 승인해 적용값이 1,000으로 바뀐 뒤 같은 예약 동시성 설계를 다시 배포했다.
3. 예약 동시성 9를 배정해도 미예약 공용 풀이 991이므로 최소 10 규칙을 만족했고 Application stack 생성이 다음 단계로 진행됐다.
4. 코드의 예약 동시성을 모두 제거하는 방법은 비용과 과부하 상한이라는 기존 설계 목적을 없애므로 사용하지 않았다.

